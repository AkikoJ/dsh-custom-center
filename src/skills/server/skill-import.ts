import { lstatOrNull, codedError, assertNoSymbolicLinks, attachCode, pathsOverlap, entryPath, isDirectoryLink, replaceWithCopy } from "./file-operations.js";
import { toKebab, KEBAB_RE } from "./skill-document.js";
import { rootByKey } from "./source-roots.js";
import { checkedWritableRootDefinition, readonlyError } from "./root-access.js";
import { promises as fs } from "node:fs";
import { join, basename, dirname } from "node:path";
import type { ImportCandidate, Log, MutationOptions } from "./types.js";
import type { ImportPending, ImportConflict, ImportFailure, ImportResult } from "../contracts.js";
import type { CodedError, Diagnostic } from "../model.js";

// ── 导入 ────────────────────────────────────────────────────────────────────

/** 分析来源：单 skill 目录 / 单 .md 文件 / 批量目录。 */
export async function analyzeSource(source: string): Promise<SourceAnalysis> {
  let st;
  try {
    st = await fs.lstat(source);
  } catch {
    return {
      kind: "none",
      error: `路径不存在: ${source}`,
      code: "error.source.notFound",
      params: { path: source },
    };
  }
  if (st.isSymbolicLink())
    return {
      kind: "none",
      error: `不支持包含符号链接的 skill 来源: ${source}`,
      code: "error.source.symlink",
      params: { path: source },
    };
  if (st.isDirectory()) {
    const sk = join(source, "SKILL.md");
    const skSt = await lstatOrNull(sk);
    // 预检与实际导入口径一致：SKILL.md 本身是链接时直接拒绝，避免 dry-run 通过、正式导入才失败。
    if (skSt && skSt.isSymbolicLink())
      return {
        kind: "none",
        error: `不支持包含符号链接的 skill 来源: ${sk}`,
        code: "error.source.symlink",
        params: { path: sk },
      };
    if (skSt && skSt.isFile()) {
      return {
        kind: "single",
        rawName: basename(source),
        kebab: toKebab(basename(source)),
        source,
        isDir: true,
        skillFile: sk,
      };
    }
    return { kind: "batch", rawName: basename(source), source, isDir: true };
  }
  if (st.isFile() && source.toLowerCase().endsWith(".md")) {
    if (basename(source).toLowerCase() === "skill.md") {
      const parent = dirname(source);
      return {
        kind: "single",
        rawName: basename(parent),
        kebab: toKebab(basename(parent)),
        source: parent,
        isDir: true,
        skillFile: source,
      };
    }
    const rawName = basename(source).slice(0, -3);
    return {
      kind: "single",
      rawName,
      kebab: toKebab(rawName),
      source,
      isDir: false,
      skillFile: source,
    };
  }
  return {
    kind: "none",
    error: `无法识别的 skill 来源: ${source}`,
    code: "error.source.unrecognized",
    params: { path: source },
  };
}

export async function collectCandidates(dir: string): Promise<ImportCandidate[]> {
  const items = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const it of items) {
    if (it.isSymbolicLink())
      throw codedError(
        `不支持包含符号链接的 skill 来源: ${join(dir, it.name)}`,
        "error.source.symlink",
        { path: join(dir, it.name) },
      );
    if (it.isDirectory()) {
      const sk = join(dir, it.name, "SKILL.md");
      // lstatOrNull 吞掉 IO 异常（返回 null 即跳过）；symlink 必须抛出，不能被“跳过”逻辑掩盖。
      const st = await lstatOrNull(sk);
      if (st && st.isSymbolicLink())
        throw codedError(
          `不支持包含符号链接的 skill 来源: ${sk}`,
          "error.source.symlink",
          { path: sk },
        );
      if (st && st.isFile()) {
        out.push({
          source: join(dir, it.name),
          kebab: toKebab(it.name),
          rawName: it.name,
          isDir: true,
        });
      }
    } else if (
      it.isFile() &&
      it.name.toLowerCase().endsWith(".md") &&
      it.name.toLowerCase() !== "skill.md"
    ) {
      out.push({
        source: join(dir, it.name),
        kebab: toKebab(it.name.slice(0, -3)),
        rawName: it.name.slice(0, -3),
        isDir: false,
      });
    }
  }
  return out;
}

/** dry-run 预检执行与正式导入相同的符号链接/深度检查，预检失败即结论，不再进入覆盖确认。
 *  预检与实导之间来源被替换的竞态仍由实导阶段的复制后校验兜底。 */
export async function preflightCandidates(pending: ImportPending[], conflicts: ImportConflict[], failed: ImportFailure[]) {
  for (const group of [pending, conflicts]) {
    for (let i = group.length - 1; i >= 0; i--) {
      const candidate = group[i];
      try {
        await assertNoSymbolicLinks(candidate.source);
      } catch (caught) {
        const error = caught as CodedError;
        failed.push(
          attachCode(
            {
              source: candidate.source,
              error: String(error && error.message ? error.message : error),
            },
            error,
          ),
        );
        group.splice(i, 1);
      }
    }
  }
}

/**
 * 导入技能到目标根。
 * options: { conflict: 'skip'|'overwrite', dryRun: boolean }
 * 成功返回 { kind, imported, skipped, failed }；失败返回 { ok:false, error }。
 */
export async function importSkill(source: string, log?: Log, options: MutationOptions = {}): Promise<ImportResult> {
  const requestedRoot = Object.prototype.hasOwnProperty.call(options, "root") ? options.root : rootByKey("dsh");
  const definition = await checkedWritableRootDefinition(requestedRoot);
  if (definition && definition.ok === false) return definition;
  if (!definition) return readonlyError("create");
  const targetRoot = definition.path;
  const conflict = options.conflict === "overwrite" ? "overwrite" : "skip";
  const dryRun = options.dryRun === true;

  const analysis = await analyzeSource(source);
  if (analysis.kind === "none")
    return {
      ok: false,
      error: analysis.error || "无法识别的 skill 来源",
      code: analysis.code || "error.source.unrecognized",
      params: analysis.params,
    };
  if (await pathsOverlap(analysis.source, targetRoot))
    return {
      ok: false,
      error: "导入来源不能与 DSH 技能目录相同、包含或位于其中",
      code: "error.import.overlap",
    };

  let candidates = [];
  if (analysis.kind === "single") {
    candidates = [
      {
        source: analysis.source,
        kebab: analysis.kebab,
        rawName: analysis.rawName,
        isDir: analysis.isDir,
      },
    ];
  } else {
    try {
      candidates = await collectCandidates(source);
    } catch (caught) {
      const error = caught as CodedError;
      return attachCode(
        {
          ok: false,
          error: String(error && error.message ? error.message : error),
        },
        error,
      );
    }
    if (candidates.length === 0)
      return {
        ok: false,
        error: `目录下未找到任何 skill 条目（需含 SKILL.md 的子目录或 .md 文件）: ${source}`,
        code: "error.import.emptySource",
        params: { path: source },
      };
  }

  const pending: ImportPending[] = [];
  const conflicts: ImportConflict[] = [];
  const failed: ImportFailure[] = [];
  const imported: NonNullable<ImportResult["imported"]> = [];
  const skipped: NonNullable<ImportResult["skipped"]> = [];

  const nameCount = new Map<string, number>();
  for (const candidate of candidates) {
    if (
      candidate.kebab &&
      KEBAB_RE.test(candidate.kebab) &&
      entryPath(targetRoot, candidate.kebab) !== null
    )
      nameCount.set(candidate.kebab, (nameCount.get(candidate.kebab) || 0) + 1);
  }

  function failureResult() {
    return {
      ok: false,
      // 聚合失败明细的原文；前端优先展示已翻译的 failed 明细，此处仅作兜底。
      error: failed.map((item) => item.error).join("；"),
      code: "error.import.failed",
      kind: analysis.kind,
      imported,
      skipped,
      failed,
    };
  }

  for (const c of candidates) {
    if (
      !c.kebab ||
      !KEBAB_RE.test(c.kebab) ||
      entryPath(targetRoot, c.kebab) === null
    ) {
      failed.push({
        source: c.source,
        error: `无法生成合法 kebab-case 名称（原始名: ${c.rawName || basename(c.source)}）`,
        code: "error.import.invalidName",
        params: { name: c.rawName || basename(c.source) },
      });
      continue;
    }
    if (nameCount.get(c.kebab)! > 1) {
      failed.push({
        source: c.source,
        error: `批量来源中存在多个同名插件: ${c.kebab}`,
        code: "error.import.duplicateName",
        params: { name: c.kebab },
      });
      continue;
    }
    const linkPath = join(targetRoot, c.kebab);
    if (await isDirectoryLink(linkPath)) {
      failed.push({
        source: c.source,
        error: `目录链接不能删除或覆盖: ${linkPath}`,
        code: "error.skill.linked",
        params: { path: linkPath },
      });
      continue;
    }
    const dest = c.isDir
      ? join(targetRoot, c.kebab)
      : join(targetRoot, `${c.kebab}.md`);
    const paths = [
      join(targetRoot, c.kebab),
      join(targetRoot, `${c.kebab}.md`),
    ];
    const existing = [];
    for (const path of paths) {
      try {
        await fs.stat(path);
        existing.push(path);
      } catch {}
    }
    if (existing.length) {
      conflicts.push({
        name: c.kebab,
        source: c.source,
        isDir: c.isDir,
        paths: existing,
      });
      continue;
    }
    pending.push({ name: c.kebab, source: c.source, isDir: c.isDir, dest });
  }

  if (pending.length === 0 && conflicts.length === 0) return failureResult();

  if (dryRun) {
    // 预检即结论：与正式导入同口径执行符号链接/深度检查，避免预检通过、确认覆盖后实导才失败。
    await preflightCandidates(pending, conflicts, failed);
    if (pending.length === 0 && conflicts.length === 0) return failureResult();
    return { kind: analysis.kind, pending, conflicts, failed };
  }

  if (!dryRun && options.beforeImport) await options.beforeImport(pending, conflicts, failed);

  if (
    pending.length > 0 ||
    (conflict === "overwrite" && conflicts.length > 0)
  ) {
    await fs.mkdir(targetRoot, { recursive: true });
  }

  for (const p of pending) {
    try {
      const warnings = await replaceWithCopy(p.source, p.dest, p.isDir);
      imported.push({ name: p.name, overwritten: false, warnings });
      if (log) log("import", `导入 ${p.source} -> ${p.dest}`);
    } catch (caught) { const e = caught as CodedError;
      failed.push(
        attachCode(
          { source: p.source, error: String(e && e.message ? e.message : e) },
          e,
        ),
      );
    }
  }

  if (conflict === "overwrite") {
    for (const c of conflicts) {
      try {
        const dest = c.isDir
          ? join(targetRoot, c.name)
          : join(targetRoot, `${c.name}.md`);
        const warnings = await replaceWithCopy(
          c.source,
          dest,
          c.isDir,
          c.paths,
        );
        imported.push({ name: c.name, overwritten: true, warnings });
        if (log) log("import-overwrite", `覆盖导入 ${c.source} -> ${dest}`);
      } catch (caught) { const e = caught as CodedError;
        failed.push(
          attachCode(
            { source: c.source, error: String(e && e.message ? e.message : e) },
            e,
          ),
        );
      }
    }
  } else {
    for (const c of conflicts) skipped.push({ name: c.name, source: c.source });
  }

  if (failed.length && imported.length === 0) return failureResult();
  return { kind: analysis.kind, imported, skipped, failed };
}

export type SourceAnalysis =
  | ({ kind: "none" } & Diagnostic)
  | ({ kind: "single"; skillFile: string } & ImportCandidate)
  | {
    kind: "batch";
    rawName: string;
    source: string;
    isDir: boolean;
  };
