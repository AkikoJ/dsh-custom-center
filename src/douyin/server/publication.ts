import { existsSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import type { DouyinConfig } from '../config.js'
import type { Invoke } from './action-executor.js'
import type { Comfy } from './comfy.js'
import type { Ledger } from './ledger.js'
import { withActionLock } from './actions.js'
import { currentExecution } from './execution-context.js'
import { errorMessage } from './storage.js'
import { resultObject } from './content.js'

export function createPublication(config: () => DouyinConfig, ledger: Ledger, comfy: Comfy, call: Invoke) {
  const publish = (args: Record<string, unknown>) => withActionLock(ledger.paths.root, async () => {
    const cfg = config(), context = currentExecution(), force = context.origin === 'tool' && context.force === true
    const cap = cfg.publishPerDay, done = ledger.count('publish')
    if (!force && (!cfg.autoPublish || !cap || done >= cap)) return { ok: false, blocked: true, todayPublished: done, cap, error: !cfg.autoPublish ? '自动发布视频已关闭' : '今日投稿额度已满，未排队生成工作流' }
    const draft = args.draft === undefined ? cfg.publishDraft : Boolean(args.draft)
    const title = String(args.title || '').trim() || (cfg.publishTitle || `日常 ${ledger.day()}`).replace(/\{date\}/g, ledger.day())
    const tags = String(args.tags || cfg.publishTags).trim()
    let video = String(args.video_path || '').trim(), generated: Awaited<ReturnType<Comfy['runWorkflow']>> | null = null
    if (!video && args.latest) {
      try { if (cfg.comfyWorkflow.trim()) generated = await comfy.runWorkflow() }
      catch (error) { return { ok: false, error: 'ComfyUI 出片失败：' + errorMessage(error) } }
      video = generated?.video || comfy.list(1).items[0]?.path || ''
    }
    if (!video) return { ok: false, error: '没有可投稿的 MP4，请给 video_path 或配置 ComfyUI 输出目录' }
    if (!existsSync(video) || !statSync(video).isFile() || !/\.mp4$/i.test(video)) return { ok: false, error: '投稿文件必须是现有 MP4' }
    const result = resultObject(await call('douyin_publish', { video_path: video, title, tags, draft }, { timeoutMs: 300000 }))
    return { ...result, video, title, tags, draft, comfy: generated, todayPublished: ledger.count('publish'), cap }
  })
  const videos = () => {
    const items = Object.values(ledger.read().published).map((record) => ({ aweme_id: String(record.awemeId || record.video_id || ''), video: String(record.video || ''), name: basename(String(record.video || '')), draft: Boolean(record.draft), url: record.url || '', at: record.at || '' }))
    return { ok: true, count: items.length, items, hint: items.length ? '这些是我投过的；评论用 cc_dy_comments 读' : '我还没有投过视频' }
  }
  return { publish, videos }
}
export type Publication = ReturnType<typeof createPublication>
