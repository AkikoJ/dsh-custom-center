import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply } from '../../src/douyin/index.js'
import type { WebRoute } from '../../src/shared/host-env.js'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

// The entry is exercised in a real Cordis fiber, with no platform service or process.
describe('standalone Douyin entry ownership', () => {
  it('mounts all registrations and releases them with its fiber without contacting an account', async () => {
    const root = mkdtempSync(join(tmpdir(), 'douyin-entry-')), ctx = new Context()
    const routes = new Set<string>(), tools = new Set<string>(), policy = vi.fn()
    vi.stubEnv('DSH_DOUYIN_HOME', root)
    try {
      ctx.provide('tools', { register: (tool: ToolDefinition) => { tools.add(tool.name); return () => { tools.delete(tool.name) } } })
      ctx.provide('webServer', { register: (route: WebRoute) => { routes.add(route.path); return () => { routes.delete(route.path) } } })
      ctx.provide('connection', { requestRejection: () => undefined })
      ctx.provide('settings', { describe: () => [], update: async () => {}, configure: (value: unknown) => { policy(value); return () => policy('disposed') } })
      apply(ctx, { perDay: 0, noon: false, night: false, peakValley: false, dmAutoReply: false, autoReply: false, msgAllowTo: '' })
      expect(routes.size).toBe(32); expect(tools.size).toBe(35)
      expect(policy).toHaveBeenCalledWith({ auto: false })
      await ctx.fiber.dispose()
      expect(routes.size).toBe(0); expect(tools.size).toBe(0)
      expect(policy).toHaveBeenCalledWith('disposed')
    } finally { await ctx.fiber.dispose(); vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }) }
  })
})
