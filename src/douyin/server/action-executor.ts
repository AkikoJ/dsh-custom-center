import { randomUUID } from 'node:crypto'
import type { DouyinConfig } from '../config.js'
import { withActionLock, confirmed } from './actions.js'
import { planAction, normalizeNickname, WRITE_TOOLS, type ActionPlan, type ToolArgs } from './action-policy.js'
import { safeReply } from './reply-text.js'
import { currentExecution, type ExecutionContext } from './execution-context.js'
import { object, type ActionRecord, type LedgerData } from './ledger-model.js'
import { videoKey, type Ledger } from './ledger.js'
import type { ReplyHistory } from './reply-history.js'
import { errorMessage } from './storage.js'

export interface ToolResult extends Record<string, unknown> { ok: boolean }
export type Invoke = (name: string, args: ToolArgs, options?: { timeoutMs?: number }) => Promise<unknown>
export interface ExecutorDependencies {
  config(): DouyinConfig
  ledger: Ledger
  history: ReplyHistory
  invoke: Invoke
  ownedVideoIds(): Promise<string[]>
}
function resultOf(value: unknown): ToolResult {
  return object(value) && typeof value.ok === 'boolean' ? value as ToolResult
    : { ok: false, error: 'MCP 返回格式无效', phase: 'protocol' }
}
function reservationCount(data: LedgerData, plan: ActionPlan, day: string): number {
  return Object.values(data.actions).filter((action) => action.kind === plan.kind && action.day === day && ['pending', 'unknown'].includes(action.status)).length
}
function recordConfirmed(data: LedgerData, plan: ActionPlan, result: ToolResult, ledger: Ledger, config: DouyinConfig, context: ExecutionContext = currentExecution()): void {
  const args = plan.args
  const action = data.actions[plan.key]
  const stamp = { day: action?.day ?? ledger.day(), at: action?.at ?? ledger.now().toISOString() }
  const aid = String(args.aweme_id || '').match(/\d{6,}/)?.[0] || ''
  if (plan.kind === 'comment') {
    if (!data.comments.some((record) => record.aweme_id === aid && !record.reply_to)) data.comments.push({ ...stamp, aweme_id: aid, text: String(args.text || ''), cid: result.cid })
    data.comments = data.comments.slice(-500)
  } else if (plan.kind === 'plain') data.plainComments[aid] = { ...stamp, text: String(args.text || '').slice(0, 40) }
  else if (plan.kind === 'reply') {
    const cid = String(args.reply_cid)
    const target = context.replyTarget
    data.replies[cid] = { ...data.replies[cid], ...stamp, aweme_id: aid, text: String(args.text || ''), ok: true, verified: true, real_cid: result.cid || '' }
    if (target) Object.assign(data.replies[cid], { user: target.user, comment: target.text })
  } else if (plan.kind === 'share') data.shares[aid] = { ...stamp, aweme_id: aid, to: plan.peer }
  else if (plan.kind === 'publish') data.published[videoKey(String(args.video_path || ''))] = { ...stamp, video: args.video_path, draft: Boolean(args.draft), title: String(args.title || ''), url: String(result.url || ''), awemeId: String(result.aweme_id || result.awemeId || ''), draftId: String(result.draftId || '') }
  else if (plan.kind === 'streak') data.dm[`streak:${stamp.day}`] = { ...stamp, nickname: plan.peer, count: 1 }
  else if (plan.kind === 'dmReply') {
    const key = context.inbound?.peerId || plan.peer
    const previous = data.dm[key]
    data.dm[key] = { ...stamp, name: plan.peer, count: (previous?.day === stamp.day ? Number(previous.count || 0) : 0) + 1, exempt: false, lastMessageId: context.inbound?.messageId || '', lastReply: String(args.text || '') }
  }
}

/** All side effects cross this interface; the backend adapter cannot choose authorization. */
export function createActionExecutor(deps: ExecutorDependencies) {
  const { ledger, history, invoke } = deps
  const call = async (name: string, args: ToolArgs = {}, options?: { timeoutMs?: number }): Promise<ToolResult> => {
    if (!WRITE_TOOLS.has(name)) return resultOf(await invoke(name, args, options))
    return withActionLock(ledger.paths.root, async () => {
      const context = { ...currentExecution() }
      const config = deps.config()
      const plan = await planAction(name, args, { config, ledger, ownedVideoIds: deps.ownedVideoIds, context })
      if (plan.error) return { ok: false, blocked: true, error: plan.error, today: plan.used, perDay: plan.cap }
      if (plan.kind === 'reply' && config.replyOneShot && history.cids().has(String(args.reply_cid))) return { ok: false, already: true, error: '这条评论已经回过' }
      if (plan.kind === 'reply') {
        if (!context.replyTarget) {
          const comments = resultOf(await invoke('douyin_comments', { aweme_id: args.aweme_id, num: 100, compact: true }))
          const target = comments.ok && Array.isArray(comments.items) ? comments.items.find((entry) => object(entry) && String(entry.cid) === String(args.reply_cid)) : undefined
          if (!object(target)) return { ok: false, blocked: true, error: '未找到要回复的评论，未发送' }
          context.replyTarget = { user: String(target.user || ''), text: String(target.text || '') }
        }
        if (config.replyOncePerUser && history.users().has(context.replyTarget.user)) return { ok: false, already: true, error: '已经回复过这位用户' }
        plan.args.text = safeReply(context.replyTarget.text, String(plan.args.text || ''))
        if (!plan.args.text) return { ok: false, blocked: true, error: '回复正文为空' }
      }
      const data = ledger.read()
      const force = context.origin === 'tool' && context.force === true
      if (force) plan.key += ':' + randomUUID()
      const previous = data.actions[plan.key]
      if (previous && ['pending', 'unknown', 'succeeded'].includes(previous.status)) return { ok: false, already: true, status: previous.status, error: '该动作已经执行或待核对，禁止自动重发' }
      if (!force && plan.used + reservationCount(data, plan, ledger.day()) >= plan.cap) return { ok: false, blocked: true, error: '当日配额已用完或有待核对动作' }
      if (plan.kind === 'dmReply' && !force && !config.dmReplyPerContactUnlimited) {
        const used = Object.entries(data.dm).filter(([key, row]) => !key.startsWith('streak:') && row.day === ledger.day() && (key === context.inbound?.peerId || normalizeNickname(row.name || key) === normalizeNickname(plan.peer))).reduce((sum, [, row]) => sum + Number(row.count || 0), 0)
        const reserved = Object.values(data.actions).filter((action) => action.kind === 'dmReply' && normalizeNickname(action.peer) === normalizeNickname(plan.peer) && action.day === ledger.day() && ['pending', 'unknown'].includes(action.status)).length
        if (used + reserved >= config.dmReplyPerContact) return { ok: false, blocked: true, error: '这位联系人今天的回复额度已用完' }
      }
      if (context.origin === 'headless') {
        const group = ['comment', 'plain'].includes(plan.kind) ? ['comment', 'plain'] : [plan.kind]
        const roundCap = group.includes('comment') ? config.commentPerRound : plan.kind === 'reply' ? config.replyPerRun : Infinity
        const used = Object.values(data.actions).filter((action) => action.runId === context.runId && group.includes(action.kind) && action.status !== 'failed').length
        if (used >= roundCap) return { ok: false, blocked: true, error: '本轮动作额度已用完' }
        const aid = String(plan.args.aweme_id || '').match(/\d{6,}/)?.[0] || ''
        if (aid && !['publish', 'reply'].includes(plan.kind) && !data.picks[`${ledger.day()}:${aid}`]) {
          if (ledger.watched() >= config.perDay) return { ok: false, blocked: true, error: '今日看片额度已用完' }
          data.picks[`${ledger.day()}:${aid}`] = { day: ledger.day(), aweme_id: aid, source: 'headless-action', runId: context.runId }
        }
      }
      data.actions[plan.key] = {
        kind: plan.kind, status: 'pending', day: ledger.day(), at: ledger.now().toISOString(),
        runId: context.runId, peer: plan.peer, tool: name, args: plan.args, replyTarget: context.replyTarget,
      }
      ledger.write(data)
      let result: ToolResult
      try { result = resultOf(await invoke(name, plan.args, options)) }
      catch (error) { result = { ok: false, status: 'unknown', error: errorMessage(error) } }
      const latest = ledger.read()
      const verified = confirmed(result)
      if (!verified && plan.kind === 'share' && result.clicked) result = { ...result, ok: true, status: 'unknown', error: '已点击分享（回执未确认）' }
      const status = verified ? 'succeeded' : ['unknown', 'partial'].includes(String(result.status)) || result.ok || result.phase === 'protocol' ? 'unknown' : 'failed'
      if (!verified && result.ok && !(plan.kind === 'share' && result.clicked)) result = { ...result, ok: false, error: '已操作但未取得平台确认，未记成功且不会自动重发' }
      latest.actions[plan.key] = { ...latest.actions[plan.key], status, finishedAt: ledger.now().toISOString(), platformId: String(result.cid || result.awemeId || '') }
      if (verified) {
        recordConfirmed(latest, plan, result, ledger, deps.config(), context)
        if (context.origin === 'headless' && ['like', 'comment', 'plain', 'share'].includes(plan.kind)) {
          const aid = String(plan.args.aweme_id || '').match(/\d{6,}/)?.[0] || ''
          latest.picks[`${ledger.day()}:${aid}`] ??= { day: ledger.day(), aweme_id: aid, source: 'headless-action', runId: context.runId }
        }
      }
      ledger.write(latest)
      if (verified && plan.kind === 'reply') history.mark(String(plan.args.reply_cid), context.replyTarget?.user || '')
      return { ...result, ...(plan.kind === 'reply' ? { text: plan.args.text } : {}), status, verified }
    })
  }
  const reconcile = (limit = 10) => withActionLock(ledger.paths.root, async () => {
    const data = ledger.read()
    const candidates = Object.entries(data.actions).filter(([, record]) => record.kind === 'reply' && ['pending', 'unknown'].includes(record.status))
    // Keep legacy replies inspectable even if they predate action reservations.
    for (const [cid, record] of Object.entries(data.replies)) if (record.ok !== true && record.aweme_id && record.text && !data.actions[`reply:${cid}`]) {
      candidates.push([`reply:${cid}`, { kind: 'reply', status: 'unknown', day: String(record.day || ledger.day()), args: { aweme_id: record.aweme_id, reply_cid: cid, text: record.text } }])
    }
    const items: Record<string, unknown>[] = []
    for (const [key, action] of candidates.slice(0, Math.max(1, Math.min(50, Number(limit) || 10)))) {
      const args = object(action.args) ? action.args : {}
      try {
        const result = resultOf(await invoke('douyin_check_reply', { aweme_id: args.aweme_id, parent_cid: args.reply_cid, text: args.text }, { timeoutMs: 90000 }))
        if (result.ok && result.found === true) {
          const latest = ledger.read()
          latest.actions[key] = { ...action, status: 'succeeded', finishedAt: ledger.now().toISOString(), platformId: String(result.cid || '') }
          const plan: ActionPlan = { kind: 'reply', key, args, peer: '', cap: Infinity, used: 0 }
          const target = object(action.replyTarget) && typeof action.replyTarget.user === 'string' && typeof action.replyTarget.text === 'string'
            ? { user: action.replyTarget.user, text: action.replyTarget.text } : undefined
          recordConfirmed(latest, plan, result, ledger, deps.config(), { origin: 'timer', replyTarget: target })
          ledger.write(latest)
          history.mark(String(args.reply_cid), String(latest.replies[String(args.reply_cid)]?.user || ''))
          items.push({ cid: args.reply_cid, status: 'verified', real_cid: result.cid || '' })
        } else items.push({ cid: args.reply_cid, status: 'not-found' })
      } catch (error) { items.push({ cid: args.reply_cid, status: 'error', error: errorMessage(error) }) }
    }
    return { ok: true, checked: items.length, verified: items.filter((item) => item.status === 'verified').length, items }
  })
  return { call, reconcile }
}
export type ActionExecutor = ReturnType<typeof createActionExecutor>
export type { ActionRecord }
