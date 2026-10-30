import { projectSourceDefinition, rootDefinition, rootByKey, dshRootPath, projectIdentity, userRoots, PROJECT_ROOT_KEY_RE } from "./source-roots.js";
import { lstatOrNull, comparisonPath, isSameOrDescendant } from "./file-operations.js";
import type { SkillRoot, OperationError, Diagnostic, CodedError } from "../model.js";
import type { RootInput } from "./types.js";
import type { RepositoryDestination } from "../contracts.js";
import { join, resolve, isAbsolute, dirname } from "node:path";
export async function projectSourceSafe(definition: SkillRoot) {
  // 只读来源允许目录链接，但重叠来源会绕过用户根的停用策略。
  const source = projectSourceDefinition(definition.kind);
  if (!source) return false;
  if (!source.mutable)
    return !(await overlapsUserSkillRoot(definition.path));
  const container = join(
    definition.projectRoot!,
    source.directory,
  );
  for (const path of [container, definition.path]) {
    const st = await lstatOrNull(path);
    if (st && (!st.isDirectory() || st.isSymbolicLink())) return false;
  }
  return !(await overlapsUserSkillRoot(definition.path));
}

/** 只读来源的拒绝结果；action 为可翻译语义值（toggle/delete）。 */
export function readonlyError(action: string): OperationError {
  return {
    ok: false,
    code: "error.root.readonly",
    params: { action },
    error:
      action === "delete"
        ? "该技能来源不允许删除"
        : "该技能来源不允许启用或停用",
  };
}

/** 只允许用户 DSH、Shared Agent，或由活动 Session 推导出的项目 DSH 根参与文件写入。 */
export function writableRootDefinition(root: RootInput) {
  const definition = rootDefinition(root);
  // Shared Agent 统一开放管理，但仍必须是当前配置的规范目录。
  if (definition?.key === "agents") {
    const canonical = rootByKey("agents");
    return canonical && resolve(definition.path) === resolve(canonical.path)
      ? canonical
      : null;
  }
  if (!definition || definition.mutable !== true) return null;
  if (definition.key === "dsh")
    return resolve(definition.path) === resolve(dshRootPath())
      ? rootByKey("dsh")
      : null;
  if (
    definition.scope !== "project" ||
    definition.kind !== "project-dsh" ||
    typeof definition.projectRoot !== "string" ||
    !isAbsolute(definition.projectRoot!) ||
    definition.key !==
      `project-dsh:${projectIdentity(definition.projectRoot!)}` ||
    resolve(definition.path) !==
      resolve(join(definition.projectRoot!, ".dsh", "skills"))
  )
    return null;
  return definition;
}

/** 用户级安装目标及 Shared Agent 普通写入均禁止祖先目录链接。 */
export async function checkedUserRootAncestors(definition: SkillRoot): Promise<SkillRoot | OperationError> {
  for (let path = resolve(definition.path); ; path = dirname(path)) {
    const st = await lstatOrNull(path);
    if (st && (!st.isDirectory() || st.isSymbolicLink()))
      return { ok: false, error: `技能目录不安全，拒绝写入: ${path}`, code: "error.root.unsafe", params: { path } };
    if (dirname(path) === path) break;
  }
  return definition;
}

export async function checkedWritableRootDefinition(root: RootInput): Promise<SkillRoot | OperationError | null | undefined> {
  const definition = writableRootDefinition(root);
  if (definition?.key === "agents") return checkedUserRootAncestors(definition);
  if (!definition || definition.scope !== "project") return definition;
  if (await overlapsUserSkillRoot(definition.path)) {
    return {
      ok: false,
      error: `项目技能目录与用户技能目录重叠，拒绝写入: ${definition.path}`,
      code: "error.root.unsafe",
      params: { path: definition.path },
    };
  }
  // 项目仓库内容不可信；拒绝通过 .dsh 或 skills 链接把写入重定向到项目之外。
  for (const path of [join(definition.projectRoot!, ".dsh"), definition.path]) {
    const st = await lstatOrNull(path);
    if (st && (!st.isDirectory() || st.isSymbolicLink())) {
      return {
        ok: false,
        error: `项目技能目录不安全，拒绝写入: ${path}`,
        code: "error.root.unsafe",
        params: { path },
      };
    }
  }
  return definition;
}

/** 仓库安装目标统一检查祖先路径；不改变普通 DSH 管理对迁移 Home 的兼容。 */
export async function checkedRepositoryRootDefinition(root: RootInput): Promise<SkillRoot | OperationError | null | undefined> {
  const definition = await checkedWritableRootDefinition(root);
  if (!definition || definition.ok === false || definition.scope === "project" || definition.key === "agents") return definition;
  return checkedUserRootAncestors(definition);
}

/** 仓库可选的安装位置：全局 DSH，以及已配置的公共 Agent 目录。 */
export async function repositoryDestinations(): Promise<RepositoryDestination[]> {
  const result: RepositoryDestination[] = [];
  for (const root of userRoots().filter(item => item.key === "dsh" || item.key === "agents")) {
    let error: Diagnostic | undefined;
    try {
      const checked = await checkedRepositoryRootDefinition(root);
      if (!checked || checked.ok === false) error = checked || { code: "error.root.unsafe", error: "技能安装位置不可用" };
    } catch (caught) { const exception = caught as CodedError; error = { code: "error.root.unsafe", error: exception.message, params: { path: root.path } }; }
    result.push({ key: root.key as RepositoryDestination['key'], path: resolve(root.path), label: root.label, localeKey: root.localeKey, available: !error, ...(error ? { error } : {}) });
  }
  return result;
}

export async function overlapsUserSkillRoot(path: string) {
  const candidate = await comparisonPath(path);
  for (const root of userRoots()) {
    const userPath = await comparisonPath(root.path);
    if (
      isSameOrDescendant(candidate, userPath) ||
      isSameOrDescendant(userPath, candidate)
    )
      return true;
  }
  return false;
}

export async function checkedPolicyRootDefinition(root: RootInput): Promise<SkillRoot | OperationError | null> {
  const definition = rootDefinition(root);
  if (!definition || !definition.toggleable) return null;
  if (definition.scope !== "project") {
    const canonical = rootByKey(definition.key);
    return canonical && resolve(canonical.path) === resolve(definition.path)
      ? canonical
      : null;
  }
  const source = projectSourceDefinition(definition.kind);
  const validProjectRoot =
    source &&
    PROJECT_ROOT_KEY_RE.test(definition.key) &&
    typeof definition.projectRoot === "string" &&
    isAbsolute(definition.projectRoot!) &&
    definition.key ===
      `${definition.kind}:${projectIdentity(definition.projectRoot!)}` &&
    resolve(definition.path) ===
      resolve(
        join(
          definition.projectRoot!,
          source.directory,
          "skills",
        ),
      );
  if (!validProjectRoot) return null;
  if (!(await projectSourceSafe(definition))) {
    return {
      ok: false,
      error: `项目技能目录不安全，拒绝写入状态: ${definition.path}`,
      code: "error.root.unsafe",
      params: { path: definition.path },
    };
  }
  return definition;
}
