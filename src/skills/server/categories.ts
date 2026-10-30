import { categoryRootKey, readManagerState, invalidManagerStateWrite, CATEGORY_NAME_MAX, writeManagerState, validStateSkillName } from "./policy-store.js";
import { rootByKey, PROJECT_ROOT_KEY_RE } from "./source-roots.js";
import { projectRoots } from "./workspaces.js";
import { resolveEntry } from "./entry-access.js";
import { scanEntries } from "./skill-scan.js";
import { applyPolicySkillEnabled } from "./policy.js";
import type { OperationError } from "../model.js";
import type { ScopeOptions, Log } from "./types.js";
import { randomBytes } from "node:crypto";
export function categoryError(code: string, error: string, params?: Record<string, unknown>): OperationError {
  return { ok: false, code, error, ...(params ? { params } : {}) };
}

export async function resolvedCategoryRoot(key: string, options: ScopeOptions = {}) {
  const rootKey = categoryRootKey(key);
  if (!rootKey) return null;
  const user = rootByKey(rootKey);
  if (user) return user;
  if (!PROJECT_ROOT_KEY_RE.test(rootKey)) return null;
  return (await projectRoots(options.projectCwds)).find((item) => item.key === rootKey) || null;
}

export async function writableCategoryState(key: string, options: ScopeOptions = {}) {
  const root = await resolvedCategoryRoot(key, options);
  if (!root) return categoryError("error.category.root", `技能来源不存在: ${key}`, { root: key });
  const current = await readManagerState();
  if (current.writable === false) return invalidManagerStateWrite();
  if (!current.state.categories[root.key]) current.state.categories[root.key] = [];
  if (!current.state.categoryMembers[root.key]) current.state.categoryMembers[root.key] = Object.create(null);
  if (!current.state.categoryOrder[root.key]) current.state.categoryOrder[root.key] = Object.create(null);
  return { rootKey: root.key, root, state: current.state };
}

export async function createCategory(key: string, name: string, log?: Log, options: ScopeOptions = {}) {
  const ready = await writableCategoryState(key, options);
  if ("ok" in ready) return ready;
  const label = String(name || "").trim();
  if (!label || label.length > CATEGORY_NAME_MAX)
    return categoryError("error.category.name", "分类名称不能为空，且不能超过 24 个字符");
  if (ready.state.categories[ready.rootKey].some((item) => item.name === label))
    return categoryError("error.category.duplicate", `已有同名分类: ${label}`, { name: label });
  const category = { id: randomBytes(8).toString("hex"), name: label };
  ready.state.categories[ready.rootKey].push(category);
  ready.state.categoryOrder[ready.rootKey][category.id] = [];
  await writeManagerState(ready.state);
  if (log) log("category-create", `在 ${ready.rootKey} 添加分类 ${label}`);
  return { root: ready.rootKey, category };
}

export async function renameCategory(key: string, id: string, name: string, log?: Log, options: ScopeOptions = {}) {
  const ready = await writableCategoryState(key, options);
  if ("ok" in ready) return ready;
  const label = String(name || "").trim();
  const list = ready.state.categories[ready.rootKey];
  const category = list.find((item) => item.id === id);
  if (!category) return categoryError("error.category.notFound", "分类不存在", { id });
  if (!label || label.length > CATEGORY_NAME_MAX)
    return categoryError("error.category.name", "分类名称不能为空，且不能超过 24 个字符");
  if (list.some((item) => item !== category && item.name === label))
    return categoryError("error.category.duplicate", `已有同名分类: ${label}`, { name: label });
  category.name = label;
  await writeManagerState(ready.state);
  if (log) log("category-rename", `重命名 ${ready.rootKey} 分类为 ${label}`);
  return { root: ready.rootKey, category };
}

export async function deleteCategory(key: string, id: string, log?: Log, options: ScopeOptions = {}) {
  const ready = await writableCategoryState(key, options);
  if ("ok" in ready) return ready;
  const list = ready.state.categories[ready.rootKey];
  if (!list.some((item) => item.id === id)) return categoryError("error.category.notFound", "分类不存在", { id });
  ready.state.categories[ready.rootKey] = list.filter((item) => item.id !== id);
  delete ready.state.categoryOrder[ready.rootKey][id];
  for (const [skillName, categoryId] of Object.entries(ready.state.categoryMembers[ready.rootKey])) {
    if (categoryId === id) delete ready.state.categoryMembers[ready.rootKey][skillName];
  }
  await writeManagerState(ready.state);
  if (log) log("category-delete", `删除 ${ready.rootKey} 分类 ${id}，技能留在未分类`);
  return { root: ready.rootKey, id };
}

export async function assignSkillCategory(key: string, skillName: string, categoryId: string, log?: Log, options: ScopeOptions = {}) {
  const ready = await writableCategoryState(key, options);
  if ("ok" in ready) return ready;
  if (!validStateSkillName(skillName))
    return categoryError("error.skill.notFound", `技能不存在: ${skillName}`, { name: skillName });
  if (categoryId) {
    const entry = await resolveEntry(ready.root, skillName);
    if (!entry)
      return categoryError("error.skill.notFound", `技能不存在: ${skillName}`, { name: skillName });
    if (!ready.state.categories[ready.rootKey].some((item) => item.id === categoryId))
      return categoryError("error.category.notFound", "分类不存在", { id: categoryId });
    const previousId = ready.state.categoryMembers[ready.rootKey][skillName] || "";
    if (previousId !== categoryId) {
      ready.state.categoryOrder[ready.rootKey][previousId] = (ready.state.categoryOrder[ready.rootKey][previousId] || []).filter((name) => name !== skillName);
      const targetOrder = ready.state.categoryOrder[ready.rootKey][categoryId] || [];
      if (!targetOrder.includes(skillName)) targetOrder.push(skillName);
      ready.state.categoryOrder[ready.rootKey][categoryId] = targetOrder;
    }
    ready.state.categoryMembers[ready.rootKey][skillName] = categoryId;
  } else {
    const previousId = ready.state.categoryMembers[ready.rootKey][skillName] || "";
    if (previousId) {
      ready.state.categoryOrder[ready.rootKey][previousId] = (ready.state.categoryOrder[ready.rootKey][previousId] || []).filter((name) => name !== skillName);
      const looseOrder = ready.state.categoryOrder[ready.rootKey][""] || [];
      if (!looseOrder.includes(skillName)) looseOrder.push(skillName);
      ready.state.categoryOrder[ready.rootKey][""] = looseOrder;
    }
    delete ready.state.categoryMembers[ready.rootKey][skillName];
  }
  await writeManagerState(ready.state);
  if (log) log("category-assign", `${ready.rootKey}/${skillName} 归入 ${categoryId || "未分类"}`);
  return { root: ready.rootKey, name: skillName, categoryId: categoryId || null };
}

export async function moveSkillInCategory(key: string, skillName: string, categoryId: string, targetName?: string, position: string = "before", log?: Log, options: ScopeOptions = {}) {
  const ready = await writableCategoryState(key, options);
  if ("ok" in ready) return ready;
  if (!validStateSkillName(skillName))
    return categoryError("error.skill.notFound", `技能不存在: ${skillName}`, { name: skillName });
  if (categoryId && !ready.state.categories[ready.rootKey].some((item) => item.id === categoryId))
    return categoryError("error.category.notFound", "分类不存在", { id: categoryId });
  if (position !== "before" && position !== "after")
    return categoryError("error.category.position", "技能排序位置无效");

  const entries = (await scanEntries(ready.root)).entries.map((entry) => entry.name);
  if (!entries.includes(skillName))
    return categoryError("error.skill.notFound", `技能不存在: ${skillName}`, { name: skillName });
  if (targetName && (!validStateSkillName(targetName) || !entries.includes(targetName)))
    return categoryError("error.skill.notFound", `排序目标不存在: ${targetName}`, { name: targetName });

  const members = ready.state.categoryMembers[ready.rootKey];
  const orders = ready.state.categoryOrder[ready.rootKey];
  const previousId = members[skillName] || "";
  const orderedNames = (id: string) => {
    const available = entries.filter((name) => (members[name] || "") === id).sort((a, b) => a.localeCompare(b));
    const availableSet = new Set(available);
    const saved = (orders[id] || []).filter((name) => availableSet.has(name));
    return [...saved, ...available.filter((name) => !saved.includes(name))];
  };
  if (targetName && (members[targetName] || "") !== categoryId)
    return categoryError("error.category.target", "排序目标不属于目标分类", { name: targetName, category: categoryId });

  const sourceOrder = orderedNames(previousId).filter((name) => name !== skillName);
  const targetOrder = previousId === categoryId ? sourceOrder : orderedNames(categoryId).filter((name) => name !== skillName);
  let index = targetName ? targetOrder.indexOf(targetName) : -1;
  if (index < 0) index = targetOrder.length;
  else if (position === "after") index += 1;
  targetOrder.splice(index, 0, skillName);

  if (previousId !== categoryId) orders[previousId] = sourceOrder;
  orders[categoryId] = targetOrder;
  if (categoryId) members[skillName] = categoryId;
  else delete members[skillName];
  await writeManagerState(ready.state);
  if (log) log("category-order", `${ready.rootKey}/${skillName} 移至 ${categoryId || "未分类"} ${position} ${targetName || "末尾"}`);
  return { root: ready.rootKey, name: skillName, categoryId: categoryId || null, order: targetOrder };
}

export async function setCategoryEnabled(key: string, categoryId: string, enabled: boolean, log?: Log, options: ScopeOptions = {}) {
  const ready = await writableCategoryState(key, options);
  if ("ok" in ready) return ready;
  const root = ready.root;
  if (categoryId && categoryId !== "*" && !ready.state.categories[ready.rootKey].some((item) => item.id === categoryId))
    return categoryError("error.category.notFound", "分类不存在", { id: categoryId });
  const scanned = (await scanEntries(root)).entries.map((entry) => entry.name);
  const members = ready.state.categoryMembers[ready.rootKey];
  const names = categoryId === "*"
    ? scanned
    : categoryId
      ? Object.entries(members).filter(([, id]) => id === categoryId).map(([name]) => name)
      : scanned.filter((name) => !members[name]);
  const skipped: string[] = [];
  const changedNames: string[] = [];
  for (const name of names) {
    const result = await applyPolicySkillEnabled(root, name, enabled, ready.state);
    if (result && result.ok === false) {
      if (result.code === "error.skill.notLoadable" || result.code === "error.skill.noFrontmatter") skipped.push(name);
      else if (result.code !== "error.skill.notFound") return result;
      continue;
    }
    changedNames.push(name);
  }
  if (changedNames.length) await writeManagerState(ready.state);
  if (log)
    for (const name of changedNames)
      log(enabled ? "policy-enable" : "policy-disable", `${enabled ? "启用" : "停用"} ${ready.rootKey}/${name}（本地策略，源文件不变）`);
  return { root: ready.rootKey, categoryId: categoryId || null, enabled: enabled === true, changed: changedNames.length, skipped };
}
