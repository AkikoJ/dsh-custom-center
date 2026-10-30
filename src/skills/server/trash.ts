import type { TrashMetadata } from "../contracts.js";
import { entryPath, renameWithRetry, TRANSIENT_RENAME_CODES, safeExistingEntryPaths, lstatOrNull, isDirectoryLink, linkedWriteError, codedError, movePathWithFallback, isSameOrDescendant } from "./file-operations.js";
import { trashRootPath, rootByKey } from "./source-roots.js";
import { checkedWritableRootDefinition, readonlyError } from "./root-access.js";
import { projectRootForRecord, projectRoots } from "./workspaces.js";
import { resolveEntry } from "./entry-access.js";
import { validStateSkillName, readManagerState, writeManagerState } from "./policy-store.js";
import { promises as fs } from "node:fs";
import { join, isAbsolute } from "node:path";
import type { RenameOptions, MutationOptions, RootInput, Log } from "./types.js";
import type { CodedError, SkillRoot, OperationError } from "../model.js";
import { randomUUID } from "node:crypto";
export async function readTrashMetadata(id: string): Promise<TrashMetadata | null> {
  if (entryPath(trashRootPath(), id) === null) return null;
  try {
    const value: TrashMetadata = JSON.parse(
      await fs.readFile(join(trashRootPath(), id, "metadata.json"), "utf8"),
    );
    if (
      !value ||
      value.id !== id ||
      typeof value.name !== "string" ||
      !Array.isArray(value.entries)
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * Windows Defender / 索引器可能持续占用刚写入的 stage 目录，导致容器目录 rename
 * 在短重试窗口后仍返回 EPERM。此时保留 stage 作为唯一可回滚副本，逐项复制到最终目录，
 * 并最后写 metadata：listTrash() 在复制完整前不会暴露半成品。
 */
export async function publishTrashStage(stage: string, finalPath: string, metadata: TrashMetadata, renameOptions?: RenameOptions) {
  try {
    await renameWithRetry(stage, finalPath, renameOptions);
    return { fallback: false, cleanupError: null };
  } catch (caught) {
    const error = caught as CodedError;
    if (!TRANSIENT_RENAME_CODES.has(error && error.code || "")) throw error;
  }

  await fs.mkdir(finalPath);
  try {
    for (const fileName of metadata.entries) {
      await fs.cp(join(stage, fileName), join(finalPath, fileName), {
        recursive: true,
        dereference: false,
        errorOnExist: true,
        force: false,
      });
    }
    await fs.writeFile(
      join(finalPath, "metadata.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8",
    );
  } catch (caught) {
    const error = caught as CodedError;
    await fs
      .rm(finalPath, { recursive: true, force: true })
      .catch(() => undefined);
    throw error;
  }

  let cleanupError = null;
  try {
    await fs.rm(stage, { recursive: true, force: true });
  } catch (caught) {
    const error = caught as CodedError;
    cleanupError = error;
  }
  return { fallback: true, cleanupError };
}

export function trashRootMetadata(definition: SkillRoot) {
  if (definition.scope !== "project" && rootByKey(definition.key))
    return { key: definition.key, scope: "user", label: definition.label, ...(definition.localeKey ? { localeKey: definition.localeKey } : {}) };
  return {
    key: definition.key,
    scope: "project",
    kind: "project-dsh",
    projectRoot: definition.projectRoot!,
    projectName: definition.projectName,
    label: definition.label,
  };
}

export async function restoreRootDefinition(metadata: TrashMetadata, options: MutationOptions = {}): Promise<SkillRoot | OperationError | null | undefined> {
  // version 1 entries predate scoped Trash and always belong to $DSH_HOME/skills.
  if (!metadata.root) return rootByKey("dsh");
  if (metadata.root.scope === "user" && rootByKey(metadata.root.key))
    return checkedWritableRootDefinition(rootByKey(metadata.root.key));
  if (
    metadata.root.scope !== "project" ||
    metadata.root.kind !== "project-dsh" ||
    typeof metadata.root.key !== "string" ||
    typeof metadata.root.projectRoot !== "string" ||
    !isAbsolute(metadata.root.projectRoot)
  )
    return {
      ok: false,
      error: `回收站条目来源非法: ${metadata.id}`,
      code: "error.trash.invalid",
      params: { id: metadata.id },
    };
  const target = await projectRootForRecord(metadata.root.projectRoot, options.registeredWorkspaces);
  if (!("root" in target)) return target;
  const scopedRoots = options.projectCwds === undefined ? null : await projectRoots(options.projectCwds);
  const root = target.root.key === metadata.root.key && (!scopedRoots || scopedRoots.some(item => item.key === target.root.key)) ? target.root : null;
  if (!root) {
    return {
      ok: false,
      error: `原项目当前不在活动工作区中，无法恢复: ${metadata.root.projectRoot}`,
      code: "error.trash.projectUnavailable",
      params: { path: metadata.root.projectRoot },
    };
  }
  return checkedWritableRootDefinition(root);
}

/** 把用户或活动项目的 DSH 根中的单个技能移入 manager-owned 回收站。 */
export async function deleteSkill(root: RootInput, name: string, log?: Log, options: MutationOptions = {}) {
  const definition = await checkedWritableRootDefinition(root);
  if (definition && definition.ok === false) return definition;
  if (!definition) return readonlyError("delete");
  const resolved = await resolveEntry(definition, name);
  if (resolved === null)
    return {
      ok: false,
      error: `技能不存在: ${name}`,
      code: "error.skill.notFound",
      params: { name },
    };
  const targets = await safeExistingEntryPaths(definition.path, name);
  if (!targets.length) return { ok: false, error: `技能不存在: ${name}`, code: "error.skill.notFound", params: { name } };
  if (definition.key === "agents") {
    for (const target of targets) {
      if ((await lstatOrNull(target.path))?.isSymbolicLink())
        return { ok: false, error: `技能目录不安全，拒绝写入: ${target.path}`, code: "error.root.unsafe", params: { path: target.path } };
    }
  } else {
    const bundle = entryPath(definition.path, name);
    if (bundle && (await isDirectoryLink(bundle))) return linkedWriteError(bundle);
  }
  const id = `${Date.now()}-${randomUUID()}`;
  if (!/^\d+-[a-f0-9-]{36}$/.test(id)) throw codedError("回收站条目编号非法", "error.trash.invalid", { id });
  const trashRoot = trashRootPath();
  const stage = join(trashRoot, `.stage-${randomUUID()}`);
  const finalPath = join(trashRoot, id);
  const moved = [];
  await fs.mkdir(stage, { recursive: true });
  try {
    for (const target of targets) {
      const destination = join(stage, target.fileName);
      const transferred = await movePathWithFallback(
        target.path,
        destination,
        options.renameOptions,
      );
      if (transferred.cleanupError && log)
        log(
          "trash-source-warning",
          `技能已跨盘移入回收站，但源盘隐藏副本等待后续清理: ${transferred.quarantine}（${transferred.cleanupError.message || transferred.cleanupError}）`,
        );
      moved.push({ ...target, destination });
    }
    const metadata = {
      version: 2,
      id,
      name,
      deletedAt: new Date().toISOString(),
      entries: moved.map((item) => item.fileName),
      root: trashRootMetadata(definition),
    };
    await fs.writeFile(
      join(stage, "metadata.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8",
    );
    const published = await publishTrashStage(
      stage,
      finalPath,
      metadata,
      options.renameOptions,
    );
    if (published.cleanupError && log)
      log(
        "trash-stage-warning",
        `回收站已发布，但临时目录等待后续清理: ${stage}（${published.cleanupError.message || published.cleanupError}）`,
      );
    if (log) log("trash", `移到回收站 ${name} -> ${finalPath}`);
    return { id, name, deletedAt: metadata.deletedAt, root: metadata.root };
  } catch (caught) {
    const error = caught as CodedError;
    const rollbackFailures = [];
    for (const item of moved.reverse()) {
      try {
        await movePathWithFallback(
          item.destination,
          item.path,
          options.renameOptions,
        );
      } catch (caught) { const rollbackError = caught as CodedError;
        rollbackFailures.push({
          path: item.destination,
          error: String(
            rollbackError && rollbackError.message
              ? rollbackError.message
              : rollbackError,
          ),
        });
      }
    }
    if (rollbackFailures.length) {
      const causeText = String(error && error.message ? error.message : error);
      throw codedError(
        `${causeText}；移入回收站回滚失败，未恢复内容保留在: ${stage}`,
        "error.trash.rollbackFailed",
        { path: stage, error: causeText },
      );
    }
    await fs.rm(stage, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function listTrash() {
  let items;
  try {
    items = await fs.readdir(trashRootPath(), { withFileTypes: true });
  } catch {
    return [];
  }
  const result = [];
  for (const item of items) {
    if (!item.isDirectory() || item.name.startsWith(".")) continue;
    const metadata = await readTrashMetadata(item.name);
    if (metadata) result.push(metadata);
  }
  return result.sort((a, b) =>
    String(b.deletedAt).localeCompare(String(a.deletedAt)),
  );
}

export async function restoreTrash(id: string, log?: Log, options: MutationOptions = {}) {
  const metadata = await readTrashMetadata(id);
  if (!metadata)
    return {
      ok: false,
      error: `回收站条目不存在: ${id}`,
      code: "error.trash.notFound",
      params: { id },
    };
  const definition = await restoreRootDefinition(metadata, options);
  if (!definition || definition.ok === false)
    return definition || readonlyError("restore");
  const root = definition.path;
  const conflicts = await safeExistingEntryPaths(root, metadata.name);
  if (conflicts.length)
    return {
      ok: false,
      error: `无法恢复，同名技能已存在: ${metadata.name}`,
      code: "error.trash.conflict",
      params: { name: metadata.name },
    };
  await fs.mkdir(root, { recursive: true });
  const itemRoot = join(trashRootPath(), id);
  const moved = [];
  let committed = false;
  try {
    for (const fileName of metadata.entries) {
      const source = join(itemRoot, fileName);
      const destination = join(root, fileName);
      if (
        !isSameOrDescendant(itemRoot, source) ||
        !isSameOrDescendant(root, destination)
      )
        throw codedError("回收站条目路径非法", "error.trash.invalid", { id });
      await movePathWithFallback(source, destination, options.renameOptions);
      moved.push({ source, destination });
    }
    await fs.rm(itemRoot, { recursive: true, force: true });
    committed = true;
    if (log) log("restore", `从回收站恢复 ${metadata.name} -> ${root}`);
    return { id, name: metadata.name, root: trashRootMetadata(definition) };
  } catch (caught) {
    const error = caught as CodedError;
    if (committed) throw error;
    for (const item of moved.reverse())
      await movePathWithFallback(
        item.destination,
        item.source,
        options.renameOptions,
      ).catch(() => undefined);
    throw error;
  }
}

export async function forgetCategoryMember(metadata: TrashMetadata) {
  // 回收站目录已经删除。这里单独再写一次状态；写入失败时成员记录会留下，同名新建可能回到旧分类。不再回滚已删除的回收站目录。
  const key = metadata.root?.key;
  if (!key || !validStateSkillName(metadata.name)) return;
  const current = await readManagerState();
  if (current.writable === false) return;
  const members = current.state.categoryMembers[key];
  const orders = current.state.categoryOrder[key];
  const hasMember = !!(members && members[metadata.name]);
  const hasOrder = !!(orders && Object.values(orders).some((names) => names.includes(metadata.name)));
  if (!hasMember && !hasOrder) return;
  if (members) delete members[metadata.name];
  if (orders) {
    for (const id of Object.keys(orders))
      orders[id] = orders[id].filter((name) => name !== metadata.name);
  }
  await writeManagerState(current.state);
}

export async function permanentlyDeleteTrash(id: string, log?: Log) {
  const metadata = await readTrashMetadata(id);
  if (!metadata)
    return {
      ok: false,
      error: `回收站条目不存在: ${id}`,
      code: "error.trash.notFound",
      params: { id },
    };
  await fs.rm(join(trashRootPath(), id), { recursive: true, force: true });
  await forgetCategoryMember(metadata);
  if (log) log("trash-delete", `永久删除回收站条目 ${metadata.name} (${id})`);
  return { id, name: metadata.name };
}
