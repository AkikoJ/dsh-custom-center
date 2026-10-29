import { lstatOrNull, MAX_BROWSE_ENTRIES, entryPath, resolvedPath, linkedDirectoryBundle, isInsideResolvedRoot, isSameOrDescendant } from "./file-operations.js";
import { rootDefinition, userRoots, rootByKey } from "./source-roots.js";
import { scanDeduplicatedRoots } from "./skill-scan.js";
import { projectRoots } from "./workspaces.js";
import { parseSkillDoc, entryOf } from "./skill-document.js";
import { homedir } from "node:os";
import { isAbsolute, join, dirname, basename, resolve } from "node:path";
import { promises as fs } from "node:fs";
import type { CodedError, RootInput, DiscoveredEntry, SkillRoot, ScopeOptions } from "../types.js";
import { validDiscoveryName, discoverReadonlyEntries } from "../readonly-discovery.js";
/**
 * 为前端内嵌目录选择器列出一个本机目录层级。
 * 不跟随目录符号链接；选择后的导入仍由 importSkill 做完整安全校验。
 */
export async function browseDirectories(inputPath: string) {
  const requested = String(inputPath == null ? "" : inputPath).trim();
  const target = requested === "" ? homedir() : requested;
  if (!isAbsolute(target)) {
    return {
      ok: false,
      error: `目录路径必须是绝对路径: ${target}`,
      code: "error.browse.absolute",
      params: { path: target },
    };
  }

  let canonical;
  let directory;
  try {
    canonical = await fs.realpath(target);
    directory = await fs.stat(canonical);
  } catch (caught) {
    const error = caught as CodedError;
    return {
      ok: false,
      error: `无法读取目录: ${target}`,
      code: "error.browse.unreadable",
      params: {
        path: target,
        error: String(error && error.message ? error.message : error),
      },
    };
  }
  if (!directory.isDirectory()) {
    return {
      ok: false,
      error: `不是目录: ${target}`,
      code: "error.browse.notDirectory",
      params: { path: target },
    };
  }

  const entries = [];
  let truncated = false;
  try {
    const items = await fs.readdir(canonical, { withFileTypes: true });
    for (const item of items) {
      // 目录链接不在浏览器中展开，避免选择器在不知情时跨越到另一棵目录树。
      if (!item.isDirectory() || item.isSymbolicLink()) continue;
      // Dirent 来自一次目录快照；再用 lstat 校验当前条目，既收紧 TOCTOU 窗口，
      // 也明确排除 Windows junction 等重解析目录。
      const childPath = join(canonical, item.name);
      const childStat = await lstatOrNull(childPath);
      if (!childStat || !childStat.isDirectory() || childStat.isSymbolicLink())
        continue;
      if (entries.length >= MAX_BROWSE_ENTRIES) {
        truncated = true;
        break;
      }
      entries.push({
        name: item.name,
        path: childPath,
        hidden: item.name.startsWith("."),
      });
    }
  } catch (caught) {
    const error = caught as CodedError;
    return {
      ok: false,
      error: `无法读取目录: ${canonical}`,
      code: "error.browse.unreadable",
      params: {
        path: canonical,
        error: String(error && error.message ? error.message : error),
      },
    };
  }
  entries.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
      numeric: true,
    }),
  );

  const crumbs = [];
  let cursor = canonical;
  for (;;) {
    const parent = dirname(cursor);
    crumbs.unshift({
      name: parent === cursor ? cursor : basename(cursor),
      path: cursor,
      hidden: false,
    });
    if (parent === cursor) break;
    cursor = parent;
  }
  return { path: canonical, home: homedir(), crumbs, entries, truncated };
}

/** 按名称解析条目（bundle 优先，其次 flat）。找不到返回 null。 */
export async function resolveEntry(root: RootInput, name: string): Promise<DiscoveredEntry | null> {
  const definition = rootDefinition(root);
  if (definition && (!definition.mutable || definition.key === "agents")) {
    if (!validDiscoveryName(name)) return null;
    return (
      (await discoverReadonlyEntries(definition.path)).entries.find(
        (entry) => entry.name === name,
      ) || null
    );
  }
  const directory = definition ? definition.path : root as string;
  try {
    const bundlePath = entryPath(directory, name);
    if (bundlePath === null) return null;
    const rootPath = resolve(directory);
    const rootStat = await lstatOrNull(rootPath);
    if (!rootStat || !rootStat.isDirectory() || rootStat.isSymbolicLink())
      return null;
    const rootReal = await resolvedPath(rootPath);
    const linked = await linkedDirectoryBundle(directory, name);
    if (linked) return linked;
    const bundleStat = await lstatOrNull(bundlePath);
    if (
      bundleStat &&
      bundleStat.isDirectory() &&
      !bundleStat.isSymbolicLink()
    ) {
      const bundleDoc = join(bundlePath, "SKILL.md");
      const docStat = await lstatOrNull(bundleDoc);
      if (
        docStat &&
        docStat.isFile() &&
        !docStat.isSymbolicLink() &&
        (await isInsideResolvedRoot(rootReal, bundleDoc))
      ) {
        return {
          kind: "bundle",
          docPath: bundleDoc,
          entryPath: bundlePath,
          realDocPath: await fs.realpath(bundleDoc),
          realEntryPath: await fs.realpath(bundlePath),
          linked: false,
        };
      }
    }
    const flatDoc = resolve(rootPath, `${name}.md`);
    if (!isSameOrDescendant(rootPath, flatDoc) || rootPath === flatDoc)
      return null;
    const flatStat = await lstatOrNull(flatDoc);
    if (
      flatStat &&
      flatStat.isFile() &&
      !flatStat.isSymbolicLink() &&
      (await isInsideResolvedRoot(rootReal, flatDoc))
    ) {
      const realDocPath = await fs.realpath(flatDoc);
      return {
        kind: "flat",
        docPath: flatDoc,
        entryPath: flatDoc,
        realDocPath,
        realEntryPath: realDocPath,
        linked: false,
      };
    }
    return null;
  } catch {
    // lstat 与 realpath/readFile 之间允许来源变化，调用方统一按不存在处理。
    return null;
  }
}

/** 详情与列表共享路径去重，扫描定位信息时不读取无关技能正文。 */
export async function visibleEntryForRoot(root: SkillRoot, name: string) {
  if (!validDiscoveryName(name)) return null;
  const roots = root.scope === "project" ? [root] : userRoots();
  const scans = await scanDeduplicatedRoots(roots, { metadataOnly: true });
  return (
    scans.get(root.key)?.entries.find((entry) => entry.name === name) || null
  );
}

export async function skillDetail(key: string, name: string, options: ScopeOptions & { workspaceBound?: boolean } = {}) {
  const scopedRoots = await projectRoots(options.projectCwds);
  const root = options.workspaceBound ? scopedRoots.find((item) => item.key === key) : rootByKey(key) || scopedRoots.find((item) => item.key === key);
  if (!root)
    return {
      ok: false,
      error: `未知技能来源: ${key}`,
      code: "error.root.unknown",
      params: { root: key },
    };
  const entry = await visibleEntryForRoot(root, name);
  if (!entry)
    return {
      ok: false,
      error: `技能不存在: ${name}`,
      code: "error.skill.notFound",
      params: { name },
    };
  let raw;
  try {
    raw = await fs.readFile(entry.realDocPath || entry.docPath, "utf8");
  } catch {
    return {
      ok: false,
      error: `技能不存在: ${name}`,
      code: "error.skill.notFound",
      params: { name },
    };
  }
  const doc = parseSkillDoc(raw);
  const summary = entryOf(name, entry.kind, entry.docPath, doc);
  return {
    root: root.key,
    name,
    declaredName: summary.declaredName,
    description: summary.description,
    path: entry.docPath,
    kind: entry.kind,
    body: doc.body.trim(),
    document: raw,
    frontmatter: summary.hasFrontmatter
      ? Object.fromEntries(Object.entries(doc.map))
      : null,
    diagnostics: summary.diagnostics,
    loadable: summary.loadable,
    sourceReadOnly: !root.mutable || entry.linked === true,
  };
}

/**
 * Open a skill's folder in the system file manager.
 * @param root - Skill root
 * @param name - Skill name
 * @param options - Scope options
 * @returns Success or error result
 */
/**
 * 在系统文件管理器中打开技能所在的文件夹
 */
export async function openSkillFolder(root: RootInput, name: string, options: ScopeOptions = {}) {
  const definition = rootDefinition(root);

  if (!definition) {
    return {
      ok: false,
      error: `未知技能来源`,
      code: "error.root.unknown",
    };
  }

  const entry = await visibleEntryForRoot(definition, name);
  if (!entry) {
    return {
      ok: false,
      error: `技能不存在: ${name}`,
      code: "error.skill.notFound",
      params: { name },
    };
  }

  const skillPath = entry.docPath;
  const folderPath = dirname(skillPath);

  try {
    const { spawn } = await import("node:child_process");
    const platform = process.platform;

    if (platform === "darwin") {
      spawn("open", [folderPath], { detached: true, stdio: "ignore" }).unref();
    } else if (platform === "win32") {
      spawn("explorer", [folderPath], { detached: true, stdio: "ignore" }).unref();
    } else {
      // Linux and other Unix-like systems
      spawn("xdg-open", [folderPath], { detached: true, stdio: "ignore" }).unref();
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: `无法打开文件夹: ${(error as Error).message}`,
      code: "error.open.failed",
      params: { error: (error as Error).message },
    };
  }
}
