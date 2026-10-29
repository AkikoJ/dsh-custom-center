import { rootByKey, PROJECT_ROOT_KEY_RE } from "./source-roots.js";
import { projectRoots } from "./workspaces.js";
import { readonlyError, checkedPolicyRootDefinition } from "./root-access.js";
import { readManagerState, invalidManagerStateWrite, writeManagerState } from "./policy-store.js";
import { resolveEntry } from "./entry-access.js";
import { entryOf, parseSkillDoc, hostAcceptableSkillName } from "./skill-document.js";
import type { ManagerState, PolicyResult, SkillRoot, SkillEntry, Policy, Log, ScopeOptions, RootInput, SkillItem, ViewItem } from "../types.js";
import { promises as fs } from "node:fs";
export function managerSkillOverride(policy: ManagerState, rootKey: string, name: string, policyAliases: {rootKey: string; name: string}[] = []) {
  if ((policy.enabledSkills[rootKey] || []).includes(name)) return true;
  if ((policy.disabledSkills[rootKey] || []).includes(name)) return false;
  let inheritedEnable = false;
  for (const alias of policyAliases) {
    if (alias.rootKey === rootKey && alias.name === name) continue;
    if ((policy.disabledSkills[alias.rootKey] || []).includes(alias.name))
      return false;
    if ((policy.enabledSkills[alias.rootKey] || []).includes(alias.name))
      inheritedEnable = true;
  }
  if (inheritedEnable) return true;
  return undefined;
}

export function effectiveSkillPolicy(policyResult: PolicyResult, root: SkillRoot, entry: SkillEntry): Policy {
  const override = managerSkillOverride(
    policyResult.state,
    root.key,
    entry.name,
    entry.policyAliases,
  );
  const sourceEnabled =
    root.kind === "project-dsh" ||
    policyResult.state.sources[root.key] !== false;
  if (policyResult.writable === false || !sourceEnabled || override === false) {
    return {
      override,
      sourceEnabled,
      modelInvocable: false,
      userInvocable: false,
      enabled: false,
    };
  }
  const modelInvocable = entry.invocationPolicyValid ? entry.modelInvocable : true;
  const userInvocable = entry.invocationPolicyValid ? entry.userInvocable : true;
  return {
    override,
    sourceEnabled,
    modelInvocable,
    userInvocable,
    enabled: true,
  };
}

export async function setSourceEnabled(key: string, enabled: boolean, log?: Log, options: ScopeOptions = {}) {
  let root = rootByKey(key);
  if (!root && PROJECT_ROOT_KEY_RE.test(key) && !key.startsWith("project-dsh:"))
    root = (await projectRoots(options.projectCwds)).find((item) => item.key === key);
  if (!root || root.kind === 'project-dsh' || !root.toggleable)
    return readonlyError("toggle");
  const current = await readManagerState();
  if (current.writable === false) return invalidManagerStateWrite();
  current.state.sources[root.key] = enabled === true;
  await writeManagerState(current.state);
  if (log)
    log(
      enabled ? "source-enable" : "source-disable",
      `${enabled ? "启用" : "停用"}来源 ${root.key}: ${root.path}`,
    );
  return { root: root.key, enabled: enabled === true };
}

export async function applyPolicySkillEnabled(definition: SkillRoot, name: string, enabled: boolean, state: ManagerState) {
  const resolved = await resolveEntry(definition, name);
  if (resolved === null) {
    const explicitlyEnabled = new Set(state.enabledSkills[definition.key] || []);
    if (!enabled && explicitlyEnabled.has(name)) {
      explicitlyEnabled.delete(name);
      state.enabledSkills[definition.key] = [...explicitlyEnabled].sort();
      return { root: definition.key, name, enabled: false };
    }
    return {
      ok: false as const,
      error: `技能不存在: ${name}`,
      code: "error.skill.notFound",
      params: { name },
    };
  }
  let summary;
  try {
    summary = entryOf(
      name,
      resolved.kind,
      resolved.docPath,
      parseSkillDoc(
        await fs.readFile(resolved.realDocPath || resolved.docPath, "utf8"),
      ),
    );
  } catch {
    const explicitlyEnabled = new Set(state.enabledSkills[definition.key] || []);
    if (!enabled && explicitlyEnabled.has(name)) {
      explicitlyEnabled.delete(name);
      state.enabledSkills[definition.key] = [...explicitlyEnabled].sort();
      return { root: definition.key, name, enabled: false };
    }
    return {
      ok: false as const,
      error: `技能不存在: ${name}`,
      code: "error.skill.notFound",
      params: { name },
    };
  }
  const explicitlyEnabled = new Set(state.enabledSkills[definition.key] || []);
  const explicitlyDisabled = new Set(state.disabledSkills[definition.key] || []);
  const isAlreadyEnabled = explicitlyEnabled.has(name);
  const isAlreadyDisabled = explicitlyDisabled.has(name);

  // 幂等保护：不可加载技能若已处于停用状态，再次请求停用直接成功
  if (!enabled && isAlreadyDisabled) {
    return { root: definition.key, name, enabled: false };
  }

  if (!summary.hasFrontmatter && (enabled || !isAlreadyEnabled)) {
    return {
      ok: false as const,
      error: `技能缺少完整 frontmatter，无法${enabled ? "启用" : "停用"}: ${name}`,
      code: "error.skill.noFrontmatter",
      params: { name, action: enabled ? "enable" : "disable" },
    };
  }
  if (!summary.loadable && (enabled || !isAlreadyEnabled)) {
    return {
      ok: false as const,
      error: `技能结构不完整，无法${enabled ? "启用" : "停用"}: ${name}`,
      code: "error.skill.notLoadable",
      params: { name, action: enabled ? "enable" : "disable" },
    };
  }
  const disabled = explicitlyDisabled;
  if (enabled) {
    disabled.delete(name);
    explicitlyEnabled.add(name);
  } else {
    explicitlyEnabled.delete(name);
    disabled.add(name);
  }
  state.disabledSkills[definition.key] = [...disabled].sort();
  state.enabledSkills[definition.key] = [...explicitlyEnabled].sort();
  return { root: definition.key, name, enabled: enabled === true };
}

export async function setPolicySkillEnabled(root: RootInput, name: string, enabled: boolean, log?: Log) {
  const definition = await checkedPolicyRootDefinition(root);
  if (definition && definition.ok === false) return definition;
  if (!definition) return readonlyError("toggle");
  const current = await readManagerState();
  if (current.writable === false) return invalidManagerStateWrite();
  const result = await applyPolicySkillEnabled(definition, name, enabled, current.state);
  if (result && result.ok === false) return result;
  await writeManagerState(current.state);
  if (log)
    log(
      enabled ? "policy-enable" : "policy-disable",
      `${enabled ? "启用" : "停用"} ${definition.key}/${name}（本地策略，源文件不变）`,
    );
  return result;
}

// ── 启用 / 停用（同时控制模型与 / 手动调用，非破坏）──────────────────────────

/** enabled=true 恢复模型与 / 手动调用；false 同时停用两种调用入口。 */
export async function setSkillEnabled(root: RootInput, name: string, enabled: boolean, log?: Log) {
  return setPolicySkillEnabled(root, name, enabled, log);
}

// ── 状态快照 ────────────────────────────────────────────────────────────────

export function canonicalEntryName(entry: { declaredName?: string; name: string }) {
  const declared = entry.declaredName || "";
  const acceptable = hostAcceptableSkillName(declared);
  return acceptable || declared || entry.name;
}

export function canonicalSkillName(item: SkillItem) {
  return canonicalEntryName(item.entry);
}

/** 真实路径去重后按声明名分组；管理页与当前工作区 provider 共用来源优先级。 */
export function groupLoadableSkillsByName<T extends SkillItem>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  // 同分时明确优先项目作用域，再按来源与条目标识决胜，不依赖调用方插入顺序。
  const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  for (const item of [...items].sort((a, b) =>
    a.root.rank - b.root.rank ||
    Number(b.root.scope === "project") - Number(a.root.scope === "project") ||
    compareText(a.root.key, b.root.key) ||
    compareText(a.entry.name, b.entry.name),
  )) {
    if (!item.entry.loadable) continue;
    const name = canonicalSkillName(item);
    const group = groups.get(name) || [];
    group.push(item);
    groups.set(name, group);
  }
  return groups;
}

// 只跳过 manager 明确停用的副本；frontmatter 的分通道限制和非法策略仍按原规则失败关闭。
export function isCopyDisabled(item: SkillItem) {
  return !item.policy.sourceEnabled || item.policy.override === false;
}
export function selectSkillWinner<T extends SkillItem>(group: T[]): T {
  return group.find((item) => !isCopyDisabled(item)) || group[0];
}
export function markWinners(items: ViewItem[]) {
  const winners = new Map<string, ViewItem>();
  for (const [canonicalName, group] of groupLoadableSkillsByName(items)) {
    const winner = selectSkillWinner(group);
    winners.set(canonicalName, winner);
    for (const item of group) {
      delete item.view.winner;
      delete item.view.shadowedBy;
      delete item.view.fallbackTo;
      delete item.view.enabled;
      if (isCopyDisabled(item)) {
        item.view.enabled = false;
        if (item !== winner && (winner.policy.modelInvocable || winner.policy.userInvocable)) {
          item.view.fallbackTo = { root: winner.root.key, name: winner.entry.name, scope: winner.root.scope || "user" };
        }
      } else if (item !== winner) {
        item.view.shadowedBy = { root: winner.root.key, name: winner.entry.name };
      }
    }
    if (!isCopyDisabled(winner)) winner.view.winner = true;
    winner.view.enabled = winner.policy.enabled;
    winner.view.canonicalName = canonicalName;
  }
  return winners;
}
