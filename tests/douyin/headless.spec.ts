import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DEFAULTS } from '../../src/douyin/config.js'
import { douyinPaths } from '../../src/douyin/server/paths.js'
import { createLedger } from '../../src/douyin/server/ledger.js'
import { createRuntimeState } from '../../src/douyin/server/state.js'
import { createHeadless, type Headless } from '../../src/douyin/server/headless.js'
import { headlessTools, overlayText } from '../../src/douyin/server/overlay.js'
import { findDesktopCli, resolveDsh } from '../../src/douyin/server/cli.js'
import { createPersona } from '../../src/douyin/server/persona.js'
import { createReports } from '../../src/douyin/server/reports.js'
import { headlessPrompt } from '../../src/douyin/server/headless-prompt.js'
import { currentExecution } from '../../src/douyin/server/execution-context.js'
import type { TaskOutcome } from '../../src/douyin/server/task-contract.js'
import type { Invoke } from '../../src/douyin/server/action-executor.js'

const roots: string[] = [], runtimes: Headless[] = []
afterEach(async () => { for (const runtime of runtimes.splice(0)) await runtime.dispose(); for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true }) })
function temp() { const root = mkdtempSync(join(tmpdir(), 'douyin-headless-')); roots.push(root); return root }
function put(file: string, text = '') { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); return file }
function fixture(script = 'setInterval(() => {}, 1000)', timeoutMs = 30000) {
  const root = temp(), paths = douyinPaths(root), cfg = { ...DEFAULTS, msgAllowTo: 'Friend', autoLike: true }
  const state = createRuntimeState(paths), ledger = createLedger(paths), cli = put(join(root, 'fixture.mjs'), script)
  const call = vi.fn<Invoke>(async () => ({ ok: true, verified: true }))
  const headless = createHeadless({ paths, config: () => cfg, state, ledger, runtime: { python: () => ({ command: process.execPath, args: [], via: 'test' }), script: join(root, 'mcp.py'), env: () => paths.childEnv({ PATH: process.env.PATH, INHERITED_SECRET: 'never serialize' }) }, call, prompt: () => 'fixture prompt', resolveCli: () => ({ command: process.execPath, args: [cli], shell: false, source: 'test' }), timeoutMs, log: () => { throw Error('log failed') } })
  runtimes.push(headless)
  const overlay = () => { const name = readdirSync(paths.runtime).find((name) => /^headless-.*\.yml$/.test(name))!; return join(paths.runtime, name) }
  const proxy = () => {
    const text = readFileSync(overlay(), 'utf8'), value = (key: string) => JSON.parse(text.match(new RegExp('^          ' + key + ': (.*)$', 'm'))![1]) as string
    const url = value('DOUYIN_PROXY_URL'), token = value('DOUYIN_PROXY_TOKEN')
    const invoke = async (name: string, args: Record<string, unknown> = {}) => {
      const response = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ name, args }) })
      return { status: response.status, value: await response.json() }
    }
    return { url, token, invoke }
  }
  return { root, paths, cfg, state, ledger, call, headless, overlay, proxy }
}

describe('CLI resolution without a shell', () => {
  it('accepts existing explicit JavaScript, keeps arguments separate and rejects missing files or launchers', () => {
    const root = temp(), script = put(join(root, 'path with spaces', 'bin.js'))
    expect(resolveDsh(script)).toMatchObject({ command: process.execPath, args: [script], shell: false, source: 'config' })
    expect(resolveDsh(join(root, 'missing.js'))).toMatchObject({ missing: true })
    expect(resolveDsh(put(join(root, 'dsh.cmd')))).toMatchObject({ missing: true })
  })
  it('recognizes the installed desktop shim without executing it', () => {
    const root = temp(), resources = join(root, 'resources')
    put(join(root, 'DeepSeek Harness.exe')); mkdirSync(join(resources, 'app.asar'), { recursive: true })
    const shim = join(resources, 'runtime/cli/bin/dsh.cmd')
    put(shim, 'unrelated')
    expect(findDesktopCli({ resourcesPath: resources, execPath: join(root, 'missing-node'), env: {} })).toBeNull()
    put(shim, 'ELECTRON_RUN_AS_NODE=1 @deepseek-ai\\dsh-desktop-host\\lib\\cli.js --expose-internals')
    expect(findDesktopCli({ resourcesPath: resources, env: {} })).toMatchObject({ command: join(root, 'DeepSeek Harness.exe'), shell: false, env: { ELECTRON_RUN_AS_NODE: '1' }, source: 'desktop-shim' })
  })
})

describe('headless overlay and prompt', () => {
  it('quotes paths and model values, scopes task tools, and excludes inherited secrets', () => {
    const cfg = { ...DEFAULTS, msgAllowTo: 'Friend', headlessModel: 'provider/model/variant', autoPublish: true }
    const tools = headlessTools(cfg, 'Friend')
    expect([...tools]).toContain('douyin_chat_send'); expect([...tools]).not.toContain('douyin_publish')
    const text = overlayText({ config: cfg, python: { command: "C:\\a'b\\python.exe", args: [], via: 'test' }, script: '/owned/mcp.py', env: { DSH_CUSTOM_CENTER_DOUYIN_HOME: '/owned\nroot', DSH_DOUYIN_HOME: '/owned\nroot', SECRET: 'secret', TEMP: '/owned/tmp' }, proxy: { url: 'http://127.0.0.1:1/action', token: 'short-lived' }, tools })
    expect(text).toContain('model: "model/variant"'); expect(text).toContain('DSH_DOUYIN_HOME: "/owned\\nroot"')
    expect(text).toContain('DSH_CUSTOM_CENTER_DOUYIN_HOME: "/owned\\nroot"')
    expect(text).not.toContain('SECRET'); expect(text).not.toContain('secret')
    expect(text).toContain('DOUYIN_PROXY_TOKEN: "short-lived"')
    expect(text).toContain('inject: [headlessStartup, douyinHeadlessGuard]')
    expect(text).toContain('mode: native')
    expect(text).toContain('douyin-headless-guard.js')
  })
  it('assembles the deployed charter with current quotas, persona and report settings', () => {
    const root = temp(), paths = douyinPaths(root), ledger = createLedger(paths), state = createRuntimeState(paths), persona = createPersona(paths)
    put(paths.file('duty.md'), '<家目录> dy_feed cc_dy_feed'); persona.save('手写人设')
    const cfg = { ...DEFAULTS, perDay: 3, pickPerRound: 2, reportLevel: 'off' }
    const text = headlessPrompt({ config: cfg, paths, ledger, persona, reports: createReports(paths, ledger) })
    expect(text).toContain(root + ' douyin_feed douyin_feed'); expect(text).toContain('本轮最多再挑 2 条')
    expect(text).toContain('手写人设'); expect(text).not.toContain('最近记忆'); expect(text).toContain('不要写日报文件')
  })
})

describe('headless lifecycle and controlled proxy', () => {
  it('cancels active proxy operations before waiting for shutdown', async () => {
    const f = fixture(); let signal: AbortSignal | undefined
    f.call.mockImplementationOnce(() => new Promise((resolve) => {
      signal = currentExecution().signal
      signal!.addEventListener('abort', () => resolve({ ok: false, status: 'cancelled' }), { once: true })
    }))
    await f.headless.run('manual')
    const pending = f.proxy().invoke('douyin_like', { aweme_id: '123456' })
    await vi.waitFor(() => expect(signal).toBeDefined())
    await f.headless.stop()
    await pending
    expect(signal!.aborted).toBe(true)
    expect(f.headless.busy()).toBe(false)
  })
  it('keeps single-flight ownership, awaits callbacks and removes proxy credentials on completion', async () => {
    const f = fixture('process.exit(0)')
    let release!: () => void
    const done = vi.fn(async () => new Promise<void>((resolve) => { release = resolve }))
    expect(await f.headless.run('manual', { onFinish: done })).toMatchObject({ ok: true, started: true })
    await vi.waitFor(() => expect(done).toHaveBeenCalledOnce())
    expect(await f.headless.run()).toMatchObject({ ok: false, error: expect.stringContaining('已有') })
    expect(readdirSync(f.paths.runtime)).toEqual([])
    release(); await vi.waitFor(() => expect(f.headless.busy()).toBe(false))
    expect(f.state.roundsToday()).toBe(1)
    expect(f.state.read().headless).toMatchObject({ status: 'completed' })
  })
  it('enforces the designated recipient, strips force and records exactly one confirmed reply', async () => {
    const f = fixture(); let outcome: TaskOutcome | undefined, execution: unknown
    f.call.mockImplementation(async () => { execution = currentExecution(); return { ok: true, verified: true } })
    await f.headless.run('dm', { recipient: 'Friend', countRound: false, context: { origin: 'tool', force: true }, onFinish: (value) => { outcome = value } })
    expect(statSync(f.overlay()).mode & 0o777).toBe(0o600)
    const proxy = f.proxy()
    expect((await proxy.invoke('douyin_chat_send', { nickname: 'Other', text: 'wrong', force: true })).value).toMatchObject({ blocked: true })
    expect((await proxy.invoke('douyin_chat_sticker', { nickname: 'Friend' })).value).toMatchObject({ blocked: true })
    expect((await proxy.invoke('douyin_like', { aweme_id: '123456' })).status).toBe(403)
    expect((await proxy.invoke('douyin_chat_send', { nickname: 'Friend', text: 'hello', force: true })).value).toMatchObject({ verified: true })
    expect(execution).toMatchObject({ origin: 'headless', force: false })
    expect(f.call).toHaveBeenCalledWith('douyin_chat_send', { nickname: 'Friend', text: 'hello' }, { timeoutMs: 300000 })
    expect((await proxy.invoke('douyin_chat_send', { nickname: 'Friend', text: 'repeat' })).value).toMatchObject({ blocked: true })
    await f.headless.stop()
    expect(outcome?.lastReply).toEqual({ nickname: 'Friend', text: 'hello' }); expect(f.state.roundsToday()).toBe(0)
    await expect(proxy.invoke('douyin_video')).rejects.toThrow()
  })
  it('does not retry an unknown message receipt', async () => {
    const f = fixture(); let outcome: TaskOutcome | undefined
    f.call.mockResolvedValue({ ok: false, status: 'unknown' })
    await f.headless.run('dm', { recipient: 'Friend', countRound: false, onFinish: (value) => { outcome = value } })
    const proxy = f.proxy()
    await proxy.invoke('douyin_chat_send', { nickname: 'Friend', text: 'hello' })
    expect((await proxy.invoke('douyin_chat_send', { nickname: 'Friend', text: 'repeat' })).value).toMatchObject({ blocked: true })
    await f.headless.stop(); expect(outcome?.dmSendUnknown).toBe(true); expect(outcome?.lastReply).toBeUndefined()
  })
  it('rechecks the live tool whitelist and watch quotas in the host, while DM videos remain readable', async () => {
    const f = fixture(); f.cfg.perDay = 1
    await f.headless.run('manual')
    const proxy = f.proxy(); f.cfg.autoLike = false
    expect((await proxy.invoke('douyin_like', { aweme_id: '123456' })).status).toBe(403)
    expect((await proxy.invoke('douyin_watch', { aweme_id: '123456' })).value).toMatchObject({ ok: true })
    expect((await proxy.invoke('douyin_watch', { aweme_id: '234567' })).value).toMatchObject({ blocked: true })
    expect(f.ledger.watched()).toBe(1); await f.headless.stop()
    await f.headless.run('dm', { recipient: 'Friend', countRound: false })
    expect((await f.proxy().invoke('douyin_watch', { aweme_id: '234567' })).value).toMatchObject({ ok: true })
    expect(f.ledger.picked()).toBe(1)
  })
  it('rejects cross-instance live ownership without overwriting it', async () => {
    const f = fixture(); f.state.bump({ headless: { status: 'running', ownerPid: process.pid, runId: 'other' } })
    expect(await f.headless.run()).toMatchObject({ ok: false, error: expect.stringContaining('另一后台') })
    expect(f.state.read().headless).toMatchObject({ runId: 'other' }); expect(f.headless.busy()).toBe(false)
  })
  it('cancels a real local child on timeout and disposal and retains the cancellation outcome', async () => {
    const f = fixture(undefined, 30); let outcome: TaskOutcome | undefined
    await f.headless.run('manual', { onFinish: (value) => { outcome = value } })
    await vi.waitFor(() => expect(f.headless.busy()).toBe(false))
    expect(outcome).toMatchObject({ code: 1, error: 'headless 超时' }); expect(readdirSync(f.paths.runtime)).toEqual([])
    await f.headless.dispose(); expect(await f.headless.run()).toMatchObject({ ok: false, started: false })
  })
  it('holds a thrown send as unknown rather than sending it twice', async () => {
    const f = fixture(); f.call.mockRejectedValue(Error('connection dropped after send'))
    await f.headless.run('dm', { recipient: 'Friend', countRound: false })
    const proxy = f.proxy()
    expect((await proxy.invoke('douyin_chat_send', { nickname: 'Friend', text: 'hello' })).status).toBe(500)
    expect((await proxy.invoke('douyin_chat_send', { nickname: 'Friend', text: 'repeat' })).value).toMatchObject({ blocked: true })
    expect(f.call).toHaveBeenCalledOnce()
  })
  it('cancels during startup without leaving a live ownership claim', async () => {
    const f = fixture(), start = f.headless.run('manual')
    await f.headless.dispose()
    expect(await start).toMatchObject({ ok: false, started: false })
    expect(f.headless.busy()).toBe(false)
    expect(f.state.read()).not.toHaveProperty('headless.status', 'starting')
    expect(f.state.read()).not.toHaveProperty('headless.status', 'running')
  })
  it('refuses to store proxy credentials through a directory symlink outside the data root', async () => {
    const f = fixture(), outside = temp()
    symlinkSync(outside, f.paths.runtime, 'dir')
    expect(await f.headless.run()).toMatchObject({ ok: false, error: expect.stringContaining('越过数据根') })
    expect(readdirSync(outside)).toEqual([]); expect(f.headless.busy()).toBe(false)
  })
  it('completes process cleanup even when a completion callback throws', async () => {
    const f = fixture('process.exit(2)'), done = vi.fn(() => { throw Error('callback failed') })
    await f.headless.run('manual', { onFinish: done })
    await vi.waitFor(() => expect(f.headless.busy()).toBe(false))
    expect(done).toHaveBeenCalledOnce(); expect(f.state.read().headless).toMatchObject({ status: 'failed', code: 2 })
    expect(readdirSync(f.paths.runtime)).toEqual([])
  })
  it('reports disabled overlay and missing CLI as a single awaited completion', async () => {
    const f = fixture(); f.cfg.overlayMcp = false; const done = vi.fn()
    expect(await f.headless.run('manual', { onFinish: done })).toMatchObject({ ok: false, started: false })
    expect(done).toHaveBeenCalledOnce(); expect(f.headless.busy()).toBe(false)
  })
})
