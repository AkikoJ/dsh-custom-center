import type { ToolDefinition, ToolRuntime } from '@deepseek-ai/dsh-tools'
import { runManual } from './run-mode.js'
import { TOOL_CONTRACTS } from '../contracts.js'
import type { DouyinRuntime } from './runtime.js'
import { withExecution } from './execution-context.js'
import { resultObject } from './content.js'
import { errorMessage } from './storage.js'

export function toolHandlers(runtime: DouyinRuntime) {
  const r = runtime
  const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
    cc_dy_status: r.status.snapshot,
    cc_dy_chrome_open: (a) => r.browser.open(Number(a.port) || undefined),
    cc_dy_config: async (a) => a.patch === undefined ? { ok: true, config: r.config() } : { ok: true, ...await r.configuration.persist(a.patch), config: r.config() },
    cc_dy_whoami: r.browser.whoami,
    cc_dy_logout: r.browser.logout,
    cc_dy_login_start: r.browser.qr,
    cc_dy_login_poll: r.browser.poll,
    cc_dy_login_sms: (a) => r.browser.sms(String(a.phone || '')),
    cc_dy_login_sms_submit: (a) => r.browser.submit(String(a.code || '')),
    cc_dy_reply_round: r.replies.round,
    cc_dy_chat_send: r.dm.send,
    cc_dy_chat_sticker: r.dm.sticker,
    cc_dy_reconcile_pending: (a) => r.executor.reconcile(Number(a.limit) || 10),
    cc_dy_dm_inbox: r.dm.inbox,
    cc_dy_watch: r.content.watch,
    cc_dy_dm_poll: () => r.dm.poll('manual'),
    cc_dy_cleanup: (a) => r.cleanup.run({ thumbDays: optionalDays(a.thumbDays), reportDays: optionalDays(a.reportDays) }),
    cc_dy_dm_round: r.dm.round,
    cc_dy_share: async (a) => {
      const video = a.title ? a : { ...resultObject(await r.content.video(a)), aweme_id: a.aweme_id }
      return r.social.share(video, String(a.to || r.config().shareToNick), { understand: true })
    },
    cc_dy_thumb: r.content.thumb,
    cc_dy_my_posts: r.content.posts,
    cc_dy_my_videos: r.publication.videos,
    cc_dy_reply: r.replies.single,
    cc_dy_feed: r.content.feed,
    cc_dy_hot: r.content.hot,
    cc_dy_hot_videos: r.content.hotVideos,
    cc_dy_search: r.content.search,
    cc_dy_video: r.content.video,
    cc_dy_comments: r.content.comments,
    cc_dy_like: (a) => r.call('douyin_like', { aweme_id: a.aweme_id, undo: a.undo === true }),
    cc_dy_comment: (a) => {
      const mention = a.reply_cid ? '' : r.config().mentionName.trim()
      const text = String(a.text || '').trim()
      return r.call('douyin_comment', { aweme_id: a.aweme_id, text: mention && !text.includes('@' + mention) ? `@${mention} ${text}` : text, reply_cid: a.reply_cid || '', mention })
    },
    cc_dy_publish: r.publication.publish,
    cc_dy_comfy_list: (a) => r.comfy.list(Number(a.limit) || undefined),
    cc_dy_run: (a) => runManual(r.config(), a.mode, () => r.local.run({ manual: true }), () => r.headless.run('manual')),
    cc_dy_selfcheck: r.status.selfcheck,
  }
  return handlers
}
function optionalDays(value: unknown) { return value === undefined ? undefined : Math.max(0, Math.min(3650, Math.floor(Number(value) || 0))) }

export function createToolDefinitions(runtime: DouyinRuntime): ToolDefinition[] {
  const handlers = toolHandlers(runtime)
  return TOOL_CONTRACTS.map((contract): ToolDefinition => ({
    ...contract,
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const text = JSON.stringify(value)
        return [{ type: 'text', text: text.length <= 40000 ? text : text.slice(0, 39920) + '\n[结果过长，已截断；缩小条数后重试]' }]
      },
    },
    async execute(input, execution) {
      const args = resultObject(input)
      const force = ['cc_dy_like', 'cc_dy_comment', 'cc_dy_publish'].includes(contract.name) && args.force === true
      return runtime.track(() => withExecution({ origin: 'tool', signal: execution.signal, force }, async () => {
        execution.signal.throwIfAborted()
        try { return JSON.parse(JSON.stringify(resultObject(await handlers[contract.name](args)))) as Record<string, unknown> }
        catch (error) { return { ok: false, error: errorMessage(error) } }
      }))
    },
  }))
}

/** Roll back earlier registrations if a collision occurs midway. */
export function registerTools(tools: Pick<ToolRuntime, 'register'>, runtime: DouyinRuntime): () => void {
  const disposers: (() => void)[] = []
  const dispose = () => { for (const stop of disposers.splice(0).reverse()) stop() }
  try { for (const definition of createToolDefinitions(runtime)) disposers.push(tools.register(definition)) }
  catch (error) { dispose(); throw error }
  return dispose
}
