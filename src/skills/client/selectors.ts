import type { RootView, SkillView } from "../contracts.js";
import type { SkillRoot } from "../model.js";

type SearchSkill = Partial<SkillView> & {
  kindLabel?: string;
  statusLabel?: string;
  rootKey?: string;
  rootLabel?: string;
};

function isSkillEnabled(skill: Partial<SkillView>): boolean {
  if (skill.enabled !== undefined) return skill.enabled === true;
  return !!(
    skill.invocationPolicyValid &&
    skill.modelInvocable &&
    skill.userInvocable &&
    skill.managerEnabled !== false
  );
}

function normalizeSkillQuery(query: unknown) {
  return String(query == null ? "" : query)
    .trim()
    .toLowerCase();
}

function matchSkillQuery(skill: SearchSkill, query: unknown) {
  var q = normalizeSkillQuery(query);
  if (!q) return true;
  return [
    skill.name,
    skill.declaredName,
    skill.description,
    skill.kind,
    skill.kindLabel,
    skill.statusLabel,
    skill.rootKey,
    skill.rootLabel,
  ].some(function (value) {
    return String(value == null ? "" : value)
      .toLowerCase()
      .includes(q);
  });
}

function filterSkills<T extends SearchSkill>(
  list: T[],
  options?: { rootKey?: string; query?: unknown; },
) {
  var rootKey = options && options.rootKey != null ? options.rootKey : "";
  return list.filter(function (skill) {
    return (
      (!rootKey || skill.rootKey === rootKey) &&
      matchSkillQuery(skill, options && options.query)
    );
  });
}

function visibleSkillRoots<T extends { mutable?: boolean; exists?: boolean; }>(
  roots: T[],
) {
  return (roots || []).filter(function (root) {
    return root.mutable || root.exists !== false;
  });
}

function skillStatus(skill: Partial<SkillView>) {
  if (skill.sync) return skill.sync.status;
  return skill.shadowedBy
    ? "shadowed"
    : skill.loadable === false
      ? "invalid"
      : isSkillEnabled(skill)
        ? "enabled"
        : "disabled";
}

function countSkillStatuses(list: { skill: Partial<SkillView>; }[]) {
  var summary: Record<string, number> = {
    total: list.length,
    enabled: 0,
    disabled: 0,
    shadowed: 0,
    invalid: 0,
    unsynced: 0,
    synced: 0,
    outdated: 0,
    exists: 0,
  };
  list.forEach(function (row) {
    summary[skillStatus(row.skill)]++;
  });
  return summary;
}

function canToggleSource(root: Partial<SkillRoot> | null | undefined) {
  return !!(root && root.toggleable !== false && root.kind !== "project-dsh");
}

function scopeSkillRoots(roots: RootView[]) {
  return visibleSkillRoots(roots).filter(function (root) {
    if (root.scope === "project" || root.native === false) return false;
    return root.mutable || (root.skills || []).length > 0;
  });
}

function agentSkillRoots(roots: RootView[]) {
  return visibleSkillRoots(roots).filter(function (root) {
    return (
      root.scope !== "project" &&
      root.native === false &&
      (root.skills || []).length > 0
    );
  });
}
export { agentSkillRoots, canToggleSource, countSkillStatuses, filterSkills, isSkillEnabled, matchSkillQuery, normalizeSkillQuery, scopeSkillRoots, skillStatus, visibleSkillRoots };
