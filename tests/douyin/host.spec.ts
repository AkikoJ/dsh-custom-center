import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { createDouyinRuntime, type DouyinRuntime } from '../../src/douyin/server/runtime.js'
import { createToolDefinitions, registerTools } from '../../src/douyin/server/tools.js'
import { createDouyinRoutes, HTTP_METHODS } from '../../src/douyin/server/routes.js'
import { checkUpstreamUpdate } from '../../src/douyin/server/update.js'
import { douyinPaths } from '../../src/douyin/server/paths.js'
import { currentExecution } from '../../src/douyin/server/execution-context.js'
import { MARKER_HEADER } from '../../src/shared/request.js'
import { API_PREFIX } from '../../src/douyin/contracts.js'
import baseline from './fixtures/upstream-contract.json'

const fixtures: { root: string; runtime: DouyinRuntime }[] = []
afterEach(async () => { for (const f of fixtures.splice(0)) { await f.runtime.dispose(); rmSync(f.root, { recursive: true, force: true }) } })
function fixture(initial: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'douyin-host-'))
  const invoke = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ ok: true, verified: true, status: 'succeeded' }))
  const runtime = createDouyinRuntime({ paths: douyinPaths(root), initial, invoke })
  fixtures.push({ root, runtime }); return { root, runtime, invoke }
}
function request(path: string, method = 'GET', data?: unknown, options: { marker?: boolean; remote?: string; raw?: string } = {}) {
  const req = Object.assign(new EventEmitter(), { method, url: API_PREFIX + path, headers: options.marker === false ? {} : { [MARKER_HEADER]: '1' }, socket: { remoteAddress: options.remote ?? '127.0.0.1' }, async *[Symbol.asyncIterator]() { if (options.raw !== undefined) yield Buffer.from(options.raw); else if (data !== undefined) yield Buffer.from(JSON.stringify(data)) } })
  return req as unknown as IncomingMessage
}
function response() {
  let status = 0, buffer = Buffer.alloc(0)
  const headers: Record<string, unknown> = {}
  const res = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, setHeader(key: string, value: unknown) { headers[key] = value }, writeHead(code: number, input: object) { status = code; Object.assign(headers, input) }, end(value: string | Buffer) { buffer = Buffer.from(value); res.writableEnded = true } })
  return { res: res as unknown as ServerResponse, read: () => ({ status, headers, buffer, json: () => JSON.parse(buffer.toString()) }) }
}
async function http(runtime: DouyinRuntime, path: string, method = 'GET', data?: unknown, options: Parameters<typeof request>[3] = {}, reject: 401 | 403 | undefined = undefined) {
  const route = createDouyinRoutes({ runtime, reject: () => reject }).find((r) => r.path === API_PREFIX + path.split('?')[0])!
  const out = response(); await route.handler(request(path, method, data, options), out.res); return out.read()
}
const execution = (signal = new AbortController().signal) => ({ signal }) as ToolRunContext

describe('Douyin host contracts and lifecycle', () => {
  it('exposes persona independently and removes memory routes, settings and tools', async () => {
    const { runtime, invoke } = fixture({ memory: true })
    const paths = createDouyinRoutes({ runtime, reject: () => undefined }).map((route) => route.path)
    expect(paths).not.toContain(API_PREFIX + '/memory')
    expect(createToolDefinitions(runtime).map((tool) => tool.name)).not.toContain('cc_dy_remember')
    expect(runtime.config()).not.toHaveProperty('memory')
    expect((await http(runtime, '/persona')).json()).toMatchObject({ ok: true, persona: expect.stringContaining('我是谁') })
    expect((await http(runtime, '/persona', 'POST', { text: '温和、简短，称呼我小林' })).json()).toMatchObject({ ok: true })
    expect((await http(runtime, '/persona')).json()).toMatchObject({ persona: '温和、简短，称呼我小林' })
    expect(invoke).not.toHaveBeenCalled()
  })
  it.each([true, false])('resolves saved localRound=%s equally through HTTP and tool overrides', async (saved) => {
    const { runtime } = fixture({ localRound: saved })
    const local = vi.spyOn(runtime.local, 'run').mockResolvedValue({ ok: true, picked: 0 } as never)
    const headless = vi.spyOn(runtime.headless, 'run').mockResolvedValue({ ok: true, started: true })
    const run = createToolDefinitions(runtime).find((tool) => tool.name === 'cc_dy_run')!
    for (const mode of [undefined, 'local', 'headless']) {
      const isLocal = mode ? mode === 'local' : saved
      for (const invoke of [() => run.execute(mode ? { mode } : {}, execution()), () => http(runtime, '/run', 'POST', mode ? { mode } : {})]) {
        local.mockClear(); headless.mockClear(); await invoke()
        expect(local).toHaveBeenCalledTimes(isLocal ? 1 : 0); expect(headless).toHaveBeenCalledTimes(isLocal ? 0 : 1)
      }
    }
    local.mockClear(); headless.mockClear()
    expect(await run.execute({ mode: 'bad' }, execution())).toMatchObject({ ok: false, error: expect.stringContaining('local/headless') })
    expect((await http(runtime, '/run', 'POST', { mode: 'bad' })).json()).toMatchObject({ ok: false })
    expect(local).not.toHaveBeenCalled(); expect(headless).not.toHaveBeenCalled()
  })
  it('propagates disposal through nested execution contexts before draining platform calls', async () => {
    const { runtime, invoke } = fixture()
    let signal: AbortSignal | undefined
    invoke.mockImplementationOnce(() => new Promise((resolve) => { signal = currentExecution().signal; signal!.addEventListener('abort', () => resolve({ ok: false, verified: false, status: 'cancelled' })) }))
    const feed = createToolDefinitions(runtime).find((tool) => tool.name === 'cc_dy_feed')!
    const task = feed.execute({}, execution())
    await vi.waitFor(() => expect(signal).toBeDefined())
    await runtime.dispose(); await task
    expect(signal!.aborted).toBe(true)
  })
  it('matches all 34 tool names and parameter keys without starting Python', async () => {
    const { runtime, invoke } = fixture(), definitions = createToolDefinitions(runtime)
    expect(definitions.map((d) => d.name)).toEqual(baseline.tools.filter((tool) => tool.name !== 'dy_remember').map((d) => `cc_${d.name}`))
    for (const tool of definitions) {
      const original = baseline.tools.find((d) => `cc_${d.name}` === tool.name)!
      expect(Object.keys(tool.parameters.properties ?? {}).sort()).toEqual(Object.keys(original.parameters.properties).sort())
      expect(tool.output).toBeDefined()
    }
    const status = await definitions.find((d) => d.name === 'cc_dy_status')!.execute({}, execution())
    expect(status).toMatchObject({ ok: true }); expect(invoke).not.toHaveBeenCalled(); expect(runtime.python.running()).toBe(false)
  })
  it('rolls back earlier registrations on collision and disposes once in reverse order', () => {
    const { runtime } = fixture(), removed: string[] = [], register = vi.fn((tool) => { if (tool.name === 'cc_dy_whoami') throw new Error('duplicate'); return () => removed.push(tool.name) })
    expect(() => registerTools({ register }, runtime)).toThrow('duplicate')
    expect(removed).toEqual(['cc_dy_config', 'cc_dy_chrome_open', 'cc_dy_status'])
    removed.length = 0
    const stop = registerTools({ register: (tool) => () => removed.push(tool.name) }, runtime)
    stop(); stop(); expect(removed).toHaveLength(34); expect(removed[0]).toBe('cc_dy_selfcheck')
  })
  it('derives tool authorization from execution context, strips payload force and adds configured mention', async () => {
    const { runtime, invoke } = fixture({ mentionName: 'owner' }), tools = createToolDefinitions(runtime)
    const like = tools.find((d) => d.name === 'cc_dy_like')!
    expect(await like.execute({ aweme_id: '123456789', force: false }, execution())).toMatchObject({ ok: false })
    expect(invoke).not.toHaveBeenCalled()
    await tools.find((d) => d.name === 'cc_dy_comment')!.execute({ aweme_id: '123456789', text: '看看这个', force: true }, execution())
    expect(invoke).toHaveBeenCalledWith('douyin_comment', expect.objectContaining({ text: '@owner 看看这个', mention: 'owner' }), undefined)
    expect(invoke.mock.calls[0][1]).not.toHaveProperty('force')
  })
  it('keeps an in-flight operation owned until it settles and rejects new work while closing', async () => {
    const { runtime, invoke } = fixture()
    let done!: (value: { ok: boolean; verified: boolean; status: string }) => void
    invoke.mockImplementationOnce(() => new Promise((resolve) => { done = resolve }))
    const tool = createToolDefinitions(runtime).find((d) => d.name === 'cc_dy_video')!
    const pending = tool.execute({ aweme_id: '123456789' }, execution())
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce())
    let disposed = false; const closing = runtime.dispose().then(() => { disposed = true })
    await Promise.resolve(); expect(disposed).toBe(false)
    await expect(runtime.track(async () => true)).rejects.toThrow('停止接收')
    done({ ok: true, verified: true, status: 'succeeded' }); await pending; await closing; expect(disposed).toBe(true)
  })
  it('observes cancellation before invoking platform work and keeps empty sticker keyword', async () => {
    const { runtime, invoke } = fixture({ msgAllowTo: 'friend' }), controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(createToolDefinitions(runtime).find((d) => d.name === 'cc_dy_video')!.execute({}, execution(controller.signal))).rejects.toThrow('cancelled')
    expect(invoke).not.toHaveBeenCalled()
    await runtime.dm.sticker({ nickname: 'friend', keyword: '' })
    expect(invoke).toHaveBeenCalledWith('douyin_chat_sticker', expect.objectContaining({ keyword: '' }), expect.anything())
  })
})

describe('Douyin HTTP boundary', () => {
  it('keeps all 31 exact paths with loopback, authentication and marker fences', async () => {
    const { runtime, invoke } = fixture()
    expect(Object.keys(HTTP_METHODS).map((p) => API_PREFIX + p).sort()).toEqual(baseline.routes.filter((path) => !path.endsWith('/memory')).map((path) => path.replace('/api/douyin-duty', API_PREFIX)).sort())
    for (const [options, reject] of [[{ marker: false }, undefined], [{ remote: '10.0.0.2' }, undefined], [{}, 401]] as const) {
      const out = await http(runtime, '/config', 'GET', undefined, options, reject)
      expect(out.status).toBe(reject || 403)
    }
    expect((await http(runtime, '/config', 'DELETE')).status).toBe(405)
    expect(invoke).not.toHaveBeenCalled()
  })
  it('bounds JSON bodies and exposes only host-owned resources', async () => {
    const { runtime, root } = fixture()
    expect((await http(runtime, '/persona', 'POST', undefined, { raw: '{' })).status).toBe(400)
    expect((await http(runtime, '/persona', 'POST', undefined, { raw: 'a'.repeat(131073) })).status).toBe(413)
    expect((await http(runtime, '/cover?u=https://example.com')).status).toBe(400)
    expect((await http(runtime, '/publish', 'POST', { video_path: '/outside.mp4' })).status).toBe(400)
    mkdirSync(runtime.paths.file('thumbs'), { recursive: true })
    const secret = join(root, 'secret.jpg'); writeFileSync(secret, Buffer.from([255, 216, 255, 1]))
    symlinkSync(secret, join(runtime.paths.file('thumbs'), '123456.jpg'))
    expect((await http(runtime, '/thumb', 'GET', undefined, { })).status).toBe(400)
    const route = createDouyinRoutes({ runtime, reject: () => undefined }).find((r) => r.path.endsWith('/thumb'))!
    const out = response(); await route.handler(request('/thumb?id=123456'), out.res)
    expect(out.read().status).toBe(500); expect(out.read().buffer.includes(Buffer.from([255, 216, 255]))).toBe(false)
  })
  it('uses fixed configured recipients for HTTP tests and never lets HTTP force bypass policy', async () => {
    const { runtime, invoke } = fixture({ msgAllowTo: 'friend,other' })
    await http(runtime, '/dm/test', 'POST', { nickname: 'stranger', text: 'hello' })
    expect(invoke).toHaveBeenCalledWith('douyin_chat_send', { nickname: 'friend', text: 'hello' }, expect.anything())
    const out = await http(runtime, '/publish', 'POST', { force: true, latest: true })
    expect(out.json()).toMatchObject({ ok: false, blocked: true }); expect(invoke).toHaveBeenCalledTimes(1)
    expect(currentExecution().origin).toBe('tool')
  })
  it('rejects a stale output selection when the file changes', async () => {
    const { runtime, root, invoke } = fixture({ comfyOutputDir: '' })
    const out = join(root, 'comfy'); mkdirSync(out)
    const video = join(out, 'clip.mp4'); writeFileSync(video, 'first')
    await runtime.configuration.persist({ comfyOutputDir: out })
    const listed = (await http(runtime, '/comfy/list')).json()
    expect(listed.items[0].token).toMatch(/^[a-f0-9]{64}$/)
    writeFileSync(video, 'replacement with different content')
    expect((await http(runtime, '/publish', 'POST', { index: 0, token: listed.items[0].token })).status).toBe(409)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('checks the pinned upstream version independently of package version without upgrading', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ version: '0.3.0' }), { status: 200 })) as unknown as typeof fetch
    expect(await checkUpstreamUpdate(request)).toMatchObject({ ok: true, local: '0.2.9', packageVersion: '0.1.0', latest: '0.3.0', hasUpdate: true, automaticUpgrade: false, pinnedCommit: baseline.source.commit })
    expect(await checkUpstreamUpdate(vi.fn(async () => new Response('x'.repeat(131073))) as unknown as typeof fetch)).toMatchObject({ ok: false })
  })
})
