import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULTS } from '../../src/douyin/config.js'
import { douyinPaths } from '../../src/douyin/server/paths.js'
import { createLedger } from '../../src/douyin/server/ledger.js'
import { createRuntimeState } from '../../src/douyin/server/state.js'
import { createReports } from '../../src/douyin/server/reports.js'
import { createPythonRuntime } from '../../src/douyin/server/python-runtime.js'
import { createBrowser } from '../../src/douyin/server/browser.js'
import { createStatus } from '../../src/douyin/server/status.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'douyin-status-')); roots.push(root)
  const paths = douyinPaths(root), config = { ...DEFAULTS }, ledger = createLedger(paths), state = createRuntimeState(paths)
  const runtime = createPythonRuntime(paths, () => config), reports = createReports(paths, ledger)
  const call = vi.fn(async () => ({ ok: true, loggedIn: true, searched: true, media: { ffmpegReady: true, dependenciesReady: true, modelCached: true } }))
  const setup = { dependencies: vi.fn(async () => ({ ok: true, detail: 'test' })) }
  const browser = createBrowser({ paths, config: () => config, persist: async () => {}, invoke: call, restart: async () => {}, env: () => ({}) }, state)
  vi.spyOn(browser, 'probe').mockResolvedValue({ ok: false, url: '' }); vi.spyOn(browser, 'running').mockResolvedValue(false)
  const status = createStatus({ config: () => config, ledger, state, runtime, reports, setup, browser, call, replyState: () => ({ nextAt: null }), dshCli: () => '' })
  return { paths, config, ledger, state, runtime, call, setup, status }
}

describe('status and explicit selfcheck', () => {
  it('reads unified counters and separate package/upstream identity without launching MCP', async () => {
    const f = fixture(), data = f.ledger.read(), day = f.ledger.day()
    data.picks[`${day}:123456`] = { day, aweme_id: '123456', watched: true }; f.ledger.write(data)
    f.state.bump({ loggedIn: true, nickname: '账号昵称', avatarUrl: 'https://p3.douyinpic.com/avatar.jpeg' })
    const result = await f.status.snapshot()
    expect(result).toMatchObject({ ok: true, pickedToday: 1, watchedToday: 1, leftToday: 4, home: f.paths.root, mcpRunning: false, account: { nickname: '账号昵称', hasAvatar: true }, build: { version: '0.1.0', upstream: { version: '0.2.9', commit: 'aaf9f9a862afafd45a15acf32789da97688de695' } } })
    expect(f.call).not.toHaveBeenCalled(); expect(f.setup.dependencies).not.toHaveBeenCalled()
    f.runtime.dispose()
  })
  it('requires login, search and cached media evidence while treating inactive ComfyUI as optional', async () => {
    const f = fixture()
    expect(await f.status.selfcheck()).toMatchObject({ ok: true, issues: [] }); expect(f.state.hasLogin()).toBe(true)
    f.call.mockResolvedValueOnce({ ok: true, loggedIn: true, searched: true, media: { ffmpegReady: true, dependenciesReady: true, modelCached: false } })
    expect(await f.status.selfcheck()).toMatchObject({ ok: false, issues: [expect.objectContaining({ id: 'transcribe-model', download: expect.objectContaining({ url: expect.stringContaining('huggingface.co') }) })] })
    f.config.autoPublish = true
    expect(await f.status.selfcheck()).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ id: 'comfy-output', download: expect.objectContaining({ url: expect.stringContaining('comfy.org') }) })]) })
    f.runtime.dispose()
  })
  it('does not start MCP until dependencies are ready and preserves failure evidence', async () => {
    const f = fixture(); f.setup.dependencies.mockResolvedValue({ ok: false, detail: 'missing' })
    expect(await f.status.selfcheck()).toMatchObject({ ok: false, mcp: { skipped: true }, issues: expect.arrayContaining([expect.objectContaining({ id: 'python', download: expect.objectContaining({ url: 'https://www.python.org/downloads/' }) })]) }); expect(f.call).not.toHaveBeenCalled()
    f.runtime.dispose()
  })
  it('reuses a recent homepage environment check while explicit checks stay fresh', async () => {
    const f = fixture()
    expect(await f.status.environment()).toMatchObject({ ok: true, issues: [] })
    expect(await f.status.environment()).toMatchObject({ ok: true, cached: true })
    expect(f.call).toHaveBeenCalledTimes(1)
    await f.status.selfcheck()
    expect(f.call).toHaveBeenCalledTimes(2)
    f.runtime.dispose()
  })
})
