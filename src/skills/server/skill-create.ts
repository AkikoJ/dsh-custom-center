import { entryPath, safeExistingEntryPaths, temporaryPath } from "./file-operations.js";
import { toKebab, KEBAB_RE, yamlString } from "./skill-document.js";
import { rootByKey } from "./source-roots.js";
import { checkedWritableRootDefinition, readonlyError } from "./root-access.js";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { Log, MutationOptions } from "./types.js";
import type { CreateInput } from "../contracts.js";
import type { CodedError } from "../model.js";

export async function createSkill(input: CreateInput, log?: Log, options: MutationOptions = {}) {
  const requestedRoot = Object.prototype.hasOwnProperty.call(options, "root")
    ? options.root
    : rootByKey("dsh");
  const definition = await checkedWritableRootDefinition(requestedRoot);
  if (definition && definition.ok === false) return definition;
  if (!definition) return readonlyError("create");
  const root = definition.path;
  const requestedName = String((input && input.name) || "").trim();
  const name = toKebab(requestedName);
  const description = String((input && input.description) || "").trim();
  const body = String((input && input.body) || "").trim();
  if (!name || !KEBAB_RE.test(name) || entryPath(root, name) === null)
    return {
      ok: false,
      error: `无法生成合法 kebab-case 名称（原始名: ${requestedName}）`,
      code: "error.import.invalidName",
      params: { name: requestedName },
    };
  if (!description)
    return {
      ok: false,
      error: "技能简介不能为空",
      code: "error.create.descriptionRequired",
    };
  if (!body)
    return {
      ok: false,
      error: "技能正文不能为空",
      code: "error.create.bodyRequired",
    };
  if (description.length > 500 || body.length > 1 << 18)
    return { ok: false, error: "技能内容过长", code: "error.create.tooLarge" };
  if (
    await safeExistingEntryPaths(root, name).then((items) => items.length > 0)
  )
    return {
      ok: false,
      error: `同名技能已存在: ${name}`,
      code: "error.create.conflict",
      params: { name },
    };
  await fs.mkdir(root, { recursive: true });
  const target = entryPath(root, name)!;
  const stage = temporaryPath(target, "create");
  try {
    await fs.mkdir(stage);
    const content = `---\nname: ${name}\ndescription: ${yamlString(description)}\n---\n\n${body}\n`;
    await fs.writeFile(join(stage, "SKILL.md"), content, "utf8");
    await fs.rename(stage, target);
  } catch (caught) {
    const error = caught as CodedError;
    await fs.rm(stage, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  if (log) log("create", `创建 ${join(target, "SKILL.md")}`);
  return { name, path: join(target, "SKILL.md"), root: definition.key };
}
