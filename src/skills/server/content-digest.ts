import { MAX_SOURCE_DEPTH } from "./file-operations.js";
import { MAX_UPLOAD_ENTRIES, MAX_UPLOAD_TOTAL_BYTES } from "./content-limits.js";
import { join } from "node:path";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";

/** 目录或单文件的内容摘要；含符号链接或超限时返回 null，调用方按「无法比较」处理。 */
export async function digestPath(path: string): Promise<string | null> {
  try {
    const st = await fs.lstat(path);
    if (st.isSymbolicLink()) return null;
    const hash = createHash("sha256");
    if (st.isFile()) {
      hash.update(await fs.readFile(path));
      return hash.digest("hex");
    }
    if (!st.isDirectory()) return null;
    const files: [string, string][] = [];
    let count = 0;
    let size = 0;
    const walk = async (dir: string, prefix: string, depth: number) => {
      if (depth > MAX_SOURCE_DEPTH) throw new Error("too deep");
      for (const item of await fs.readdir(dir, { withFileTypes: true })) {
        if (item.isSymbolicLink()) throw new Error("symlink");
        const full = join(dir, item.name);
        if (item.isDirectory()) { await walk(full, `${prefix}${item.name}/`, depth + 1); continue; }
        if (!item.isFile()) continue;
        const info = await fs.stat(full);
        if (++count > MAX_UPLOAD_ENTRIES || (size += info.size) > MAX_UPLOAD_TOTAL_BYTES) throw new Error("too large");
        files.push([`${prefix}${item.name}`, createHash("sha256").update(await fs.readFile(full)).digest("hex")]);
      }
    };
    await walk(path, "", 0);
    files.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return hash.update(JSON.stringify(files)).digest("hex");
  } catch {
    return null;
  }
}
