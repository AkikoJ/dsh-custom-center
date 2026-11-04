import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply } from '../../src/douyin/index.js'
import baseline from './fixtures/upstream-contract.json'
import { API_PREFIX, TOOL_CONTRACTS } from '../../src/douyin/contracts.js'
import type { WebRoute } from '../../src/shared/host-env.js'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

// The entry is exercised in a real Cordis fiber, with no platform service or process.
describe('standalone Douyin entry ownership', () => {
  it('mounts beside every legacy tool and route and leaves them intact on disposal', async () => {
    const root = mkdtempSync(join(tmpdir(), 'douyin-entry-')), ctx = new Context()
    const routes = new Set<string>(baseline.routes), tools = new Set<string>(baseline.tools.map((tool) => tool.name)), policy = vi.fn()
    vi.stubEnv('DSH_CUSTOM_CENTER_DOUYIN_HOME', root)
    try {
      ctx.provide('tools', { register: (tool: ToolDefinition) => { if (tools.has(tool.name)) throw new Error('duplicate tool: ' + tool.name); tools.add(tool.name); return () => { tools.delete(tool.name) } } })
      ctx.provide('webServer', { register: (route: WebRoute) => { if (routes.has(route.path)) throw new Error('duplicate route: ' + route.path); routes.add(route.path); return () => { routes.delete(route.path) } } })
      ctx.provide('connection', { requestRejection: () => undefined })
      ctx.provide('settings', { describe: () => [], update: async () => {}, configure: (value: unknown) => { policy(value); return () => policy('disposed') } })
      apply(ctx, { perDay: 0, noon: false, night: false, peakValley: false, dmAutoReply: false, autoReply: false, msgAllowTo: '' })
      expect(routes.size).toBe(64); expect(tools.size).toBe(70)
       expect([...tools].filter((name) => name.startsWith('cc_dy_'))).toHaveLength(35)
       expect([...routes].filter((path) => path.startsWith(API_PREFIX))).toHaveLength(32)
       expect(TOOL_CONTRACTS.every((tool) => tools.has(tool.name))).toBe(true)
      expect(policy).toHaveBeenCalledWith({ auto: false })
      await ctx.fiber.dispose()
      expect([...routes]).toEqual(baseline.routes); expect([...tools]).toEqual(baseline.tools.map((tool) => tool.name))
      expect(policy).toHaveBeenCalledWith('disposed')
    } finally { await ctx.fiber.dispose(); vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }) }
  })
})
