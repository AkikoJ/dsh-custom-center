export type ActionStatus = 'pending' | 'unknown' | 'succeeded' | 'failed'
export type ActionKind = 'like' | 'comment' | 'plain' | 'reply' | 'share' | 'publish' | 'dmReply' | 'dmSticker' | 'streak' | 'message'
export interface DatedRecord {
  day?: string
  at?: string
  text?: string
  ok?: boolean
  user?: string
  aweme_id?: string
  awemeId?: string
  reply_to?: string
  video_id?: string
  draft?: boolean
  count?: number
  exempt?: boolean
  [key: string]: unknown
}
export interface ActionRecord extends DatedRecord {
  day: string
  kind: ActionKind
  status: ActionStatus
  runId?: string
  peer?: string
  finishedAt?: string
  platformId?: string
}
export interface PickRecord extends DatedRecord {
  day: string
  aweme_id: string
  source?: string
  watched?: boolean
  runId?: string
}
export interface LedgerData {
  schemaVersion: 2
  published: Record<string, DatedRecord>
  comments: DatedRecord[]
  replies: Record<string, DatedRecord>
  shares: Record<string, DatedRecord>
  plainComments: Record<string, DatedRecord>
  dm: Record<string, DatedRecord>
  actions: Record<string, ActionRecord>
  picks: Record<string, PickRecord>
  pickFloor: Record<string, number>
  picksMigrated?: boolean
  replyIndexMigrated?: boolean
  [key: string]: unknown
}
export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
export function localDay(date = new Date()): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

/** Reject malformed deduplication data before any caller can issue a side effect. */
export function parseLedger(raw: Record<string, unknown>): LedgerData {
  const data: Record<string, unknown> = { ...raw, schemaVersion: 2 }
  for (const name of ['published', 'replies', 'shares', 'plainComments', 'dm', 'actions', 'picks', 'pickFloor']) {
    const value = raw[name] ?? {}
    if (!object(value) || Object.values(value).some((entry) => name === 'pickFloor'
      ? typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0 : !object(entry))) throw new Error(`账本字段无效：${name}`)
    data[name] = Object.assign(Object.create(null), value)
  }
  if (raw.comments !== undefined && (!Array.isArray(raw.comments) || raw.comments.some((entry) => !object(entry)))) throw new Error('账本 comments 格式无效')
  data.comments = raw.comments ?? []
  for (const action of Object.values(data.actions as Record<string, Record<string, unknown>>)) {
    if (!['pending', 'unknown', 'succeeded', 'failed'].includes(String(action.status))) throw new Error('账本动作状态无效')
    if (typeof action.day !== 'string' || typeof action.kind !== 'string') throw new Error('账本动作字段无效')
  }
  return data as unknown as LedgerData
}
