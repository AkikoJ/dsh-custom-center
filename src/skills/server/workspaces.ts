import type { WorkspaceRow } from "../contracts.js";
import { pathIdentity, lstatOrNull } from "./file-operations.js";
import { projectIdentity, PROJECT_SOURCES } from "./source-roots.js";
import { projectSourceSafe, checkedWritableRootDefinition } from "./root-access.js";
import { scanDeduplicatedRoots } from "./skill-scan.js";
import { isAbsolute, resolve, join, dirname, basename } from "node:path";
import { promises as fs } from "node:fs";
import type { Diagnostic, SkillRoot, OperationError } from "../model.js";
export async function nearestProjectRoot(cwd: string) {
  if (typeof cwd !== "string" || !isAbsolute(cwd)) return null;
  let start;
  try {
    start = await fs.realpath(resolve(cwd));
    if (!(await fs.stat(start)).isDirectory()) return null;
  } catch {
    return { unavailable: true, cwd };
  }
  let current = start;
  for (;;) {
    try {
      await fs.lstat(join(current, ".git"));
      return { root: current, cwd: start };
    } catch {
      /* 继续向上查找最近的项目根 */
    }
    const parent = dirname(current);
    // 与宿主一致：无 Git 标记时使用已校验的会话 cwd。
    if (parent === current) return { root: start, cwd: start };
    current = parent;
  }
}

/**
 * 从活动 Session cwd 推导项目技能根。只接受宿主上可解析的绝对目录，
 * 同一项目的多个 Session 会折叠到同一组稳定 key，避免跨 workspace 合并同名技能。
 */
export async function projectRoots(projectCwds: string[] = [], diagnostics?: Diagnostic[]): Promise<SkillRoot[]> {
  const projects = new Map<string, {root: string; cwds: Set<string>}>();
  for (const cwd of Array.isArray(projectCwds) ? projectCwds : []) {
    const found = await nearestProjectRoot(cwd);
    if (!found || !found.root) {
      if (
        found &&
        found.unavailable &&
        Array.isArray(diagnostics) &&
        typeof cwd === "string" &&
        isAbsolute(cwd)
      ) {
        diagnostics.push({
          code: "warning.project.unavailable",
          params: { path: cwd },
          error: `无法从宿主读取活动工作区，项目技能未显示: ${cwd}`,
        });
      }
      continue;
    }
    const identity = pathIdentity(found.root);
    const existing = projects.get(identity) || {
      root: found.root,
      cwds: new Set<string>(),
    };
    existing.cwds.add(found.cwd);
    projects.set(identity, existing);
  }
  const roots = [];
  for (const project of [...projects.values()].sort((a, b) =>
    a.root.localeCompare(b.root),
  )) {
    const id = projectIdentity(project.root);
    const common = {
      mutable: false,
      toggleable: false,
      native: true,
      scope: "project",
      projectRoot: project.root,
      projectName: basename(project.root) || project.root,
      workspaceCwds: [...project.cwds].sort(),
    };
    const candidates = PROJECT_SOURCES.map((source) => ({
      ...common,
      key: `project-${source.key}:${id}`,
      kind: `project-${source.key}`,
      localeKey: source.localeKey,
      path: join(project.root, source.directory, "skills"),
      label: source.label,
      rank: source.rank,
      mutable: source.mutable === true,
      native: source.native === true,
      toggleable: source.native === true,
    }));
    for (const candidate of candidates) {
      if (candidate.kind !== "project-dsh" && !(await lstatOrNull(candidate.path)))
        continue;
      if (await projectSourceSafe(candidate)) roots.push(candidate);
    }
  }
  return roots;
}

/** 工作区路径比较：与项目根同一套规范化，Windows 下不区分大小写。 */
export function sameWorkspace(a: string, b: string) {
  return pathIdentity(a) === pathIdentity(b);
}

export function createWorkspaceIndex(registered?: string[], hooks?: { onBuild?: () => void }) {
  let pending: Promise<Array<{ root: SkillRoot } | OperationError>> | undefined;
  return {
    registered,
    load() {
      if (!pending) {
        hooks?.onBuild?.();
        pending = indexRegisteredWorkspaces(registered);
      }
      return pending;
    },
  };
}

export async function indexRegisteredWorkspaces(registered?: string[]): Promise<Array<{ root: SkillRoot } | OperationError>> {
  const list = Array.isArray(registered) ? registered.filter((item): item is string => typeof item === "string") : [];
  const indexed: Array<{ root: SkillRoot } | OperationError> = [];
  for (const workspace of list) indexed.push(await resolveWorkspaceTarget(workspace, list));
  return indexed;
}

/**
 * 按安装记录里保存的项目根重新解析可写根。记录只保存路径，不代表授权：
 * 每次更新、回滚、卸载都要重新核对链接与重叠，路径失效时明确失败而不是回退到别处。
 * 批量调用可传入同一次请求里已经解析好的登记索引，避免每个记录都重走全部工作区。
 */
export async function projectRootForRecord(projectRoot: unknown, registered?: string[], indexed?: Array<{ root: SkillRoot } | OperationError>): Promise<{ root: SkillRoot } | OperationError> {
  if (typeof projectRoot !== "string" || !isAbsolute(projectRoot))
    return { ok: false, error: "安装记录中的工作区路径无效", code: "error.workspace.unavailable" };
  const saved = await nearestProjectRoot(projectRoot);
  if (!saved?.root || !sameWorkspace(saved.root, projectRoot))
    return { ok: false, error: `工作区目录不可用: ${projectRoot}`, code: "error.workspace.unavailable", params: { path: projectRoot } };
  for (const target of indexed ?? await indexRegisteredWorkspaces(registered)) {
    if ("root" in target && sameWorkspace(target.root.projectRoot!, projectRoot)) return target;
  }
  return { ok: false, error: "请选择已登记的工作区", code: "error.workspace.unregistered" };
}

/**
 * 把「已登记工作区」解析成可写的项目 DSH 根。
 * - 路径必须出现在宿主登记列表里；列表缺失或为空一律拒绝，不信任前端传来的路径。
 * - 项目根沿用 projectRoots 的规则：最近 Git 根，没有则用该目录。
 * - 只开放 .dsh/skills，沿用链接与用户目录重叠检查；解析本身不创建目录。
 */
export async function resolveWorkspaceTarget(
  workspace: unknown,
  registered: unknown,
): Promise<{ root: SkillRoot } | OperationError> {
  const unregistered: OperationError = {
    ok: false,
    error: "请选择已登记的工作区",
    code: "error.workspace.unregistered",
  };
  if (typeof workspace !== "string" || !workspace.trim() || !isAbsolute(workspace.trim())) return unregistered;
  const requested = workspace.trim();
  const list = Array.isArray(registered)
    ? registered.filter((item): item is string => typeof item === "string" && isAbsolute(item))
    : [];
  if (!list.some((item) => sameWorkspace(item, requested))) return unregistered;
  const found = await nearestProjectRoot(requested);
  if (!found || !found.root)
    return {
      ok: false,
      error: `工作区目录不可用: ${requested}`,
      code: "error.workspace.unavailable",
      params: { path: requested },
    };
  const source = PROJECT_SOURCES.find((item) => item.key === "dsh")!;
  const root: SkillRoot = {
    key: `project-dsh:${projectIdentity(found.root)}`,
    kind: "project-dsh",
    scope: "project",
    localeKey: source.localeKey,
    label: source.label,
    rank: source.rank,
    mutable: true,
    native: true,
    toggleable: true,
    path: join(found.root, source.directory, "skills"),
    projectRoot: found.root,
    projectName: basename(found.root) || found.root,
    workspaceCwds: [found.cwd],
  };
  const checked = await checkedWritableRootDefinition(root);
  if (!checked) return unregistered;
  if (checked.ok === false) return checked;
  return { root: checked as SkillRoot };
}

/** DSH、常见 Agent 与活动 Session 项目根的技能快照。 */
/** 项目页折叠行：一个项目根一行，只含名称、路径与技能数量，不读取技能正文。 */


/**
 * 按宿主登记的全部工作区生成折叠列表。子目录与仓库根解析到同一项目根时合并成一行；
 * 目录已不存在的登记项单独成行并标为不可用，不让整页失败。
 */
export async function listWorkspaces(registered: unknown): Promise<WorkspaceRow[]> {
  const paths = Array.isArray(registered)
    ? registered.filter((item): item is string => typeof item === "string" && isAbsolute(item))
    : [];
  const rows = new Map<string, WorkspaceRow & { roots: SkillRoot[] }>();
  for (const path of paths) {
    const found = await nearestProjectRoot(path);
    if (!found || !found.root) {
      const key = `missing:${pathIdentity(path)}`;
      if (!rows.has(key))
        rows.set(key, { name: basename(path) || path, path, registeredPaths: [path], available: false, skillCount: 0, roots: [] });
      continue;
    }
    const key = pathIdentity(found.root);
    const existing = rows.get(key);
    if (existing) {
      if (!existing.registeredPaths.some((item) => sameWorkspace(item, path))) existing.registeredPaths.push(path);
      continue;
    }
    rows.set(key, {
      name: basename(found.root) || found.root,
      path: found.root,
      projectRoot: found.root,
      registeredPaths: [path],
      available: true,
      skillCount: 0,
      roots: await projectRoots([found.cwd]),
    });
  }
  for (const row of rows.values()) {
    if (row.roots.length) {
      // 折叠行只需要数量：走仅元数据扫描，不解析正文。
      const scans = await scanDeduplicatedRoots(row.roots, { metadataOnly: true });
      row.skillCount = [...scans.values()].reduce((total, scan) => total + scan.entries.length, 0);
    }
  }
  return [...rows.values()]
    .map(({ roots: _roots, ...row }) => row)
    .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}
