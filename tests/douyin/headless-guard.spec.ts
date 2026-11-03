import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createScope } from '@deepseek-ai/dsh-scope'
import { ToolRuntime, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import { apply } from '../../src/douyin/headless-guard.js'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })
function fixture() {
  const ctx = new Context(); contexts.push(ctx)
  ctx.provide('systemPrompt', { tools: () => () => {}, section: () => () => {}, getSectionOrder: () => 1 })
  new ToolRuntime(ctx)
  const register = (target: Context, name: string) => {
    const execute = vi.fn(async () => ({ ok: true }))
    const tool: ToolDefinition = { name, description: name, parameters: { type: 'object', properties: {} }, output: { schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }, render: () => [{ type: 'text', text: 'ok' }] }, execute }
    target.tools.register(tool); return execute
  }
  return { ctx, register }
}

describe('headless process tool boundary', () => {
  it('filters inherited globals, blocks scoped bypasses and cannot be overridden by pre-execute allow', async () => {
    const { ctx, register } = fixture()
    const mcp = 'mcp__douyin-duty__douyin_video', accepted = register(ctx, mcp)
    const bash = register(ctx, 'bash'); register(ctx, 'mcp__other__douyin_video')
    apply(ctx, { tools: ['douyin_video'] })
    ctx.on('tools/pre-execute', async () => ({ kind: 'allow' }))
    const agent = { id: 'fixture' } as Agent
    const scope = createScope(ctx, agent); Object.assign(agent, { ctx: scope.ctx })
    await agentEvents(ctx, agent).serial('agent/created', { source: 'startup' })
    expect(ctx.tools.schemas(agent).map((tool) => tool.name)).toEqual([mcp])
    const bypass = register(scope.ctx, 'custom_shell')
    const run = (name: string) => ctx.tools.execute({ callId: 'fixture-call' as import('@deepseek-ai/dsh-llm').ToolCallId, name, arguments: {}, agent, signal: new AbortController().signal })
    expect((await run(mcp)).isError).toBeFalsy(); expect(accepted).toHaveBeenCalledOnce()
    expect((await run('custom_shell')).isError).toBe(true); expect(bypass).not.toHaveBeenCalled()
    expect((await run('bash')).isError).toBe(true); expect(bash).not.toHaveBeenCalled()
    expect(ctx.get('douyinHeadlessGuard')).toBe(true)
    await scope.dispose()
  })
  it('rejects empty or malformed tool lists before publishing its readiness marker', () => {
    const { ctx } = fixture()
    for (const tools of [[], ['bash'], ['douyin_video\nother'], ['mcp__other__video']]) expect(() => apply(ctx, { tools })).toThrow()
    expect(ctx.get('douyinHeadlessGuard')).toBeUndefined()
  })
})
