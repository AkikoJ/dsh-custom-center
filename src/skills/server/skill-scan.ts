import { rootDefinition, userRoots } from "./source-roots.js";
import { entryOf, parseSkillDoc } from "./skill-document.js";
import { lstatOrNull, resolvedPath, linkedDirectoryBundle, entryPath, isInsideResolvedRoot, pathIdentity } from "./file-operations.js";
import type { RootInput, Scan, SkillEntry, SkillRoot, DiscoveredEntry } from "../types.js";
import { discoverReadonlyEntries } from "../readonly-discovery.js";
import { promises as fs } from "node:fs";
import { resolve, join } from "node:path";
/** 只读来源递归发现。可写 DSH 根只扫一层；顶层目录链接只读列出，写入不跟随。 */
export function scanEntries(root: RootInput, options: {metadataOnly: true}): Promise<MetadataScan>;
export function scanEntries(root: RootInput, options?: {metadataOnly?: false}): Promise<Scan>;
export async function scanEntries(root: RootInput, options: {metadataOnly?: boolean} = {}): Promise<Scan | MetadataScan> {
  const definition = rootDefinition(root);
  if (definition && (!definition.mutable || definition.key === "agents")) {
    const discovered = await discoverReadonlyEntries(definition.path);
    if (options.metadataOnly) return discovered;
    const entries = [];
    for (const entry of discovered.entries) {
      try {
        entries.push({
          ...entryOf(
            entry.name,
            entry.kind,
            entry.docPath,
            parseSkillDoc(await fs.readFile(entry.realDocPath, "utf8")),
          ),
          ...entry,
        });
      } catch {
        /* 忽略已失效或不可读技能。 */
      }
    }
    return { ...discovered, entries };
  }
  const directory = definition ? definition.path : root as string;
  const rootStat = await lstatOrNull(resolve(directory));
  if (!rootStat || !rootStat.isDirectory() || rootStat.isSymbolicLink())
    return { exists: false, entries: [] };
  let items;
  try {
    items = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return { exists: false, entries: [] };
  }
  const byName = new Map<string, SkillEntry>();
  const rootReal = await resolvedPath(directory);
  for (const it of items) {
    try {
      if (it.isSymbolicLink() || (process.platform === "win32" && it.isDirectory())) {
        const linked = await linkedDirectoryBundle(directory, it.name);
        if (linked) {
          const doc = options.metadataOnly
            ? { map: {}, hasFrontmatter: false }
            : parseSkillDoc(await fs.readFile(linked.realDocPath, "utf8"));
          byName.set(it.name, {
            ...entryOf(it.name, "bundle", linked.docPath, doc),
            ...linked,
          });
          continue;
        }
        if (it.isSymbolicLink()) continue;
      }
      if (it.isDirectory() && entryPath(directory, it.name) !== null) {
        const docPath = join(directory, it.name, "SKILL.md");
        const st = await lstatOrNull(docPath);
        if (
          !st ||
          !st.isFile() ||
          st.isSymbolicLink() ||
          !(await isInsideResolvedRoot(rootReal, docPath))
        )
          continue;
        const doc = options.metadataOnly
          ? { map: {}, hasFrontmatter: false }
          : parseSkillDoc(await fs.readFile(docPath, "utf8"));
        byName.set(it.name, {
          ...entryOf(it.name, "bundle", docPath, doc),
          entryPath: join(directory, it.name),
          realDocPath: await fs.realpath(docPath),
          realEntryPath: await fs.realpath(join(directory, it.name)),
          linked: false,
        });
      } else if (
        it.isFile() &&
        it.name.toLowerCase().endsWith(".md") &&
        it.name.toLowerCase() !== "skill.md" &&
        entryPath(directory, it.name.slice(0, -3)) !== null
      ) {
        const skillName = it.name.slice(0, -3);
        if (byName.has(skillName)) continue;
        const docPath = join(directory, it.name);
        if (!(await isInsideResolvedRoot(rootReal, docPath))) continue;
        const doc = options.metadataOnly
          ? { map: {}, hasFrontmatter: false }
          : parseSkillDoc(await fs.readFile(docPath, "utf8"));
        const realDocPath = await fs.realpath(docPath);
        byName.set(skillName, {
          ...entryOf(skillName, "flat", docPath, doc),
          entryPath: docPath,
          realDocPath,
          realEntryPath: realDocPath,
          linked: false,
        });
      }
    } catch {
      /* 跳过不可读条目 */
    }
  }
  const entries = [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return { exists: true, entries };
}

/** 同一真实技能优先归属直接 SSOT；同类条目再按来源 rank 决胜。 */
export function scanDeduplicatedRoots(roots: SkillRoot[], options: {metadataOnly: true}): Promise<Map<string, MetadataScan>>;
export function scanDeduplicatedRoots(roots?: SkillRoot[], options?: {metadataOnly?: false}): Promise<Map<string, Scan>>;
export async function scanDeduplicatedRoots(roots: SkillRoot[] = userRoots(), options: {metadataOnly?: boolean} = {}) {
  const results = await Promise.all(
    roots.map(async (root) => [root, options.metadataOnly ? await scanEntries(root, {metadataOnly: true}) : await scanEntries(root)] as const),
  );
  const scans = new Map<string, MetadataScan>();
  const groups = new Map<string, {root: SkillRoot; entry: MetadataEntry}[]>();
  for (const [root, scan] of results) {
    scans.set(root.key, scan);
    for (const entry of scan.entries) {
      const identity = pathIdentity(
        entry.realEntryPath || entry.entryPath || entry.docPath,
      );
      const group = groups.get(identity) || [];
      group.push({ root, entry });
      groups.set(identity, group);
    }
  }
  const winners = new Set();
  for (const group of groups.values()) {
    group.sort(
      (left, right) =>
        Number(left.entry.linked) - Number(right.entry.linked) ||
        left.root.rank - right.root.rank,
    );
    const winner = group[0];
    winner.entry.providerRank = Math.min(
      ...group.map((item) => item.root.rank),
    );
    winner.entry.policyAliases = group.map((item) => ({
      rootKey: item.root.key,
      name: item.entry.name,
    }));
    winners.add(winner.entry);
  }
  for (const scan of scans.values()) {
    scan.entries = scan.entries.filter((entry) => winners.has(entry));
  }
  return scans;
}
export type MetadataEntry = DiscoveredEntry & {
  name: string;
  providerRank?: number;
  policyAliases?: { rootKey: string; name: string }[];
};
export interface MetadataScan {
  exists: boolean;
  entries: MetadataEntry[];
  truncated?: boolean;
}
