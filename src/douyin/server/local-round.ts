import type { DouyinConfig } from '../config.js'
import type { Invoke } from './action-executor.js'
import type { Ledger } from './ledger.js'
import type { Memory } from './memory.js'
import type { Reports } from './reports.js'
import type { RuntimeStateStore } from './state.js'
import type { Content } from './content.js'
import type { Social } from './social.js'
import { resultItems, resultObject, videoId } from './content.js'
import { confirmed, withActionLock } from './actions.js'
import { allowInitiate } from './action-policy.js'
import { currentExecution, withExecution } from './execution-context.js'
import { mentionText, plainText } from './social.js'
import { errorMessage } from './storage.js'

export interface RoundVideo extends Record<string, unknown> { aweme_id: string; title: string; duration: number; score: number }
export function rankVideos(items: Record<string, unknown>[], ledger: Ledger, config: DouyinConfig): RoundVideo[] {
  const seen = new Set<string>(), data = ledger.read()
  return items.flatMap((item) => {
    const aid = videoId(item.aweme_id), title = String(item.title || '').trim()
    const duration = Math.max(0, Number(item.duration) || 0)
    if (!aid || !title || seen.has(aid) || data.picks[`${ledger.day()}:${aid}`] || duration > config.skipOverMin * 60000 && config.skipOverMin > 0) return []
    seen.add(aid)
    const score = Math.log10(Math.max(0, Number(item.digg_count || item.digg || 0)) + 10) * 10 + (duration > 20000 && duration < 600000 ? 3 : 0)
    return [{ ...item, aweme_id: aid, title, duration, score }]
  }).sort((left, right) => right.score - left.score)
}
export function createLocalRound(deps: { config(): DouyinConfig; ledger: Ledger; state: RuntimeStateStore; memory: Memory; reports: Reports; content: Content; social: Social; call: Invoke }) {
  const { ledger, state, memory, reports, content, social, call } = deps
  let busy = false, disposed = false
  let active: Promise<unknown> | undefined
  const execute = async (options: { manual?: boolean } = {}) => {
    if (disposed) return { ok: false, error: '本机轮次已卸载' }
    if (busy) return { ok: false, error: '本机轮次仍在运行' }
    busy = true
    try { return await withActionLock(ledger.paths.root, () => withExecution({ origin: 'timer', signal: currentExecution().signal }, async () => {
      const when = ledger.now(), day = ledger.day(), cfg = deps.config(), report = reports.file(when)
      const left = cfg.perDay > 0 ? Math.max(0, cfg.perDay - ledger.picked()) : options.manual ? Math.max(1, cfg.pickPerRound) : 0
      const actions: Record<string, unknown>[] = [], notes: string[] = []
      if (!left) return { ok: true, picked: 0, skipped: cfg.perDay ? '今日选片额度已满' : '自动刷取已关闭', report, actions }
      let items: Record<string, unknown>[] = []
      try { items = resultItems(await content.feed({ num: 12, scrolls: 6 })) } catch (error) { notes.push('推荐流：' + errorMessage(error)) }
      if (!items.length) try {
        const word = resultItems(await content.hot()).map((item) => String(item.word || '')).find(Boolean)
        if (word) { items = resultItems(await content.hotVideos({ word, num: 10 })); notes.push('推荐流为空，使用热榜：' + word) }
      } catch (error) { notes.push('热榜：' + errorMessage(error)) }
      const videos = rankVideos(items, ledger, cfg).slice(0, Math.min(5, left, Math.max(1, cfg.pickPerRound)))
      const sameDay = () => !disposed && !currentExecution().signal?.aborted && ledger.day() === day
      let picked = 0, comments = 0, commentFailures = 0
      for (const video of videos) {
        if (!sameDay()) { notes.push('已跨日，结束本轮'); break }
        const latest = ledger.read(), key = `${day}:${video.aweme_id}`
        latest.picks[key] = { ...video, day, at: ledger.now().toISOString(), source: 'local', url: `https://www.douyin.com/video/${video.aweme_id}` }
        ledger.write(latest); picked++
        reports.append(`### ${video.aweme_id}\n${video.title.replace(/[\r\n]/g, ' ')}\nhttps://www.douyin.com/video/${video.aweme_id}\n`, cfg.reportLevel, when)
        const record: Record<string, unknown> = { aweme_id: video.aweme_id, title: video.title, actions: [] }, performed = record.actions as unknown[]
        actions.push(record)
        try { record.comments = resultItems(await content.comments({ aweme_id: video.aweme_id, num: 12 })).slice(0, 3) } catch (error) { record.commentsError = errorMessage(error) }
        if (!sameDay()) break
        try { record.thumb = await content.thumb({ aweme_id: video.aweme_id }) } catch (error) { record.thumbError = errorMessage(error) }
        const config = deps.config()
        const modes = [config.autoComment && !!config.mentionName.trim() && comments < config.commentPerRound && commentFailures < 2 && ledger.count('comment') < config.commentPerDay ? 'mention' : '', config.shareToNick.trim() && allowInitiate(config, config.shareToNick) && ledger.count('share') < config.sharePerDay ? 'share' : '', config.autoCommentPlain && comments < config.commentPerRound && commentFailures < 2 && ledger.count('plain') < config.plainCommentPerDay ? 'plain' : '']
        const turn = (picked - 1) % 3
        const mode = [...modes.slice(turn), ...modes.slice(0, turn)].find(Boolean) || ''
        if (mode && sameDay() && config.watchBeforeAct) {
          try {
            const watched = resultObject(await content.watch({ aweme_id: video.aweme_id, frames: config.watchFrames, seconds: config.watchSeconds }))
            if (watched.ok !== false && typeof watched.transcript === 'string' && watched.transcript.trim()) {
              Object.assign(video, { transcript: watched.transcript, skim: config.skimOverMin > 0 && video.duration > config.skimOverMin * 60000 })
              const data = ledger.read(); Object.assign(data.picks[key]!, { watched: true, transcript: video.transcript, skim: video.skim }); ledger.write(data)
            } else record.watchError = watched.error || '没有取得转写，跳过非点赞互动'
          } catch (error) { record.watchError = errorMessage(error) }
        }
        const eligible = !config.watchBeforeAct || !!video.transcript
        if (mode && eligible && sameDay()) try {
          if (mode === 'share') performed.push({ kind: mode, result: await social.share(video, config.shareToNick) })
          else {
            comments++
            const result = await call('douyin_comment', { aweme_id: video.aweme_id, text: mode === 'mention' ? mentionText(video, config.mentionName) : plainText(video), mention: mode === 'mention' ? config.mentionName : '' }, { timeoutMs: 180000 })
            performed.push({ kind: mode, result }); if (confirmed(result)) commentFailures = 0; else commentFailures++
          }
        } catch (error) { performed.push({ kind: mode, error: errorMessage(error) }); if (mode !== 'share') commentFailures++ }
        if (!mode && sameDay() && deps.config().autoLike) try { performed.push({ kind: 'like', result: await call('douyin_like', { aweme_id: video.aweme_id, undo: false }) }) } catch (error) { performed.push({ kind: 'like', error: errorMessage(error) }) }
        if (cfg.memory) memory.video('本机挑选', video)
        reports.append(`动作记录 ${video.aweme_id}：${cfg.reportLevel === 'full' ? JSON.stringify(record) : '已挑选'}\n`, cfg.reportLevel, when)
      }
      state.bump({ ...(sameDay() ? { count: state.roundsToday() + 1, picked: ledger.picked(day) } : {}), lastRunAt: ledger.now().toISOString(), lastWhy: options.manual ? 'manual' : 'timer', lastPicked: picked, lastReport: report })
      return { ok: picked > 0, picked, report: cfg.reportLevel === 'off' ? null : report, actions, notes, source: 'local', ...(picked ? {} : { error: '没有新的可选视频' }) }
    })) } finally { busy = false }
  }
  const run = (options: { manual?: boolean } = {}) => {
    if (busy) return Promise.resolve({ ok: false, error: '本机轮次仍在运行' })
    const task = execute(options); active = task
    const clear = () => { if (active === task) active = undefined }
    void task.then(clear, clear)
    return task
  }
  const dispose = async () => { disposed = true; await active }
  return { run, dispose, busy: () => busy }
}
export type LocalRound = ReturnType<typeof createLocalRound>
