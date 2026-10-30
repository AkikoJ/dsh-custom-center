import { readManagerState } from "./policy-store.js";
import { userRoots, USER_DSH_POLICY_RANK, rootByKey, PROJECT_ROOT_KEY_RE } from "./source-roots.js";
import { scanDeduplicatedRoots } from "./skill-scan.js";
import { effectiveSkillPolicy, groupLoadableSkillsByName, selectSkillWinner, canonicalSkillName } from "./policy.js";
import { projectRoots } from "./workspaces.js";
import { KEBAB_RE, parseSkillDoc, entryOf, toKebab } from "./skill-document.js";
import { resolveEntry } from "./entry-access.js";
import { pathIdentity } from "./file-operations.js";
import type { ScopeOptions } from "./types.js";
import { resolve } from "node:path";
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

export type ProviderCandidate = Awaited<ReturnType<typeof listProviderCandidates>>[number];
