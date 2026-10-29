import { readManagerState } from "./server/policy-store.js";
import { userRoots, USER_DSH_POLICY_RANK, rootByKey, PROJECT_ROOT_KEY_RE } from "./server/source-roots.js";
import { scanDeduplicatedRoots } from "./server/skill-scan.js";
import { effectiveSkillPolicy, groupLoadableSkillsByName, selectSkillWinner, canonicalSkillName, markWinners } from "./server/policy.js";
import { projectRoots, sameWorkspace, nearestProjectRoot, createWorkspaceIndex, indexRegisteredWorkspaces, projectRootForRecord, resolveWorkspaceTarget, listWorkspaces } from "./server/workspaces.js";
import { KEBAB_RE, parseSkillDoc, entryOf, toKebab } from "./server/skill-document.js";
import { resolveEntry } from "./server/entry-access.js";
import { pathIdentity } from "./server/file-operations.js";
import { listTrash } from "./server/trash.js";
import { repositoryDestinations } from "./server/root-access.js";
import { readSyncRecords, syncTargetFor, syncStatusFor } from "./server/skill-sync.js";
import type { ScopeOptions, OperationError, Diagnostic, RootView, ViewItem, SkillView } from "./types.js";
import { resolve, isAbsolute, basename } from "node:path";
import { promises as fs } from "node:fs";
/** 选择未停用的最高优先级副本；全部停用时保留原生覆盖或显式禁用阻断。 */
export async function listProviderCandidates(options: ScopeOptions = {}) {
  const policyResult = await readManagerState();
  const candidates = [];
  // Other Agent directories are no longer referenced directly; they are viewed and synced into DSH.
  const user = userRoots().filter((root) => root.native);
  const userScans = await scanDeduplicatedRoots(user);
  const items = user.flatMap((root) =>
    userScans.get(root.key)!.entries.map((entry) => ({ root, entry, policy: effectiveSkillPolicy(policyResult, root, entry) })),
  );
  const cwd =
    options && typeof options.cwd === "string" ? options.cwd : undefined;
  if (cwd) {
    const roots = (await projectRoots([cwd])).filter((root) => root.native);
    for (const root of roots) {
      const scanned = (await scanDeduplicatedRoots([root])).get(root.key)!;
      for (const entry of scanned.entries) items.push({ root, entry, policy: effectiveSkillPolicy(policyResult, root, entry) });
    }
  }
  for (const group of groupLoadableSkillsByName(items).values()) {
    const { root, entry, policy } = selectSkillWinner(group);
    // 关闭的外部来源不覆盖其他插件；原生副本、分发链接及显式单技能禁用仍需阻断。
    const hasNativeCopy = group.some(({ root, entry }) => root.native ||
      entry.policyAliases?.some((alias) => user.some((item) => item.key === alias.rootKey && item.native)));
    const hasExplicitDisable = group.some((item) => item.policy.override === false);
    if (!hasNativeCopy && !hasExplicitDisable && !policy.sourceEnabled) continue;
    const project = root.scope === "project";
    // Shared Agent 继续由 manager 提供递归发现与链接副本，不因开放文件管理而丢失调用候选。
    const policyOnly = root.mutable && root.key !== "agents";
    // 回退副本也必须覆盖组内更高优先级的原生条目，防止宿主重新选中已停用副本。
    const overlayRank = group.length > 1
      ? Math.min(...group.map((item) => Math.min(item.root.rank, item.entry.providerRank ?? item.root.rank))) - 1
      : undefined;
    // 原生根由宿主自己的 provider 提供；来源停用必须发布覆盖层，否则停用不生效。
    const needsOverlay =
      !policyOnly ||
      group.length > 1 ||
      policy.override !== undefined ||
      !entry.invocationPolicyValid ||
      policyResult.writable === false ||
      !policy.sourceEnabled;
    if (!needsOverlay) continue;
    const candidateName = canonicalSkillName({ root, entry, policy });
    if (!KEBAB_RE.test(candidateName)) continue;
    candidates.push({
      name: candidateName,
      description: entry.description,
      invocation: {
        modelInvocable: policy.modelInvocable,
        userInvocable: policy.userInvocable,
      },
      provider: "dsh-custom-center-skills-external",
      source: project
        ? root.kind
        : root.key === "dsh"
          ? "user-dsh"
          : `agent-${root.key}`,
      rank: overlayRank ?? (project
        ? root.rank - 1
        : root.key === "dsh"
          ? USER_DSH_POLICY_RANK
          : (entry.providerRank ?? root.rank)),
      locator: {
        rootKey: root.key,
        entryName: entry.name,
        path: entry.docPath,
        realEntryPath: entry.realEntryPath,
        realDocPath: entry.realDocPath,
      },
      resourceBase: {
        kind: "directory",
        path: entry.kind === "bundle" ? entry.realEntryPath : root.path,
      },
      path: entry.docPath,
      metadata: {
        dshSkillsManager: {
          root: root.key,
          readOnly: !root.mutable || entry.linked === true,
          sourceReadOnly: !root.mutable || entry.linked === true,
          policyOnly,
        },
      },
    });
  }
  return candidates;
}

export async function getProviderSkill(candidate: ProviderCandidate, options: ScopeOptions = {}) {
  const locator = candidate && candidate.locator;
  if (
    !locator ||
    typeof locator.path !== "string" ||
    typeof locator.rootKey !== "string" ||
    typeof locator.realEntryPath !== "string" ||
    typeof locator.realDocPath !== "string"
  )
    return undefined;
  let root = rootByKey(locator.rootKey);
  if (
    !root &&
    PROJECT_ROOT_KEY_RE.test(locator.rootKey) &&
    typeof options.cwd === "string"
  ) {
    root = (await projectRoots([options.cwd])).find(
      (item) => item.key === locator.rootKey,
    );
  }
  if (!root) return undefined;
  try {
    const entry = await resolveEntry(root, String(locator.entryName || ""));
    if (!entry || resolve(entry.docPath) !== resolve(locator.path))
      return undefined;
    if (
      pathIdentity(entry.realEntryPath) !== pathIdentity(locator.realEntryPath)
    )
      return undefined;
    if (pathIdentity(entry.realDocPath) !== pathIdentity(locator.realDocPath))
      return undefined;
    const doc = parseSkillDoc(
      await fs.readFile(entry.realDocPath || entry.docPath, "utf8"),
    );
    const summary = entryOf(locator.entryName, entry.kind, entry.docPath, doc);
    if (!summary.loadable) return undefined;
    const invocationName = KEBAB_RE.test(summary.declaredName) ? summary.declaredName : toKebab(summary.declaredName);
    if (invocationName !== candidate.name && summary.declaredName !== candidate.name) return undefined;
    return {
      name: candidate.name,
      description: candidate.description,
      invocation: candidate.invocation,
      provider: candidate.provider,
      source: candidate.source,
      resourceBase: candidate.resourceBase,
      path: candidate.path,
      metadata: candidate.metadata,
      content: doc.body.trim(),
    };
  } catch {
    return undefined;
  }
}

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
    projects: [] as {root?: string; name?: string; workspaceCwds?: string[]}[],
    summary: {total: 0, enabled: 0, disabled: 0, issues: 0},
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

export type ProviderCandidate = Awaited<ReturnType<typeof listProviderCandidates>>[number];
export { resolveDshHome, resolveAgentsHome, userRoots, managerHomePath, managerStatePath, trashRootPath, logPath } from "./server/source-roots.js";
export { projectRoots, createWorkspaceIndex, indexRegisteredWorkspaces, projectRootForRecord, resolveWorkspaceTarget, listWorkspaces };
export type { WorkspaceRow } from "./types.js";
export { browseDirectories, resolveEntry, skillDetail, openSkillFolder } from "./server/entry-access.js";
export { checkedRepositoryRootDefinition, repositoryDestinations } from "./server/root-access.js";
export { entryPath, renameWithRetry } from "./server/file-operations.js";
export { toKebab, parseSkillDoc, unquote, parseBoolValue, KEBAB_RE } from "./server/skill-document.js";
export { scanEntries } from "./server/skill-scan.js";
export { readManagerState, getSidebarEntry, setSidebarEntry } from "./server/policy-store.js";
export { setSourceEnabled, setSkillEnabled } from "./server/policy.js";
export { createCategory, renameCategory, deleteCategory, assignSkillCategory, moveSkillInCategory, setCategoryEnabled } from "./server/categories.js";
export { deleteSkill, listTrash, restoreTrash, permanentlyDeleteTrash } from "./server/trash.js";
export { importSkill, createSkill } from "./server/skill-import.js";
export { importUploadedSkill } from "./server/upload-import.js";
export { syncSkills } from "./server/skill-sync.js";
