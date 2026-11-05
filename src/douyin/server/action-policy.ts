import { createHash, randomUUID } from 'node:crypto'
import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { DouyinConfig } from '../config.js'
import { videoKey, type Ledger } from './ledger.js'
import { currentExecution, type ExecutionContext } from './execution-context.js'
import type { ActionKind } from './ledger-model.js'

export const WRITE_TOOLS: ReadonlySet<string> = new Set(['douyin_like', 'douyin_comment', 'douyin_publish', 'douyin_share_video', 'douyin_chat_send', 'douyin_chat_sticker', 'douyin_chat_batch'])
export type ToolArgs = Record<string, unknown>
export function normalizeNickname(value: unknown): string {
  return String(value || '').replace(/[\u200B-\u200D\uFE0E\uFE0F]/g, '').replace(/[\s\u00A0]/g, '').toLowerCase()
}
export function allowInitiate(config: Pick<DouyinConfig, 'msgAllowTo'>, name: string): boolean {
  const key = normalizeNickname(name)
  return !!key && config.msgAllowTo.split(/[,，、\r\n]+/).some((value) => normalizeNickname(value) === key)
}
export function allowReply(config: Pick<DouyinConfig, 'dmReplyOnlyTo'>, name: string): boolean {
  const key = normalizeNickname(name)
  return !!key && config.dmReplyOnlyTo.split(/[,，、\r\n]+/).some((value) => normalizeNickname(value) === key)
}
export interface ActionPlan {
  kind: ActionKind
  key: string
  cap: number
  used: number
  peer: string
  args: ToolArgs
  error?: string
}
export interface PolicyInputs {
  config: DouyinConfig
  ledger: Ledger
  ownedVideoIds(): Promise<string[]>
  context?: ExecutionContext
}
function confinedMp4(directory: string, input: unknown): boolean {
  if (!directory.trim()) return false
  try {
    const root = realpathSync(resolve(directory)), path = realpathSync(resolve(String(input || '')))
    const rel = relative(root, path)
    return statSync(path).isFile() && !!rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel) && path.toLowerCase().endsWith('.mp4')
  } catch { return false }
}

/** Policies are evaluated while holding the account lock against the newest config and ledger. */
export async function planAction(name: string, supplied: ToolArgs, inputs: PolicyInputs): Promise<ActionPlan> {
  const { config, ledger, ownedVideoIds } = inputs
  const context = inputs.context ?? currentExecution()
  const force = context.origin === 'tool' && context.force === true
  const aid = String(supplied.aweme_id || '').match(/\d{6,}/)?.[0] || ''
  const peer = String(supplied.nickname || '').trim()
  let args = { ...supplied }
  // Payload fields never establish host authorization, including through the headless proxy.
  for (const key of ['force', '__proto__', 'constructor', 'prototype']) delete args[key]
  if (context.origin === 'headless' && name === 'douyin_publish' && config.publishDraft) args.draft = true
  const plan: ActionPlan = { kind: 'message', key: '', cap: Infinity, used: 0, peer, args }
  let allowed = false
  if (name === 'douyin_like') {
    Object.assign(plan, { kind: 'like', key: `like:${aid}:${Boolean(args.undo)}` })
    allowed = config.autoLike && !!aid
  } else if (name === 'douyin_comment') {
    if (args.reply_cid) {
      Object.assign(plan, { kind: 'reply', key: `reply:${args.reply_cid}`, cap: config.replyPerDay, used: ledger.count('reply') })
      if (!(await ownedVideoIds()).includes(aid)) return { ...plan, error: '只回复自己授权作品下面的评论' }
      allowed = config.autoReply
      args = { ...args, text: String(args.text || '').slice(0, 20), mention: '' }
    } else {
      const kind = args.mention ? 'comment' : 'plain'
      Object.assign(plan, { kind, key: `top:${aid}`, cap: kind === 'comment' ? config.commentPerDay : config.plainCommentPerDay, used: ledger.count(kind) })
      const mention = String(config.mentionName || '').trim()
      allowed = kind === 'comment' ? config.autoComment && !!mention && String(args.mention).trim() === mention : config.autoCommentPlain
      const data = ledger.read()
      if (!force && (data.comments.some((record) => String(record.aweme_id) === aid) || data.plainComments[aid])) return { ...plan, error: '这条作品已经评论过' }
      args = { ...args, text: String(args.text || '').slice(0, 150) }
    }
    if (!aid || !String(args.text || '').trim()) return { ...plan, error: '作品或评论正文为空' }
  } else if (name === 'douyin_publish') {
    Object.assign(plan, { kind: 'publish', key: `publish:${videoKey(String(args.video_path || ''))}:${args.draft ? 'draft' : 'published'}`, cap: config.publishPerDay, used: ledger.count('publish') })
    allowed = config.autoPublish
    if (context.origin === 'headless') {
      if (!confinedMp4(config.comfyOutputDir, args.video_path)) return { ...plan, error: 'headless 只能投稿已配置 ComfyUI 输出目录里的现有 MP4' }
      if (config.publishDraft) args = { ...args, draft: true }
    }
    if (!force && ledger.read().published[videoKey(String(args.video_path || ''))]) return { ...plan, error: '这个视频文件已经投稿过' }
  } else if (name === 'douyin_share_video') {
    Object.assign(plan, { kind: 'share', key: `share:${peer}:${aid}`, cap: config.sharePerDay, used: ledger.count('share') })
    allowed = !!aid && allowInitiate(config, peer)
  } else {
    const inbound = !!context.inbound?.messageId && normalizeNickname(context.inbound.contact) === normalizeNickname(peer)
    const kind = context.action === 'streak' ? 'streak' : inbound ? 'dmReply' : 'message'
    Object.assign(plan, { kind, key: context.actionKey || (inbound ? `dm:${context.inbound!.messageId}:${peer}` : kind === 'streak' ? `streak:${ledger.day()}:${peer}` : `message:${randomUUID()}`) })
    if (inbound) {
      plan.cap = config.dmReplyPerDayUnlimited ? Infinity : config.dmReplyPerDay
      plan.used = Object.entries(ledger.read().dm).filter(([key, record]) => !key.startsWith('streak:') && record.day === ledger.day()).reduce((total, [, record]) => total + Number(record.count || 0), 0)
    } else if (kind === 'streak') {
      plan.cap = config.streakPerDay
      plan.used = Object.values(ledger.read().actions).filter((action) => action.kind === 'streak' && action.day === ledger.day() && action.status === 'succeeded').length
    } else if (context.origin === 'headless') {
      plan.key = `headless-message:${ledger.day()}:${peer}:${createHash('sha256').update(JSON.stringify(args)).digest('hex')}`
      if (name === 'douyin_chat_sticker') plan.key += ':' + randomUUID()
    }
    allowed = !!peer && (inbound ? allowReply(config, peer) && (context.inbound?.source === 'watcher' ? config.dmAutoReply : config.dmReply) : allowInitiate(config, peer))
  }
  plan.args = args
  if (!force && (!allowed || plan.used >= plan.cap || plan.cap === 0)) plan.error = plan.used >= plan.cap ? '当日配额已用完' : '对应动作未授权'
  return plan
}
