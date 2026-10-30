import { managerHomePath } from "./source-roots.js";
import { writeFileAtomically, pathIdentity } from "./file-operations.js";
import { join } from "node:path";
import { promises as fs } from "node:fs";
import type { SkillRoot } from "../model.js";

// ── 同步：把其他 Agent 的技能复制到 DSH ─────────────────────────────────────────
// 外部 Agent 目录只读。同步是一次性复制：记录来源与内容摘要，之后源变化只标成「源已更新」，
// 由用户手动再同步；覆盖前旧版本先进回收站。

export interface SyncRecord { sourceRoot: string; sourceName: string; sourceHash: string; syncedAt: string }

export function syncRecordsPath() {
  return join(managerHomePath(), "sync-records.json");
}

export async function readSyncRecords(): Promise<Record<string, SyncRecord>> {
  try {
    const parsed = JSON.parse(await fs.readFile(syncRecordsPath(), "utf8"));
    const records = parsed && typeof parsed === "object" && parsed.records;
    return records && typeof records === "object" && !Array.isArray(records) ? records : {};
  } catch {
    return {};
  }
}

export async function writeSyncRecords(records: Record<string, SyncRecord>) {
  await fs.mkdir(managerHomePath(), { recursive: true });
  await writeFileAtomically(syncRecordsPath(), `${JSON.stringify({ version: 1, records }, null, 2)}\n`);
}

export function syncRecordKey(targetRoot: SkillRoot, name: string) {
  return `${pathIdentity(targetRoot.path)}::${name}`;
}
