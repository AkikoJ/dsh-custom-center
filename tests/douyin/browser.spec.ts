import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULTS } from '../../src/douyin/config.js'
import { createBrowser } from '../../src/douyin/server/browser.js'
import { douyinPaths } from '../../src/douyin/server/paths.js'
import { createRuntimeState } from '../../src/douyin/server/state.js'

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn }))
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('Custom Center browser coexistence', () => {
  it('opens a private profile on 9223 without touching the legacy browser on 9222', async () => {
    const root = mkdtempSync(join(tmpdir(), 'douyin-browser-coexist-')), paths = douyinPaths(root)
    vi.useFakeTimers()
    try {
      const executable = join(root, 'chrome'); writeFileSync(executable, '')
      const cfg = { ...DEFAULTS, chromePath: executable }
      const persist = vi.fn(async (patch: object) => { Object.assign(cfg, patch) })
      const fetcher = vi.fn(async (url: string) => {
        expect(url).toBe('http://127.0.0.1:9223/json/version')
        if (!spawn.mock.calls.length) throw new Error('not started')
        return Response.json({ Browser: 'private chrome' })
      })
      vi.stubGlobal('fetch', fetcher)
      const unref = vi.fn()
      spawn.mockImplementation(() => {
        const child = Object.assign(new EventEmitter(), { unref })
        queueMicrotask(() => child.emit('spawn'))
        return child
      })
      const browser = createBrowser({ paths, config: () => cfg, persist, invoke: vi.fn(), restart: vi.fn(), env: () => paths.childEnv() }, createRuntimeState(paths))
      const opening = browser.open()
      await vi.advanceTimersByTimeAsync(700)
      expect(await opening).toMatchObject({ ok: true, started: true, userDataDir: join(paths.browser, 'cdp') })
      expect(persist).toHaveBeenCalledWith({ cdpPort: 9223, cdpUrl: 'http://127.0.0.1:9223' })
      expect(spawn).toHaveBeenCalledWith(executable, expect.arrayContaining(['--remote-debugging-port=9223', `--user-data-dir=${join(paths.browser, 'cdp')}`]), expect.objectContaining({ shell: false, detached: true }))
      expect(existsSync(join(paths.browser, 'cdp'))).toBe(true)
      expect(unref).toHaveBeenCalledOnce()
      expect(await browser.open()).toMatchObject({ ok: true, already: true })
      expect(spawn).toHaveBeenCalledOnce()
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
