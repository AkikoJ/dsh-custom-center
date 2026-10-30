import { MAX_UPLOAD_ENTRIES, MAX_UPLOAD_TOTAL_BYTES } from "./content-limits.js";
import { codedError, MAX_SOURCE_DEPTH, MAX_ENTRY_NAME_LENGTH, WINDOWS_DEVICE_NAME_RE, attachCode, isSameOrDescendant, lstatOrNull, entryPath } from "./file-operations.js";
import { parseSkillDoc, toKebab, KEBAB_RE } from "./skill-document.js";
import { managerHomePath } from "./source-roots.js";
import { importSkill } from "./skill-import.js";
import type { CodedError, OperationError } from "../model.js";
import type { UploadInput, ImportResult } from "../contracts.js";
import type { Log, MutationOptions } from "./types.js";
import { join, dirname } from "node:path";
import { promises as fs } from "node:fs";
import { unzipSync } from "fflate";
import { randomUUID } from "node:crypto";
export const MAX_UPLOAD_ARCHIVE_BYTES = 32 << 20;
export const MAX_UPLOAD_ENTRY_BYTES = 32 << 20;
export const MAX_UPLOAD_PATH_LENGTH = 512;

// ── 浏览器上传导入 ──────────────────────────────────────────────────────────

/**
 * 校验浏览器或 ZIP 提供的相对路径。上传内容始终写成普通文件，不解释 ZIP 的链接元数据。
 * 这样既不依赖浏览器泄露本机绝对路径，也不会让归档跨出管理器暂存目录。
 */
export function normalizeUploadPath(input: string) {
  const raw = String(input == null ? "" : input).replace(/\\/g, "/");
  if (
    !raw ||
    raw.length > MAX_UPLOAD_PATH_LENGTH ||
    raw.includes("\0") ||
    raw.startsWith("/") ||
    /^[A-Za-z]:/.test(raw) ||
    raw.startsWith("//")
  ) {
    throw codedError(`上传条目路径非法: ${raw}`, "error.upload.path", {
      path: raw,
    });
  }
  const directory = raw.endsWith("/");
  const parts = raw
    .split("/")
    .filter((part, index, all) =>
      directory && index === all.length - 1 ? false : true,
    );
  if (
    !parts.length ||
    parts.length > MAX_SOURCE_DEPTH ||
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        part.length > MAX_ENTRY_NAME_LENGTH ||
        WINDOWS_DEVICE_NAME_RE.test(part),
    )
  ) {
    throw codedError(`上传条目路径非法: ${raw}`, "error.upload.path", {
      path: raw,
    });
  }
  return { path: parts.join("/"), directory };
}

export function decodeUploadBase64(value: string, maxBytes: number, code = "error.upload.tooLarge") {
  const raw = String(value == null ? "" : value);
  const padding = raw.endsWith("==") ? 2 : raw.endsWith("=") ? 1 : 0;
  const dataLength = raw.length - padding;
  const firstPadding = raw.indexOf("=");
  if (
    raw.length % 4 !== 0 ||
    (firstPadding !== -1 && firstPadding !== dataLength)
  ) {
    throw codedError("上传内容不是合法 Base64", "error.upload.encoding");
  }
  const decodedLength = (raw.length / 4) * 3 - padding;
  if (decodedLength > maxBytes)
    throw codedError(`上传内容超过 ${maxBytes} 字节限制`, code, {
      limit: maxBytes,
    });
  // 避免对数 MiB 字符串使用带重复分组的正则；V8 可能在合法大文件上耗尽调用栈。
  for (let index = 0; index < dataLength; index += 1) {
    const char = raw.charCodeAt(index);
    if (
      !(
        (char >= 65 && char <= 90) ||
        (char >= 97 && char <= 122) ||
        (char >= 48 && char <= 57) ||
        char === 43 ||
        char === 47
      )
    ) {
      throw codedError("上传内容不是合法 Base64", "error.upload.encoding");
    }
  }
  const bytes = Buffer.from(raw, "base64");
  return bytes;
}

export function uploadError(error: CodedError): OperationError {
  return attachCode(
    {
      ok: false,
      error: String(error && error.message ? error.message : error),
    },
    error,
  );
}

export async function writeUploadedEntries(contentRoot: string, entries: UploadInput["entries"]) {
  if (!Array.isArray(entries) || entries.length === 0)
    throw codedError("上传内容为空", "error.upload.empty");
  if (entries.length > MAX_UPLOAD_ENTRIES)
    throw codedError(
      `上传条目超过 ${MAX_UPLOAD_ENTRIES} 个`,
      "error.upload.tooMany",
      { limit: MAX_UPLOAD_ENTRIES },
    );
  let total = 0;
  const seen = new Set();
  for (const entry of entries) {
    const normalized = normalizeUploadPath(entry && entry.path);
    const key = normalized.path.toLowerCase();
    if (seen.has(key))
      throw codedError(
        `上传内容包含重复路径: ${normalized.path}`,
        "error.upload.duplicate",
        { path: normalized.path },
      );
    seen.add(key);
    if (normalized.directory) continue;
    const bytes = decodeUploadBase64(
      entry && entry.data,
      MAX_UPLOAD_ENTRY_BYTES,
    );
    total += bytes.length;
    if (total > MAX_UPLOAD_TOTAL_BYTES)
      throw codedError(
        `上传内容总大小超过 ${MAX_UPLOAD_TOTAL_BYTES} 字节`,
        "error.upload.tooLarge",
        { limit: MAX_UPLOAD_TOTAL_BYTES },
      );
    const target = join(contentRoot, ...normalized.path.split("/"));
    if (!isSameOrDescendant(contentRoot, target))
      throw codedError(
        `上传条目路径非法: ${normalized.path}`,
        "error.upload.path",
        { path: normalized.path },
      );
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
}

export async function writeUploadedZip(contentRoot: string, encoded: string) {
  const archive = decodeUploadBase64(
    encoded,
    MAX_UPLOAD_ARCHIVE_BYTES,
    "error.upload.archiveTooLarge",
  );
  let count = 0;
  let total = 0;
  let files;
  try {
    files = unzipSync(archive, {
      filter(info) {
        const normalized = normalizeUploadPath(info.name);
        count += 1;
        if (count > MAX_UPLOAD_ENTRIES)
          throw codedError(
            `ZIP 条目超过 ${MAX_UPLOAD_ENTRIES} 个`,
            "error.upload.tooMany",
            { limit: MAX_UPLOAD_ENTRIES },
          );
        if (!normalized.directory && info.originalSize > MAX_UPLOAD_ENTRY_BYTES)
          throw codedError(
            `ZIP 条目过大: ${normalized.path}`,
            "error.upload.tooLarge",
            { limit: MAX_UPLOAD_ENTRY_BYTES },
          );
        total += normalized.directory ? 0 : info.originalSize;
        if (total > MAX_UPLOAD_TOTAL_BYTES)
          throw codedError(
            `ZIP 解压后总大小超过 ${MAX_UPLOAD_TOTAL_BYTES} 字节`,
            "error.upload.tooLarge",
            { limit: MAX_UPLOAD_TOTAL_BYTES },
          );
        return !normalized.directory;
      },
    });
  } catch (caught) {
    const error = caught as CodedError;
    if (error && /^error\./.test(String(error.code || ""))) throw error;
    throw codedError(
      `ZIP 无法解压: ${String(error && error.message ? error.message : error)}`,
      "error.upload.zipInvalid",
    );
  }
  const entries = Object.entries(files).map(([path, bytes]) => ({
    path,
    data: Buffer.from(bytes).toString("base64"),
  }));
  await writeUploadedEntries(contentRoot, entries);
}

export async function prepareUploadedSource(sessionRoot: string, input: UploadInput) {
  const contentRoot = join(sessionRoot, "content");
  await fs.mkdir(contentRoot, { recursive: true });
  if (input && input.zip !== undefined)
    await writeUploadedZip(contentRoot, input.zip);
  else await writeUploadedEntries(contentRoot, input && input.entries);

  const rootSkill = join(contentRoot, "SKILL.md");
  const rootSkillStat = await lstatOrNull(rootSkill);
  if (!rootSkillStat || !rootSkillStat.isFile()) return contentRoot;

  const doc = parseSkillDoc(await fs.readFile(rootSkill, "utf8"));
  const fallback = String((input && input.name) || "uploaded-skill")
    .replace(/\.zip$/i, "")
    .replace(/^skill\.md$/i, "uploaded-skill");
  const skillName = toKebab(doc.map.name || fallback);
  if (
    !skillName ||
    !KEBAB_RE.test(skillName) ||
    entryPath(contentRoot, skillName) === null
  ) {
    throw codedError(
      `无法生成合法 kebab-case 名称（原始名: ${doc.map.name || fallback}）`,
      "error.import.invalidName",
      { name: doc.map.name || fallback },
    );
  }
  const batchRoot = join(sessionRoot, "batch");
  const wrappedRoot = join(batchRoot, skillName);
  await fs.mkdir(batchRoot, { recursive: true });
  await fs.rename(contentRoot, wrappedRoot);
  return batchRoot;
}

/**
 * 接收浏览器读取后的内容，在 manager 私有目录暂存并复用现有原子导入链路。
 * input: { name, entries:[{path,data(base64)}] } 或 { name, zip:base64 }。
 */
export async function importUploadedSkill(input: UploadInput, log?: Log, options: MutationOptions = {}): Promise<ImportResult> {
  const uploadHome = join(managerHomePath(), "uploads");
  const sessionRoot = join(uploadHome, `.upload-${randomUUID()}`);
  try {
    await fs.mkdir(sessionRoot, { recursive: true });
    const source = await prepareUploadedSource(sessionRoot, input || {});
    return await importSkill(source, log, options);
  } catch (caught) {
    const error = caught as CodedError;
    return uploadError(error);
  } finally {
    await fs
      .rm(sessionRoot, { recursive: true, force: true })
      .catch(() => undefined);
  }
}
