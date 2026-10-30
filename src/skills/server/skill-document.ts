import { MAX_ENTRY_NAME_LENGTH } from "./file-operations.js";
import type { ParsedSkill } from "../model.js";
export const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ── 命名规整 ────────────────────────────────────────────────────────────────

/** 尽量把英文变体规整为 kebab-case；包含非 ASCII 字符或无法生成合法名称时返回空串。 */
export function toKebab(s: string) {
  let t = String(s).trim();
  if (t === "" || /[^\x00-\x7F]/.test(t)) return "";
  t = t.replace(/([a-z0-9])([A-Z])/g, "$1-$2"); // camelCase 边界
  t = t.toLowerCase();
  t = t.replace(/[\s_.]+/g, "-");
  t = t.replace(/[^a-z0-9-]/g, "-");
  t = t.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return t;
}

// ── frontmatter 解析 / 序列化（宽松 YAML 对象，保留键序）────────────────────

/** 剥离 UTF-8 BOM（Windows 工具常写入，不剥离会导致开头 --- 失配）。 */
export function stripBom(text: string) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** 解析 SKILL.md 的 frontmatter。返回 { fields, map, body }，map 保留键序。
 *  只识别顶层 key: value；缩进嵌套字段（如 metadata.source）不进入 map。 */
export function parseSkillDoc(text: string): ParsedSkill {
  const src = stripBom(String(text));
  const lines = src.split(/\r?\n/);
  const map: Record<string, string> = Object.create(null);
  const fields = [];
  let body = src;
  let hasFrontmatter = false;
  if (lines.length > 0 && lines[0].trim() === "---") {
    let end = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        end = i;
        break;
      }
    }
    if (end >= 0) {
      hasFrontmatter = true;
      for (let i = 1; i < end; i++) {
        const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(lines[i]);
        if (m) {
          fields.push({ key: m[1], raw: m[2] });
          const block = /^([>|])(?:([1-9])[-+]?|[-+]([1-9])?)?\s*$/.exec(m[2]);
          if (block) {
            const content = [];
            while (
              i + 1 < end &&
              (/^\s/.test(lines[i + 1]) || lines[i + 1] === "")
            ) {
              i++;
              content.push(lines[i]);
            }
            const explicitIndentation = block[2] || block[3];
            const indentation = explicitIndentation
              ? Number(explicitIndentation)
              : content
                  .filter((line) => line.trim() !== "")
                  .reduce(
                    (min, line) =>
                      Math.min(min, (/^\s*/.exec(line) || [""])[0].length),
                    Infinity,
                  );
            const normalized = content.map((line) =>
              Number.isFinite(indentation)
                ? line.slice(Math.min(indentation, line.length))
                : line,
            );
            map[m[1]] =
              block[1] === ">"
                ? normalized.join(" ").replace(/\s+/g, " ").trim()
                : explicitIndentation
                  ? normalized.join("\n").replace(/^\n+|\n+$/g, "")
                  : normalized.join("\n").trim();
          } else {
            map[m[1]] = decodeYamlScalar(m[2]);
          }
        }
      }
      body = lines.slice(end + 1).join("\n");
    }
  }
  return { fields, map, body, hasFrontmatter };
}

/** 读取 YAML 标量的显示值；不依赖第三方 YAML 解析器。 */
export function decodeYamlScalar(v: string) {
  const s = String(v == null ? "" : v).trim();
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    try {
      const value: unknown = JSON.parse(s);
      if (typeof value === "string") return value;
    } catch {
      /* 保留无法解析的原始内容 */
    }
  }
  if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'")
    return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

export function unquote(v: unknown) {
  const s = String(v == null ? "" : v).trim();
  if (
    s.length >= 2 &&
    ((s[0] === '"' && s[s.length - 1] === '"') ||
      (s[0] === "'" && s[s.length - 1] === "'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

/** 解析布尔字段值；合法布尔返回 true/false，非法返回 undefined。 */
export function parseBoolValue(raw: unknown) {
  const v = unquote(raw).trim().toLowerCase();
  if (v === "true" || v === "yes" || v === "on" || v === "1") return true;
  if (v === "false" || v === "no" || v === "off" || v === "0") return false;
  return undefined;
}

export function isValidDeclaredName(name: string): boolean {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed === "" || trimmed === "." || trimmed === ".." || trimmed.startsWith(".")) return false;
  if (trimmed.length > MAX_ENTRY_NAME_LENGTH) return false;
  if (/[\\/:*?"<>|\0]/.test(trimmed) || /[. ]$/.test(trimmed)) return false;
  return true;
}

export function hostAcceptableSkillName(declaredName: string): string | null {
  const trimmed = String(declaredName || "").trim();
  if (trimmed === "" || !isValidDeclaredName(trimmed)) return null;
  if (KEBAB_RE.test(trimmed)) return trimmed;
  const kebab = toKebab(trimmed);
  if (kebab && KEBAB_RE.test(kebab)) return kebab;
  return null;
}

export function entryOf(name: string, kind: string, docPath: string, doc: Pick<ParsedSkill, "map" | "hasFrontmatter">) {
  const declaredName = doc.map.name !== undefined ? unquote(doc.map.name) : "";
  const description =
    doc.map.description !== undefined ? unquote(doc.map.description) : "";
  const modelValue = parseBoolValue(doc.map["disable-model-invocation"]);
  const userValue = parseBoolValue(doc.map["user-invocable"]);
  const modelDisabled = modelValue === true;
  const userDisabled = userValue === false;
  const invocationPolicyValid =
    (doc.map["disable-model-invocation"] === undefined ||
      modelValue !== undefined) &&
    (doc.map["user-invocable"] === undefined || userValue !== undefined);
  const acceptableName = hostAcceptableSkillName(declaredName);
  const diagnostics = [];
  if (!doc.hasFrontmatter)
    diagnostics.push({
      level: "error",
      code: "diagnostic.frontmatter.missing",
    });
  if (doc.hasFrontmatter && !declaredName)
    diagnostics.push({ level: "error", code: "diagnostic.name.missing" });
  else if (declaredName && acceptableName === null)
    diagnostics.push({
      level: "error",
      code: "diagnostic.name.invalid",
      params: { name: declaredName },
    });
  if (doc.hasFrontmatter && !description)
    diagnostics.push({
      level: "error",
      code: "diagnostic.description.missing",
    });
  if (!invocationPolicyValid)
    diagnostics.push({ level: "error", code: "diagnostic.invocation.invalid" });
  return {
    name,
    declaredName,
    kind,
    docPath,
    description,
    modelInvocable: !modelDisabled,
    userInvocable: !userDisabled,
    invocationPolicyValid,
    hasFrontmatter: doc.hasFrontmatter,
    // 宿主不接受的格式不允许启用（loadable: false）
    loadable:
      doc.hasFrontmatter && description !== "" && acceptableName !== null,
    diagnostics,
  };
}

// ── 创建 / 详情 / Provider ─────────────────────────────────────────────────

export function yamlString(value: string) {
  return JSON.stringify(String(value));
}
