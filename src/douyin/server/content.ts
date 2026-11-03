import type { DouyinConfig } from '../config.js'
import type { Invoke } from './action-executor.js'
import { object } from './ledger-model.js'

export function bounded(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = Number(value)
  return Math.max(minimum, Math.min(Number.isFinite(number) && number !== 0 ? Math.floor(number) : fallback, maximum))
}
export function videoId(value: unknown) { return String(value || '').trim().match(/\d{6,}/)?.[0] || '' }
export function resultObject(value: unknown): Record<string, unknown> { return object(value) ? value : { ok: false, error: '平台返回格式无效' } }
export function resultItems(value: unknown): Record<string, unknown>[] {
  const result = resultObject(value)
  return result.ok !== false && Array.isArray(result.items) ? result.items.filter(object) : []
}

/** Read-only platform operations, with the upstream input bounds and timeouts. */
export function createContent(config: () => DouyinConfig, call: Invoke) {
  const feed = (args: Record<string, unknown> = {}) => call('douyin_feed', { skip_live: config().skipLive, num: bounded(args.num, 10, 1, 50), scrolls: bounded(args.scrolls, 6, 1, 30) }, { timeoutMs: 240000 })
  const hot = (args: Record<string, unknown> = {}) => call('douyin_hot', { limit: bounded(args.limit, 30, 1, 100) }, { timeoutMs: 90000 })
  const hotVideos = (args: Record<string, unknown> = {}) => call('douyin_hot_videos', { sentence_id: String(args.sentence_id || '').trim(), word: String(args.word || '').trim(), num: bounded(args.num, 10, 1, 60) }, { timeoutMs: 120000 })
  const search = (args: Record<string, unknown> = {}) => call('douyin_search', { keyword: String(args.keyword || ''), num: bounded(args.num, 10, 1, 50), order: String(args.order || 'general') }, { timeoutMs: 120000 })
  const video = (args: Record<string, unknown>) => call('douyin_video', { aweme_id: String(args.aweme_id || '').trim() }, { timeoutMs: 90000 })
  const comments = (args: Record<string, unknown>) => call('douyin_comments', { aweme_id: String(args.aweme_id || '').trim(), num: bounded(args.num, 30, 1, 100) }, { timeoutMs: 120000 })
  const watch = (args: Record<string, unknown>) => call('douyin_watch', { aweme_id: String(args.aweme_id || '').trim(), frames: bounded(args.frames, config().watchFrames, 3, 48), seconds: bounded(args.seconds, 300, 15, 600) }, { timeoutMs: 600000 })
  const posts = (args: Record<string, unknown> = {}) => call('douyin_my_posts', { days: bounded(args.days, 1, 1, 30) }, { timeoutMs: 90000 })
  const thumb = (args: Record<string, unknown>) => call('douyin_thumb', { aweme_id: String(args.aweme_id || '').trim() }, { timeoutMs: 120000 })
  return { feed, hot, hotVideos, search, video, comments, watch, posts, thumb }
}
export type Content = ReturnType<typeof createContent>
