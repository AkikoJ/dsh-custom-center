import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-tools'

declare module '@deepseek-ai/cordis' {
  interface Context { douyinHeadlessGuard: true }
}
export const name = 'douyin-headless-guard'
export const inject = ['tools']
export interface Config { tools: string[] }
export const Config: z<Config> = z.object({ tools: z.array(z.string()).required() })

/** This plugin belongs only to a one-shot child process, never the GUI host. */
export function apply(ctx: Context, config: Config): void {
  if (!config.tools.length || config.tools.some((tool) => !/^(?:douyin_[a-z_]+|memory_(?:write|recent|context))$/.test(tool))) throw new Error('后台工具白名单无效')
  const allowed = new Set(config.tools.map((tool) => 'mcp__douyin-duty__' + tool))
  // Scoped registrations bypass restrict(); the process-wide monotonic guard covers them too.
  ctx.tools.guard((execution) => allowed.has(execution.name) ? undefined : '后台会话只允许调用本轮抖音 MCP 工具')
  ctx.on('agent/created', ({ agent }) => {
    // Native presentation avoids the reserved PTC transport. A preset conflict fails creation.
    agent.ctx.tools.presentAs('native')
    const visible = ctx.tools.schemas().map((tool) => tool.name).filter((tool) => allowed.has(tool))
    agent.ctx.tools.restrict({ allow: visible })
    return undefined
  })
  // The headless runner depends on this marker: a missing guard cannot start a turn.
  ctx.provide('douyinHeadlessGuard', true)
}
