import { userRoots, PROJECT_ROOT_KEY_RE, rootByKey, managerStatePath, managerHomePath } from "./source-roots.js";
import { codedError, writeFileAtomically } from "./file-operations.js";
import type { ManagerState, PolicyResult, CodedError } from "../model.js";
import { validDiscoveryName } from "../readonly-discovery.js";
import { promises as fs } from "node:fs";
// ── Manager 本地策略（外部源只读，启停状态写入 DSH_HOME）────────────────────

export function defaultManagerState(): ManagerState {
  const sources: ManagerState["sources"] = Object.create(null);
  const disabledSkills: ManagerState["disabledSkills"] = Object.create(null);
  const enabledSkills: ManagerState["enabledSkills"] = Object.create(null);
  for (const root of userRoots()) {
    sources[root.key] = true;
    disabledSkills[root.key] = [];
    enabledSkills[root.key] = [];
  }
  return { version: 1, sources, disabledSkills, enabledSkills, sidebarEntry: false, categories: Object.create(null), categoryMembers: Object.create(null), categoryOrder: Object.create(null) };
}

export function validStateSkillName(name: unknown): name is string {
  return validDiscoveryName(name);
}

/** 状态文件已存在但不可用时一律关闭外部来源，避免损坏配置重新暴露技能。 */
export function failClosedManagerState() {
  const state = defaultManagerState();
  for (const key of Object.keys(state.sources)) state.sources[key] = false;
  return state;
}

export function validPolicyLists(value: unknown, allowMissing = false) {
  if (value === undefined && allowMissing) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  for (const [key, list] of Object.entries(value)) {
    if (
      !userRoots().some((root) => root.key === key) &&
      !PROJECT_ROOT_KEY_RE.test(key)
    )
      continue;
    if (!Array.isArray(list) || list.some((name) => !validStateSkillName(name)))
      return false;
  }
  return true;
}

export function validManagerStateDocument(value: ManagerState) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.version !== 1
  )
    return false;
  if (
    !value.sources ||
    typeof value.sources !== "object" ||
    Array.isArray(value.sources)
  )
    return false;
  if (
    !validPolicyLists(value.disabledSkills) ||
    !validPolicyLists(value.enabledSkills, true)
  )
    return false;
  if (value.sidebarEntry !== undefined && typeof value.sidebarEntry !== "boolean") return false;
  for (const root of userRoots()) {
    if (root.key === "dsh") {
      if (value.sources.dsh !== undefined && typeof value.sources.dsh !== "boolean") return false;
      continue;
    }
    if (typeof value.sources[root.key] !== "boolean") return false;
    const list = value.disabledSkills[root.key];
    if (!Array.isArray(list) || list.some((name) => !validStateSkillName(name)))
      return false;
  }
  // 项目来源键允许缺省（默认开启），但显式值必须与全局来源一样严格校验。
  for (const [key, flag] of Object.entries(value.sources)) {
    if (PROJECT_ROOT_KEY_RE.test(key) && typeof flag !== "boolean") return false;
  }
  const enabledSkills = value.enabledSkills || {};
  for (const key of new Set([
    ...Object.keys(value.disabledSkills),
    ...Object.keys(enabledSkills),
  ])) {
    const disabled = new Set(value.disabledSkills[key] || []);
    if ((enabledSkills[key] || []).some((name) => disabled.has(name)))
      return false;
  }
  return true;
}

/** 仅对可识别的 version 1 状态补齐新增只读来源键，其余结构仍交由严格校验失败关闭。 */
export function migrateManagerStateDocument(value: ManagerState) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.version !== 1
  )
    return value;
  // version 1 没有记录引入来源的版本，只有确曾新增的来源允许补缺。
  // 原有 agents/codex/claude/gemini/opencode 字段缺失仍表示损坏配置。
  const addedSources = ["ccswitch", "cursor", "copilot", "windsurf", "windsurf-user", "trae", "trae-cn", "openclaw", "clawdbot", "roo", "codebuddy", "workbuddy", "qoder", "qoder-cn", "lingma"];
  for (const key of addedSources) {
    for (const field of ["sources", "disabledSkills", "enabledSkills"] as const) {
      if (
        value[field] &&
        typeof value[field] === "object" &&
        !Array.isArray(value[field]) &&
        value[field][key] === undefined
      )
        value[field][key] = field === "sources" ? true : [];
    }
  }
  return value;
}

export function normalizeManagerState(value: ManagerState) {
  const normalized = defaultManagerState();
  if (!value || typeof value !== "object" || Array.isArray(value))
    return normalized;
  if (typeof value.sidebarEntry === "boolean") {
    normalized.sidebarEntry = value.sidebarEntry;
  }
  for (const root of userRoots()) {
    if (
      value.sources &&
      typeof value.sources[root.key] === "boolean"
    )
      normalized.sources[root.key] = value.sources[root.key];
    const list = value.disabledSkills && value.disabledSkills[root.key];
    if (Array.isArray(list))
      normalized.disabledSkills[root.key] = [
        ...new Set(list.filter((name) => validStateSkillName(name))),
      ].sort();
    const enabled = value.enabledSkills && value.enabledSkills[root.key];
    if (Array.isArray(enabled))
      normalized.enabledSkills[root.key] = [
        ...new Set(enabled.filter((name) => validStateSkillName(name))),
      ].sort();
  }
  if (value.sources && typeof value.sources === "object" && !Array.isArray(value.sources)) {
    for (const [key, flag] of Object.entries(value.sources)) {
      if (PROJECT_ROOT_KEY_RE.test(key) && !key.startsWith("project-dsh:") && typeof flag === "boolean")
        normalized.sources[key] = flag;
    }
  }
  for (const field of ["disabledSkills", "enabledSkills"] as const) {
    const source = value[field];
    if (source && typeof source === "object" && !Array.isArray(source)) {
      for (const [key, list] of Object.entries(source)) {
        if (!PROJECT_ROOT_KEY_RE.test(key) || !Array.isArray(list)) continue;
        normalized[field][key] = [
          ...new Set(list.filter(validStateSkillName)),
        ].sort();
      }
    }
  }
  normalized.categories = normalizeCategories(value.categories);
  normalized.categoryMembers = normalizeCategoryMembers(value.categoryMembers, normalized.categories);
  normalized.categoryOrder = normalizeCategoryOrder(value.categoryOrder, normalized.categories);
  return normalized;
}

export const CATEGORY_NAME_MAX = 24;

export function categoryRootKey(key: string) {
  if (rootByKey(key) || PROJECT_ROOT_KEY_RE.test(key)) return key;
  return null;
}

export function normalizeCategories(value: ManagerState["categories"] | undefined) {
  const categories: ManagerState["categories"] = Object.create(null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return categories;
  for (const [key, list] of Object.entries(value)) {
    if (!categoryRootKey(key) || !Array.isArray(list)) continue;
    const seen = new Set<string>();
    categories[key] = [];
    for (const item of list) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const id = typeof item.id === "string" ? item.id : "";
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (!/^[a-z0-9]{8,32}$/.test(id) || !name || name.length > CATEGORY_NAME_MAX || seen.has(id)) continue;
      seen.add(id);
      categories[key].push({ id, name });
    }
  }
  return categories;
}

export function normalizeCategoryMembers(value: ManagerState["categoryMembers"] | undefined, categories: ManagerState["categories"]) {
  const members: ManagerState["categoryMembers"] = Object.create(null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return members;
  for (const [key, record] of Object.entries(value)) {
    if (!categoryRootKey(key) || !record || typeof record !== "object" || Array.isArray(record)) continue;
    const ids = new Set((categories[key] || []).map((item) => item.id));
    members[key] = Object.create(null);
    for (const [name, id] of Object.entries(record)) {
      if (validStateSkillName(name) && typeof id === "string" && ids.has(id)) members[key][name] = id;
    }
  }
  return members;
}

export function normalizeCategoryOrder(value: ManagerState["categoryOrder"] | undefined, categories: ManagerState["categories"]) {
  const order: ManagerState["categoryOrder"] = Object.create(null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return order;
  for (const [key, groups] of Object.entries(value)) {
    if (!categoryRootKey(key) || !groups || typeof groups !== "object" || Array.isArray(groups)) continue;
    const validIds = new Set(["", ...(categories[key] || []).map((item) => item.id)]);
    order[key] = Object.create(null);
    for (const [id, names] of Object.entries(groups)) {
      if (!validIds.has(id) || !Array.isArray(names)) continue;
      order[key][id] = [...new Set(names.filter(validStateSkillName))];
    }
  }
  return order;
}

export async function readManagerState(): Promise<PolicyResult> {
  try {
    const raw = await fs.readFile(managerStatePath(), "utf8");
    // 旧版状态迁移与下方 schema 校验仍是磁盘数据的信任边界。
    const parsed = migrateManagerStateDocument(JSON.parse(raw) as ManagerState);
    if (!validManagerStateDocument(parsed))
      throw codedError("invalid manager state schema", "error.state.invalid");
    return {
      state: normalizeManagerState(parsed),
      warning: null,
      writable: true,
    };
  } catch (caught) {
    const error = caught as CodedError;
    if (error && error.code === "ENOENT")
      return { state: defaultManagerState(), warning: null, writable: true };
    return {
      state: failClosedManagerState(),
      writable: false,
      warning: {
        code: "warning.state.invalid",
        params: { path: managerStatePath() },
        error: `技能管理器状态文件不可读，所有技能已安全停用且状态写入已锁定: ${managerStatePath()}`,
      },
    };
  }
}

export async function writeManagerState(value: ManagerState) {
  await fs.mkdir(managerHomePath(), { recursive: true });
  await writeFileAtomically(
    managerStatePath(),
    `${JSON.stringify(normalizeManagerState(value), null, 2)}\n`,
  );
}

export function invalidManagerStateWrite() {
  return {
    ok: false,
    code: "error.state.invalid",
    params: { path: managerStatePath() },
    error: `技能管理器状态文件不可读，已拒绝覆盖: ${managerStatePath()}`,
  };
}

export async function getSidebarEntry(): Promise<boolean> {
  const current = await readManagerState();
  return current.state.sidebarEntry === true;
}

export async function setSidebarEntry(enabled: boolean): Promise<boolean> {
  if (typeof enabled !== "boolean") {
    throw codedError("sidebarEntry must be a boolean", "error.proto.invalidParams");
  }
  const current = await readManagerState();
  if (current.writable === false) {
    throw codedError("manager state file is read-only", "error.state.invalid");
  }
  current.state.sidebarEntry = enabled;
  await writeManagerState(current.state);
  return enabled;
}
