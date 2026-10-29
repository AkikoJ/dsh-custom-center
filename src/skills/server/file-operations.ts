import type { CodedError, Diagnostic, RenameOptions, OperationError, DiscoveredEntry } from "../types.js";
import { relative, resolve, isAbsolute, sep, dirname, basename, join } from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
export const WINDOWS_DEVICE_NAME_RE =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
export const MAX_SOURCE_DEPTH = 64;
export const MAX_ENTRY_NAME_LENGTH = 128;
export const MAX_BROWSE_ENTRIES = 500;
export const TRANSIENT_RENAME_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);

// ── 业务错误码 ────────────────────────────────────────────────────────────────

/** 构造带 code/params 的业务 Error，供导入链路 throw 后透传到失败明细。 */
export function codedError(message: string, code: string, params?: Record<string, unknown>): CodedError {
  const error: CodedError = new Error(message);
  error.code = code;
  error.params = params;
  return error;
}

/** 把业务 Error 的 code/params 附加到失败明细；系统异常（ENOENT 等，非 error.* 前缀）保持原文。 */
export function attachCode<T extends Diagnostic>(item: T, error: CodedError | null | undefined): T {
  if (error && typeof error.code === "string" && /^error\./.test(error.code))
    item.code = error.code;
  if (error && error.params) item.params = error.params;
  return item;
}

/** 判断 child 是否与 parent 相同或位于其内部。跨盘符时 relative 会返回绝对路径。 */
export function isSameOrDescendant(parent: string, child: string) {
  const rel = relative(resolve(parent), resolve(child));
  return (
    rel === "" ||
    (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`))
  );
}

/** 解析真实路径；中间若有目录链接，按落地目录比较重叠。 */
export async function resolvedPath(path: string) {
  try {
    return await fs.realpath(path);
  } catch {
    return resolve(path);
  }
}

/** 即使末级路径尚不存在，也解析最近既存祖先中的链接，供权限域重叠判断。 */
export async function comparisonPath(path: string) {
  let current = resolve(path);
  const missing = [];
  for (;;) {
    try {
      return resolve(await fs.realpath(current), ...missing);
    } catch {
      const parent = dirname(current);
      if (parent === current) return resolve(path);
      missing.unshift(basename(current));
      current = parent;
    }
  }
}

/** 两个路径重叠时，覆盖导入可能删除自身来源，必须拒绝。 */
export async function pathsOverlap(a: string, b: string) {
  const left = await resolvedPath(a);
  const right = await resolvedPath(b);
  return isSameOrDescendant(left, right) || isSameOrDescendant(right, left);
}

/** 预解析技能根后的根内校验，供逐条目扫描复用同一次 realpath，减少重复 IO。 */
export async function isInsideResolvedRoot(rootReal: string, path: string) {
  return isSameOrDescendant(rootReal, await resolvedPath(path));
}

export function pathIdentity(path: string) {
  const canonical = resolve(path);
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

export async function lstatOrNull(path: string) {
  try {
    return await fs.lstat(path);
  } catch {
    return null;
  }
}

/** 名称只允许一个普通路径段；不把既有技能名称限制为 kebab-case。 */
export function entryPath(root: string, name: string) {
  if (
    typeof name !== "string" ||
    name === "" ||
    name === "." ||
    name === ".." ||
    name.startsWith(".") ||
    name.length > MAX_ENTRY_NAME_LENGTH ||
    /[\\/:*?"<>|\0]/.test(name) ||
    /[. ]$/.test(name) ||
    WINDOWS_DEVICE_NAME_RE.test(name) ||
    basename(name) !== name
  )
    return null;
  const rootPath = resolve(root);
  const path = resolve(rootPath, name);
  return isSameOrDescendant(rootPath, path) && rootPath !== path ? path : null;
}

/** 同目录临时文件加 rename，避免写入中断时截断原 SKILL.md。 */
/** Windows 上杀毒软件或索引器可能短暂占用目录；只重试明确可恢复的 rename 错误。 */
export async function renameWithRetry(source: string, destination: string, options: RenameOptions = {}) {
  const rename =
    typeof options.rename === "function" ? options.rename : fs.rename;
  const maxAttempts =
    Number.isInteger(options.maxAttempts) && options.maxAttempts! > 0
      ? options.maxAttempts!
      : 6;
  const delayMs =
    Number.isFinite(options.delayMs) && options.delayMs! >= 0
      ? options.delayMs!
      : 40;
  for (let attempt = 1; ; attempt++) {
    try {
      return await rename(source, destination);
    } catch (caught) {
      const error = caught as CodedError;
      if (
        !TRANSIENT_RENAME_CODES.has(error && error.code || "") ||
        attempt >= maxAttempts
      )
        throw error;
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, delayMs * attempt),
      );
    }
  }
}

export async function removeMovedPath(path: string) {
  const st = await lstatOrNull(path);
  if (!st) return;
  if (st.isDirectory() && !st.isSymbolicLink())
    await fs.rm(path, { recursive: true, force: false });
  else await fs.unlink(path);
}

/** rename 跨盘返回 EXDEV 时：先完整复制，再在源盘原子隐藏源条目，最后清理隐藏副本。 */
export async function movePathWithFallback(source: string, destination: string, options: RenameOptions = {}) {
  try {
    await renameWithRetry(source, destination, options);
    return { copied: false, cleanupError: null };
  } catch (caught) {
    const error = caught as CodedError;
    if (!error || error.code !== "EXDEV") throw error;
  }

  const quarantine = join(
    dirname(source),
    `.${basename(source)}.dssm-move-${randomUUID()}`,
  );
  try {
    await fs.cp(source, destination, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
    });
    // 源与 quarantine 位于同一目录；成功后原技能名立即消失，避免递归删除留下半份可见条目。
    await renameWithRetry(source, quarantine, options);
  } catch (caught) {
    const error = caught as CodedError;
    await removeMovedPath(destination).catch(() => undefined);
    throw error;
  }

  let cleanupError = null;
  try {
    await removeMovedPath(quarantine);
  } catch (caught) {
    const error = caught as CodedError;
    cleanupError = error;
  }
  return { copied: true, cleanupError, quarantine };
}

export async function writeFileAtomically(path: string, content: string) {
  const temp = join(
    dirname(path),
    `.${basename(path)}.dssm-${randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(temp, content, "utf8");
    await fs.rename(temp, path);
  } catch (caught) {
    const error = caught as CodedError;
    await fs.rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

// ── 条目定位 / 扫描 ─────────────────────────────────────────────────────────

export function linkedWriteError(path: string): OperationError {
  return {
    ok: false,
    error: `目录链接不能删除或覆盖: ${path}`,
    code: "error.skill.linked",
    params: { path },
  };
}

export async function readlinkOrNull(path: string) {
  try {
    return await fs.readlink(path);
  } catch {
    return null;
  }
}

/** 目录软链接，或 Windows 上 readlink 能解开的 junction。文件链接和普通目录不是。 */
export async function isDirectoryLink(path: string) {
  const st = await lstatOrNull(path);
  if (!st) return false;
  if (st.isSymbolicLink()) {
    try {
      return (await fs.stat(path)).isDirectory();
    } catch {
      return false;
    }
  }
  if (process.platform !== "win32" || !st.isDirectory()) return false;
  return (await readlinkOrNull(path)) !== null;
}

/**
 * 可写根的顶层目录链接。只接受指向目录、且 SKILL.md 本身是普通文件的 bundle。
 * 不是目录链接时返回 null，调用方继续按真实目录处理。
 */
export async function linkedDirectoryBundle(directory: string, name: string): Promise<DiscoveredEntry | null> {
  const bundlePath = entryPath(directory, name);
  if (bundlePath === null || !(await isDirectoryLink(bundlePath))) return null;
  const docPath = join(bundlePath, "SKILL.md");
  const docStat = await lstatOrNull(docPath);
  if (!docStat?.isFile() || docStat.isSymbolicLink()) return null;
  return {
    kind: "bundle",
    docPath,
    entryPath: bundlePath,
    realDocPath: await fs.realpath(docPath),
    realEntryPath: await fs.realpath(bundlePath),
    linked: true,
  };
}

export async function safeExistingEntryPaths(root: string, name: string) {
  const paths: {path: string; fileName: string; recursive: boolean}[] = [];
  const bundle = entryPath(root, name);
  if (bundle === null) return paths;
  const flat = resolve(root, `${name}.md`);
  const bundleStat = await lstatOrNull(bundle);
  if (bundleStat && (bundleStat.isDirectory() || bundleStat.isSymbolicLink()))
    paths.push({ path: bundle, fileName: name, recursive: true });
  const flatStat = await lstatOrNull(flat);
  if (flatStat && (flatStat.isFile() || flatStat.isSymbolicLink()))
    paths.push({ path: flat, fileName: `${name}.md`, recursive: false });
  return paths;
}

/** 导入内容不接受符号链接，避免把目标目录外的内容带入技能目录。 */
export async function assertNoSymbolicLinks(source: string) {
  const pending = [{ path: source, depth: 0 }];
  while (pending.length) {
    const current = pending.pop()!;
    if (current.depth > MAX_SOURCE_DEPTH)
      throw codedError(
        `skill 来源目录层级超过 ${MAX_SOURCE_DEPTH} 层: ${source}`,
        "error.source.tooDeep",
        { depth: MAX_SOURCE_DEPTH, path: source },
      );
    const st = await fs.lstat(current.path);
    if (st.isSymbolicLink())
      throw codedError(
        `不支持包含符号链接的 skill 来源: ${current.path}`,
        "error.source.symlink",
        { path: current.path },
      );
    if (!st.isDirectory()) continue;
    const items = await fs.readdir(current.path, { withFileTypes: true });
    for (const item of items) {
      const path = join(current.path, item.name);
      if (item.isSymbolicLink())
        throw codedError(
          `不支持包含符号链接的 skill 来源: ${path}`,
          "error.source.symlink",
          { path },
        );
      if (item.isDirectory()) pending.push({ path, depth: current.depth + 1 });
    }
  }
}

export function temporaryPath(target: string, kind: string) {
  return join(
    dirname(target),
    `.${basename(target)}.dssm-${kind}-${randomUUID()}`,
  );
}

/** 先复制到同目录临时路径，复制失败时不触碰现有技能。 */
export async function copyToTemporary(source: string, target: string, isDir: boolean) {
  const temp = temporaryPath(target, "stage");
  try {
    await assertNoSymbolicLinks(source);
    if (isDir)
      await fs.cp(source, temp, { recursive: true, dereference: false });
    else await fs.copyFile(source, temp);
    await assertNoSymbolicLinks(temp);
    return temp;
  } catch (caught) {
    const error = caught as CodedError;
    await fs.rm(temp, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

/** 临时副本就绪后再替换；替换失败时尽力恢复旧条目。 */
export async function replaceWithCopy(source: string, dest: string, isDir: boolean, existing: string[] = []) {
  for (const path of [dest, ...existing]) {
    if (await isDirectoryLink(path))
      throw codedError(`目录链接不能删除或覆盖: ${path}`, "error.skill.linked", { path });
  }
  const stage = await copyToTemporary(source, dest, isDir);
  const backups = [];
  try {
    for (const path of existing) {
      const backup = temporaryPath(path, "backup");
      await fs.rename(path, backup);
      backups.push({ path, backup });
    }
    await fs.rename(stage, dest);
  } catch (caught) {
    const error = caught as CodedError;
    await fs.rm(stage, { recursive: true, force: true }).catch(() => undefined);
    const rollbackFailures = [];
    for (const item of backups.reverse()) {
      try {
        await fs.rename(item.backup, item.path);
      } catch (caught) { const rollbackError = caught as CodedError;
        rollbackFailures.push(item.backup);
      }
    }
    if (rollbackFailures.length) {
      const causeText = String(error && error.message ? error.message : error);
      throw codedError(
        `${causeText}；覆盖导入回滚失败，备份保留在: ${rollbackFailures.join("、")}`,
        "error.import.rollbackFailed",
        { path: rollbackFailures.join("; "), error: causeText },
      );
    }
    throw error;
  }
  const warnings: Diagnostic[] = [];
  for (const item of backups) {
    try {
      await fs.rm(item.backup, { recursive: true, force: true });
    } catch (caught) {
      const error = caught as CodedError;
      warnings.push({
        code: "warning.backupUncleaned",
        params: {
          path: item.backup,
          error: String(error && error.message ? error.message : error),
        },
        error: `旧版本备份未清理: ${item.backup}（${String(error && error.message ? error.message : error)}）`,
      });
    }
  }
  return warnings;
}
