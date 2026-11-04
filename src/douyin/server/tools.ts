import type { ToolDefinition, ToolRuntime } from '@deepseek-ai/dsh-tools'
import { TOOL_CONTRACTS } from '../contracts.js'
import type { DouyinRuntime } from './runtime.js'
import { withExecution } from './execution-context.js'
import { resultObject } from './content.js'
import { errorMessage } from './storage.js'

export function toolHandlers(runtime: DouyinRuntime) {
  const r = runtime
  const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
    dy_status: r.status.snapshot,
    dy_chrome_open: (a) => r.browser.open(Number(a.port) || undefined),
    dy_config: async (a) => a.patch === undefined ? { ok: true, config: r.config() } : { ok: true, ...await r.configuration.persist(a.patch), config: r.config() },
    dy_whoami: r.browser.whoami,
    dy_login_start: r.browser.qr,
    dy_login_poll: r.browser.poll,
    dy_login_sms: (a) => r.browser.sms(String(a.phone || '')),
    dy_login_sms_submit: (a) => r.browser.submit(String(a.code || '')),
    dy_reply_round: r.replies.round,
    dy_chat_send: r.dm.send,
    dy_chat_sticker: r.dm.sticker,
    dy_reconcile_pending: (a) => r.executor.reconcile(Number(a.limit) || 10),
    dy_dm_inbox: r.dm.inbox,
    dy_watch: r.content.watch,
    dy_dm_poll: () => r.dm.poll('manual'),
    dy_cleanup: (a) => r.cleanup.run({ thumbDays: optionalDays(a.thumbDays), reportDays: optionalDays(a.reportDays) }),
    dy_dm_round: r.dm.round,
    dy_share: async (a) => {
      const video = a.title ? a : { ...resultObject(await r.content.video(a)), aweme_id: a.aweme_id }
      return r.social.share(video, String(a.to || r.config().shareToNick))
    },
    dy_thumb: r.content.thumb,
    dy_my_posts: r.content.posts,
    dy_my_videos: r.publication.videos,
    dy_reply: r.replies.single,
    dy_remember: (a) => { const line = String(a.line || '').trim(); if (!line) return { ok: false, error: 'line 不能为空' }; r.memory.append(line.slice(0, 12000)); return { ok: true } },
    dy_feed: r.content.feed,
    dy_hot: r.content.hot,
    dy_hot_videos: r.content.hotVideos,
    dy_search: r.content.search,
    dy_video: r.content.video,
    dy_comments: r.content.comments,
    dy_like: (a) => r.call('douyin_like', { aweme_id: a.aweme_id, undo: a.undo === true }),
    dy_comment: (a) => {
      const mention = a.reply_cid ? '' : r.config().mentionName.trim()
      const text = String(a.text || '').trim()
      return r.call('douyin_comment', { aweme_id: a.aweme_id, text: mention && !text.includes('@' + mention) ? `@${mention} ${text}` : text, reply_cid: a.reply_cid || '', mention })
    },
    dy_publish: r.publication.publish,
    dy_comfy_list: (a) => r.comfy.list(Number(a.limit) || undefined),
    dy_run: (a) => a.mode === 'headless' ? r.headless.run('manual') : r.local.run({ manual: true }),
    dy_selfcheck: r.status.selfcheck,
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
      const force = ['dy_like', 'dy_comment', 'dy_publish'].includes(contract.name) && args.force === true
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
