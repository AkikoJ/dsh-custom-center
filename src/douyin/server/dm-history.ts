import { join } from 'node:path'
import { readdirSync } from 'node:fs'
import type { DouyinPaths } from './paths.js'
import { readRequiredObject, writeJson } from './storage.js'
import { localDay, object } from './ledger-model.js'

export interface DmRecord {
  day: string; name: string; text: string; key: string; messageId: string; kind: string; at: number
  status: 'pending' | 'unknown' | 'sent' | 'failed'; replied: boolean; replyText?: string; replyAt?: number; tries: number
  runId?: string; finished?: boolean; failed?: boolean; error?: string
  details?: DmDetail[]
}
export interface DmDetail { mode: 'fast' | 'headless' | 'preset'; system?: string; user?: string; provider?: string; model?: string; images?: number; tools?: { name: string; status: string }[] }
export function createDmHistory(paths: DouyinPaths, now: () => Date = () => new Date()) {
  const day = (timestamp = now().getTime()) => localDay(new Date(timestamp))
  const file = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('私信日志日期无效')
    return join(paths.file('dm-log'), date + '.json')
  }
  const readDay = (date: string): DmRecord[] => {
    const raw = readRequiredObject(file(date))
    if (raw.items !== undefined && (!Array.isArray(raw.items) || raw.items.some((row) => !object(row) || typeof row.key !== 'string' || typeof row.name !== 'string'))) throw new Error('私信日志格式无效')
    return (raw.items ?? []).filter(object).map((row: Record<string, unknown>) => ({ ...row, day: date })) as DmRecord[]
  }
  const read = () => [...readDay(day(now().getTime() - 86400000)), ...readDay(day())]
  const all = () => {
    let names: string[] = []
    try { names = readdirSync(paths.file('dm-log')) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    return names.filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().slice(-120).flatMap((name) => readDay(name.slice(0, 10)))
  }
  const cursors = () => {
    const records = readRequiredObject(paths.file('dm-cursors.json'))
    if (Object.values(records).some((row) => !object(row) || typeof row.key !== 'string' || typeof row.name !== 'string')) throw new Error('私信游标格式无效')
    return records
  }
  const prior = (name: string, key: string) => {
    const recent = read().reverse().find((row) => row.key === key)
    const last = cursors()[name]
    return recent || (object(last) && last.key === key ? last as unknown as DmRecord : null)
  }
  const put = (entry: DmRecord) => {
    const rows = readDay(entry.day), index = rows.findIndex((row) => row.key === entry.key)
    if (index < 0) rows.push(entry); else rows[index] = entry
    writeJson(file(entry.day), { day: entry.day, items: rows.slice(-300) })
    const records = cursors(), last = records[entry.name]
    if (!object(last) || entry.at >= Number(last.at || 0)) { records[entry.name] = entry; writeJson(paths.file('dm-cursors.json'), records) }
  }
  const seen = () => {
    const raw = readRequiredObject(paths.file('dm-seen.json'))
    if (raw.ids !== undefined && !Array.isArray(raw.ids)) throw new Error('私信已读索引格式无效')
    return new Set<string>((raw.ids ?? []).map(String))
  }
  const clearSeen = () => { writeJson(paths.file('dm-seen.json'), { ids: [] }); return { ok: true } }
  return { day, read, all, prior, put, seen, clearSeen }
}
export type DmHistory = ReturnType<typeof createDmHistory>
