import { readManagerState } from "./policy-store.js";
import { userRoots } from "./source-roots.js";
import { scanDeduplicatedRoots } from "./skill-scan.js";
import { effectiveSkillPolicy, markWinners } from "./policy.js";
import { projectRoots, sameWorkspace, nearestProjectRoot } from "./workspaces.js";
import { pathIdentity } from "./file-operations.js";
import { listTrash } from "./trash.js";
import { repositoryDestinations } from "./root-access.js";
import { readSyncRecords } from "./sync-records.js";
import { syncTargetFor, syncStatusFor } from "./skill-sync.js";
import type { ScopeOptions, ViewItem } from "./types.js";
import type { OperationError, Diagnostic } from "../model.js";
import type { RootView, SkillView } from "../contracts.js";
import { isAbsolute, basename } from "node:path";

/**
 * 展开某个已登记工作区：只扫描该项目，覆盖关系按该项目与用户级副本计算，
 * 不混入其他项目的来源。路径必须在登记列表内，否则与写入口一样拒绝。
 */
export async function workspaceSkills(workspace: unknown, registered: unknown) {
  const unregistered: OperationError = { ok: false, error: "请选择已登记的工作区", code: "error.workspace.unregistered" };
  if (typeof workspace !== "string" || !workspace.trim() || !isAbsolute(workspace.trim())) return unregistered;
  const requested = workspace.trim();
  const list = Array.isArray(registered)
    ? registered.filter((item): item is string => typeof item === "string" && isAbsolute(item))
    : [];
  if (!list.some((item) => sameWorkspace(item, requested))) return unregistered;
  const found = await nearestProjectRoot(requested);
  if (!found || !found.root)
    return { ok: false, error: `工作区目录不可用: ${requested}`, code: "error.workspace.unavailable", params: { path: requested } } as OperationError;
  const snapshot = await state({ projectCwds: [found.cwd] });
  const identity = pathIdentity(found.root);
  const roots = snapshot.roots.filter((root) => root.scope === "project" && root.projectRoot && pathIdentity(root.projectRoot) === identity);
  return {
    project: { root: found.root, name: basename(found.root) || found.root, workspaceCwds: [found.cwd] },
    roots,
    warnings: snapshot.warnings,
  };
}

export async function state(options: ScopeOptions = {}) {
  const user = userRoots();
  const userScans = await scanDeduplicatedRoots(user);
  const projectWarnings: Diagnostic[] = [];
  const scoped = await projectRoots(options.projectCwds, projectWarnings);
  const policyResult = await readManagerState();
  const trash = await listTrash();
  const result = {
    roots: [] as RootView[],
    // 创建、导入、仓库安装共用的用户级写入位置，由后端校验过可写性。
    writeDestinations: await repositoryDestinations(),
    projects: [] as { root?: string; name?: string; workspaceCwds?: string[] }[],
    summary: { total: 0, enabled: 0, disabled: 0, issues: 0 },
    trash,
    warnings: [
      ...(policyResult.warning ? [policyResult.warning] : []),
      ...projectWarnings,
    ],
  };
  const all: ViewItem[] = [];
  const syncRecords = await readSyncRecords();
  for (const root of [...scoped, ...user]) {
    const { exists, entries, truncated } =
      root.scope === "project"
        ? (await scanDeduplicatedRoots([root])).get(root.key)!
        : userScans.get(root.key)!;
    // 即使项目 .dsh/skills 尚不存在，也要把可写根返回给创建表单；只读项目根仍按实际存在性展示。
    if (root.scope === "project" && !exists && root.kind !== "project-dsh")
      continue;
    if (truncated)
      result.warnings.push({
        code: "warning.scan.truncated",
        params: { path: root.path },
        error: `技能扫描达到遍历上限，部分技能未显示: ${root.path}`,
      });
    const skills: SkillView[] = [];
    // View-and-sync only: other Agent directories are never loaded by DSH directly.
    const external = !root.native;
    const syncTarget = external ? syncTargetFor(root, scoped) : undefined;
    for (const e of entries) {
      const policy = effectiveSkillPolicy(policyResult, root, e);
      const managerEnabled =
        policyResult.writable !== false &&
        policy.sourceEnabled &&
        policy.override !== false;
      skills.push({
        name: e.name,
        declaredName: e.declaredName,
        kind: e.kind,
        description: e.description,
        modelInvocable: e.modelInvocable,
        userInvocable: e.userInvocable,
        invocationPolicyValid: e.invocationPolicyValid,
        hasFrontmatter: e.hasFrontmatter,
        loadable: e.loadable,
        enabled: policy.enabled,
        managerEnabled,
        managerOverride: policy.override === undefined ? null : policy.override,
        effectiveModelInvocable: policy.modelInvocable,
        effectiveUserInvocable: policy.userInvocable,
        diagnostics: e.diagnostics,
        path: e.docPath,
        categoryId: policyResult.state.categoryMembers[root.key]?.[e.name] || null,
        linked: e.linked === true,
        ...(external ? { sync: await syncStatusFor(root, e, syncTarget, syncRecords) } : {}),
      });
      if (external) continue;
      all.push({
        root,
        entry: e,
        managerEnabled,
        policy,
        view: skills[skills.length - 1],
      });
    }
    result.roots.push({
      key: root.key,
      ...(root.kind ? { kind: root.kind } : {}),
      ...(root.localeKey ? { localeKey: root.localeKey } : {}),
      path: root.path,
      label: root.label,
      mutable: root.mutable,
      toggleable: root.toggleable,
      native: root.native,
      rank: root.rank,
      scope: root.scope || "user",
      ...(root.projectRoot
        ? {
          projectRoot: root.projectRoot,
          projectName: root.projectName,
          workspaceCwds: root.workspaceCwds,
        }
        : {}),
      exists,
      truncated: truncated === true,
      enabled: external
        ? false
        : policyResult.writable !== false &&
        (root.kind === "project-dsh" ||
          policyResult.state.sources[root.key] !== false),
      skills,
      categories: policyResult.state.categories[root.key] || [],
      categoryOrder: policyResult.state.categoryOrder[root.key] || {},
    });
  }
  const userItems = all.filter((item) => item.root.scope !== "project");
  markWinners(userItems);
  const projectGroups = new Map<string | undefined, ViewItem[]>();
  for (const item of all.filter(
    (candidate) => candidate.root.scope === "project",
  )) {
    const group = projectGroups.get(item.root.projectRoot) || [];
    group.push(item);
    projectGroups.set(item.root.projectRoot, group);
  }
  for (const projectItems of projectGroups.values()) {
    // 用户级条目参与该 workspace 的优先级判定，但不把其全局视图标记为“被某项目覆盖”。
    const userCopies = userItems.map((item) => ({
      ...item,
      view: { ...item.view },
    }));
    markWinners([...projectItems, ...userCopies]);
  }
  const seenProjects = new Set();
  for (const root of result.roots.filter((item) => item.scope === "project")) {
    if (seenProjects.has(root.projectRoot)) continue;
    seenProjects.add(root.projectRoot);
    result.projects.push({
      root: root.projectRoot,
      name: root.projectName,
      workspaceCwds: root.workspaceCwds,
    });
  }
  // 保留既有 HTTP 摘要契约；页面可独立计算当前 Tab 的互斥状态统计。
  result.summary = {
    total: all.length,
    enabled: all.filter((item) => item.view.enabled === true).length,
    disabled: all.filter((item) => item.entry.loadable && item.policy.enabled === false).length,
    issues: all.reduce((count, item) => count + item.entry.diagnostics.length + (item.view.shadowedBy ? 1 : 0), 0),
  };
  return result;
}
