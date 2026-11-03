import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { DouyinPaths } from './paths.js'
import { readJson, readRequiredObject, writeJson } from './storage.js'
import { localDay, parseLedger, type ActionKind, type DatedRecord, type LedgerData } from './ledger-model.js'

export function videoKey(path: string): string {
  try { const stat = statSync(path); return `${path}|${stat.size}|${Math.round(stat.mtimeMs)}` }
  catch { return String(path) }
}
export function createLedger(paths: DouyinPaths, now: () => Date = () => new Date()) {
  const day = () => localDay(now())
  const read = (): LedgerData => {
    const data = parseLedger(readRequiredObject(paths.ledger))
    if (!data.picksMigrated) {
      if (existsSync(paths.reports)) for (const name of readdirSync(paths.reports).filter((file) => /^\d{4}-\d{2}-\d{2}\.md$/.test(file))) {
        const date = name.slice(0, 10)
        const text = readFileSync(join(paths.reports, name), 'utf8').replace(/```[\s\S]*?```/g, '')
        for (const match of text.matchAll(/^###[ \t]+(\d{6,})/gm)) data.picks[`${date}:${match[1]}`] = { day: date, aweme_id: match[1], source: 'legacy-report' }
      }
      const state = readJson<Record<string, unknown>>(paths.state, {})
      if (typeof state.day === 'string') data.pickFloor[state.day] = Math.max(0, Number(state.picked) || 0)
      data.picksMigrated = true
    }
    return data
  }
  const write = (data: LedgerData) => writeJson(paths.ledger, data)
  const stamp = (record: DatedRecord): DatedRecord => ({ day: day(), at: now().toISOString(), ...record })
  const count = (kind: ActionKind, date = day()): number => {
    const data = read()
    const records = kind === 'comment' ? data.comments
      : Object.values(kind === 'publish' ? data.published : kind === 'reply' ? data.replies
        : kind === 'share' ? data.shares : kind === 'plain' ? data.plainComments : {})
    const confirmed = records.filter((record) => record.day === date && (kind !== 'reply' || record.ok === true)).length
    return Math.max(confirmed, Object.values(data.actions).filter((action) => action.day === date && action.kind === kind && action.status === 'succeeded').length)
  }
  const picked = (date = day()) => {
    const data = read()
    return Math.max(Number(data.pickFloor[date] || 0), Object.values(data.picks).filter((pick) => pick.day === date && pick.source !== 'headless-action').length)
  }
  const watched = (date = day()) => Object.values(read().picks).filter((pick) => pick.day === date && pick.watched).length
  const noteComment = (record: DatedRecord) => {
    const data = read()
    if (data.comments.some((previous) => previous.aweme_id === record.aweme_id && previous.reply_to === record.reply_to)) return
    data.comments.push(stamp(record))
    data.comments = data.comments.slice(-500)
    write(data)
  }
  const note = (collection: 'published' | 'replies' | 'shares' | 'plainComments' | 'dm', key: string, record: DatedRecord) => {
    const data = read()
    data[collection][key] = stamp(record)
    write(data)
  }
  const archivePath = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('归档日期无效')
    const [year, month, dateOfMonth] = date.split('-')
    return join(paths.file('ledger'), year, month, `${dateOfMonth}.json`)
  }
  const prune = (data = read()): LedgerData => {
    const buckets = new Map<string, { replies: Record<string, DatedRecord>; comments: DatedRecord[] }>()
    const bucket = (date: string) => {
      if (!buckets.has(date)) buckets.set(date, { replies: {}, comments: [] })
      return buckets.get(date)!
    }
    for (const [cid, record] of Object.entries(data.replies)) if (record.day && record.day !== day()) bucket(record.day).replies[cid] = record
    for (const record of data.comments) if (record.day && record.day !== day()) bucket(record.day).comments.push(record)
    for (const [date, records] of buckets) {
      const file = archivePath(date)
      const previous = readRequiredObject(file)
      const prior = parseLedger(previous)
      // Make retry after an interrupted archive/main write idempotent.
      const comments = [...new Map([...prior.comments, ...records.comments].map((record) => [JSON.stringify(record), record])).values()]
      writeJson(file, { ...previous, day: date, replies: { ...prior.replies, ...records.replies }, comments })
      for (const cid of Object.keys(records.replies)) delete data.replies[cid]
      data.comments = data.comments.filter((record) => record.day !== date)
    }
    write(data)
    return data
  }
  const lastPublished = () => Object.values(read().published).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0] ?? null
  return { paths, day, now, read, write, count, picked, watched, noteComment, note, prune, archivePath, lastPublished }
}
export type Ledger = ReturnType<typeof createLedger>
