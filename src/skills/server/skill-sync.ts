import { managerHomePath, rootByKey } from "./source-roots.js";
import { writeFileAtomically, pathIdentity, MAX_SOURCE_DEPTH, lstatOrNull, pathsOverlap, codedError, isDirectoryLink, copyToTemporary, attachCode } from "./file-operations.js";
import { MAX_UPLOAD_ENTRIES, MAX_UPLOAD_TOTAL_BYTES } from "./upload-import.js";
import { hostAcceptableSkillName, KEBAB_RE } from "./skill-document.js";
import { projectRoots } from "./workspaces.js";
import { checkedWritableRootDefinition, readonlyError } from "./root-access.js";
import { scanEntries } from "./skill-scan.js";
import { deleteSkill } from "./trash.js";
import { join } from "node:path";
import { promises as fs } from "node:fs";
import type { SkillRoot, SkillEntry, SkillSync, SyncOptions, OperationError, SyncInput, Log, SyncResult, SyncFailure, CodedError } from "../types.js";
import { createHash } from "node:crypto";
// ── 同步：把其他 Agent 的技能复制到 DSH ─────────────────────────────────────────
// 外部 Agent 目录只读。同步是一次性复制：记录来源与内容摘要，之后源变化只标成「源已更新」，
// 由用户手动再同步；覆盖前旧版本先进回收站。

export interface SyncRecord { sourceRoot: string; sourceName: string; sourceHash: string; syncedAt: string }

export function syncRecordsPath() {
  return join(managerHomePath(), "sync-records.json");
}

export async function readSyncRecords(): Promise<Record<string, SyncRecord>> {
  try {
    const parsed = JSON.parse(await fs.readFile(syncRecordsPath(), "utf8"));
    const records = parsed && typeof parsed === "object" && parsed.records;
    return records && typeof records === "object" && !Array.isArray(records) ? records : {};
  } catch {
    return {};
  }
}

export async function writeSyncRecords(records: Record<string, SyncRecord>) {
  await fs.mkdir(managerHomePath(), { recursive: true });
  await writeFileAtomically(syncRecordsPath(), `${JSON.stringify({ version: 1, records }, null, 2)}\n`);
}

export function syncRecordKey(targetRoot: SkillRoot, name: string) {
  return `${pathIdentity(targetRoot.path)}::${name}`;
}

/** 目录或单文件的内容摘要；含符号链接或超限时返回 null，调用方按「无法比较」处理。 */
export async function digestPath(path: string): Promise<string | null> {
  try {
    const st = await fs.lstat(path);
    if (st.isSymbolicLink()) return null;
    const hash = createHash("sha256");
    if (st.isFile()) {
      hash.update(await fs.readFile(path));
      return hash.digest("hex");
    }
    if (!st.isDirectory()) return null;
    const files: [string, string][] = [];
    let count = 0;
    let size = 0;
    const walk = async (dir: string, prefix: string, depth: number) => {
      if (depth > MAX_SOURCE_DEPTH) throw new Error("too deep");
      for (const item of await fs.readdir(dir, { withFileTypes: true })) {
        if (item.isSymbolicLink()) throw new Error("symlink");
        const full = join(dir, item.name);
        if (item.isDirectory()) { await walk(full, `${prefix}${item.name}/`, depth + 1); continue; }
        if (!item.isFile()) continue;
        const info = await fs.stat(full);
        if (++count > MAX_UPLOAD_ENTRIES || (size += info.size) > MAX_UPLOAD_TOTAL_BYTES) throw new Error("too large");
        files.push([`${prefix}${item.name}`, createHash("sha256").update(await fs.readFile(full)).digest("hex")]);
      }
    };
    await walk(path, "", 0);
    files.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return hash.update(JSON.stringify(files)).digest("hex");
  } catch {
    return null;
  }
}

/** 同步到 DSH 后使用的名称：宿主可接受的 kebab-case 声明名；不可用于同步的条目返回 null。 */
export function syncTargetName(entry: SkillEntry): string | null {
  if (!entry.loadable || entry.name === ".") return null;
  const name = hostAcceptableSkillName(entry.declaredName);
  return name && KEBAB_RE.test(name) ? name : null;
}

/** 复制来源：bundle 取整个技能目录，flat 取单个 .md。 */
export function syncSourcePath(entry: SkillEntry) {
  return entry.kind === "bundle" ? entry.realEntryPath : entry.realDocPath;
}

export async function existingTargetPaths(rootPath: string, name: string) {
  const found: string[] = [];
  for (const path of [join(rootPath, name), join(rootPath, `${name}.md`)]) {
    if (await lstatOrNull(path)) found.push(path);
  }
  return found;
}

/** 目标目录：用户级同步到 ~/.dsh/skills，项目级同步到同一项目的 .dsh/skills。 */
export function syncTargetFor(source: SkillRoot, projectRootsList: SkillRoot[]): SkillRoot | undefined {
  if (source.scope === "project")
    return projectRootsList.find((item) => item.kind === "project-dsh" && item.projectRoot === source.projectRoot);
  return rootByKey("dsh") || undefined;
}

export async function syncStatusFor(
  source: SkillRoot,
  entry: SkillEntry,
  target: SkillRoot | undefined,
  records: Record<string, SyncRecord>,
): Promise<SkillSync | undefined> {
  const name = syncTargetName(entry);
  if (!target || !name) return undefined;
  const ref = { root: target.key, name };
  const existing = await existingTargetPaths(target.path, name);
  if (!existing.length) return { status: "unsynced", target: ref };
  if (existing.length > 1) return { status: "exists", target: ref };
  const sourceDigest = await digestPath(syncSourcePath(entry));
  const targetDigest = await digestPath(existing[0]);
  if (sourceDigest && targetDigest && sourceDigest === targetDigest) return { status: "synced", target: ref };
  const record = records[syncRecordKey(target, name)];
  if (record && record.sourceRoot === source.key && record.sourceName === entry.name)
    return { status: sourceDigest && record.sourceHash === sourceDigest ? "synced" : "outdated", target: ref };
  return { status: "exists", target: ref };
}

/** 找到可同步的外部来源；DSH 自有目录不是同步来源。 */
export async function externalSourceRoot(key: unknown, options: SyncOptions): Promise<{ source: SkillRoot; scoped: SkillRoot[] } | OperationError> {
  const invalid: OperationError = { ok: false, error: `不是可同步的外部 Agent 来源: ${String(key)}`, code: "error.sync.source", params: { root: String(key) } };
  if (typeof key !== "string" || !key) return invalid;
  const scoped = await projectRoots(options.projectCwds);
  const source = rootByKey(key) || scoped.find((item) => item.key === key);
  if (!source || source.native) return invalid;
  return { source, scoped };
}

/**
 * 把外部 Agent 的技能复制到 DSH。默认遇到同名技能跳过；overwrite 时旧版本先移入回收站。
 * 来源保持只读，不使用符号链接，复制先落临时目录再切换。
 */
export async function syncSkills(input: SyncInput, log?: Log, options: SyncOptions = {}): Promise<SyncResult> {
  const resolved = await externalSourceRoot(input && input.root, options);
  if ("ok" in resolved) return resolved;
  const { source, scoped } = resolved;
  const targetRoot = syncTargetFor(source, scoped);
  const target = targetRoot ? await checkedWritableRootDefinition(targetRoot) : null;
  if (!target || target.ok === false) return (target as OperationError | null) || readonlyError("create");
  const overwrite = input.overwrite === true;
  const wanted = input.all === true
    ? null
    : Array.isArray(input.names) ? new Set(input.names.filter((item): item is string => typeof item === "string")) : new Set<string>();
  if (wanted && wanted.size === 0)
    return { ok: false, error: "请选择要同步的技能", code: "error.sync.empty" };

  const scan = await scanEntries(source);
  const entries = scan.entries.filter((entry) => !wanted || wanted.has(entry.name));
  const synced: NonNullable<SyncResult["synced"]> = [];
  const skipped: NonNullable<SyncResult["skipped"]> = [];
  const failed: SyncFailure[] = [];
  if (wanted) {
    for (const name of wanted) {
      if (!scan.entries.some((entry) => entry.name === name))
        failed.push({ name, source: name, error: `技能不存在: ${name}`, code: "error.skill.notFound", params: { name } });
    }
  }
  const records = await readSyncRecords();
  const claimed = new Set<string>();
  let touched = false;

  for (const entry of entries) {
    const name = syncTargetName(entry);
    const from = syncSourcePath(entry);
    if (!name) {
      if (wanted) failed.push({ name: entry.name, source: from, error: `技能无法同步: ${entry.name}`, code: "error.sync.invalid", params: { name: entry.name } });
      else skipped.push({ name: entry.name, reason: "invalid" });
      continue;
    }
    if (claimed.has(name)) {
      failed.push({ name, source: from, error: `来源中存在多个同名技能: ${name}`, code: "error.import.duplicateName", params: { name } });
      continue;
    }
    claimed.add(name);
    const isDir = entry.kind === "bundle";
    const dest = isDir ? join(target.path, name) : join(target.path, `${name}.md`);
    try {
      if (await pathsOverlap(from, target.path)) throw codedError("同步来源不能与 DSH 技能目录相同、包含或位于其中", "error.import.overlap");
      if (await isDirectoryLink(join(target.path, name)))
        throw codedError(`目录链接不能删除或覆盖: ${join(target.path, name)}`, "error.skill.linked", { path: join(target.path, name) });
      const status = (await syncStatusFor(source, entry, target, records))?.status;
      if (status === "synced") { skipped.push({ name, reason: "synced" }); continue; }
      const existing = await existingTargetPaths(target.path, name);
      if (existing.length && !overwrite) { skipped.push({ name, reason: "exists" }); continue; }
      await fs.mkdir(target.path, { recursive: true });
      const sourceHash = await digestPath(from);
      const stage = await copyToTemporary(from, dest, isDir);
      try {
        if (existing.length) {
          const trashed = options.trash ? await options.trash(target, name) : await deleteSkill(target, name, log);
          if (trashed && typeof trashed === "object" && "ok" in trashed && (trashed as OperationError).ok === false) throw trashed;
        }
        await fs.rename(stage, dest);
      } catch (caught) {
        await fs.rm(stage, { recursive: true, force: true }).catch(() => undefined);
        throw caught;
      }
      touched = true;
      if (sourceHash) records[syncRecordKey(target, name)] = { sourceRoot: source.key, sourceName: entry.name, sourceHash, syncedAt: new Date().toISOString() };
      synced.push({ name, source: from, overwritten: existing.length > 0 });
      if (log) log(existing.length ? "sync-overwrite" : "sync", `同步 ${from} -> ${dest}`);
    } catch (caught) {
      const error = caught as CodedError & OperationError;
      failed.push(attachCode({ name, source: from, error: String(error && error.error ? error.error : error && error.message ? error.message : error) }, error));
    }
  }
  if (touched) await writeSyncRecords(records);
  if (failed.length && synced.length === 0 && skipped.length === 0)
    return { ok: false, error: failed.map((item) => item.error).join("；"), code: "error.sync.failed", synced, skipped, failed };
  return { synced, skipped, failed };
}
