import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDouyinRoutes } from '../src/douyin/server/routes.ts'
import { DouyinLoginService } from '../src/douyin/server/service.ts'
import { LoginFailure, type LoginBrowser, type BrowserSession, type CredentialCookie, type PlatformResponse } from '../src/douyin/server/types.ts'
import { MARKER_HEADER } from '../src/shared/request.ts'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function browserFixture() {
  let windows = 0
  let checks = 0
  let identity: unknown = { status_code: 0, user: { uid: '1234567890123456789', nickname: '测试账号' } }
  let responseStatus = 200
  let failure: string | undefined
  let identityWork: ((signal: AbortSignal) => Promise<PlatformResponse>) | undefined
  let openWork: (() => Promise<void>) | undefined
  let exportFailure = false
  const restored: Array<CredentialCookie[] | undefined> = []
  let cookies: CredentialCookie[] = [
    { name: 'sessionid', value: 'host-only-secret', domain: 'www.douyin.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' },
  ]
  let closed: (() => void) | undefined
  const browser: LoginBrowser = {
    async open(_profile, signal, restore): Promise<BrowserSession> {
      if (failure) throw new LoginFailure(failure)
      if (openWork) await openWork()
      signal.throwIfAborted()
      windows++
      restored.push(restore)
      let isClosed = false
      return {
        async identity(signal) { checks++; return identityWork ? identityWork(signal) : { status: responseStatus, body: identity } },
        async credentials() { if (exportFailure) throw new Error('secret export error'); return { cookies: structuredClone(cookies), userAgent: 'Test browser' } },
        async focus() {},
        async close() { if (!isClosed) { isClosed = true; windows--; closed?.() } },
        onClose(fn) { closed = fn },
      }
    },
  }
  return {
    browser, restored, windows: () => windows, checks: () => checks,
    setIdentity: (value: unknown, status = 200) => { identity = value; responseStatus = status },
    setCookies: (value: CredentialCookie[]) => { cookies = value },
    setFailure: (code?: string) => { failure = code },
    setIdentityWork: (work: typeof identityWork) => { identityWork = work },
    setOpenWork: (work: typeof openWork) => { openWork = work },
    failExport: () => { exportFailure = true },
    userCloses: () => { windows--; closed?.() },
  }
}

async function setup(existingRoot?: string) {
  const root = existingRoot ?? await mkdtemp(join(tmpdir(), 'douyin-routes-'))
  if (!existingRoot) cleanup.push(() => rm(root, { recursive: true, force: true }))
  const fixture = browserFixture()
  let network: (url: string, init: RequestInit) => Promise<Response> = async () => Response.json({ status_code: 0, user: { uid: '1234567890123456789' } })
  const sent: Array<{ url: string; cookie: string }> = []
  const service = new DouyinLoginService({
    root, browser: fixture.browser,
    transport: async (url, init) => {
      sent.push({ url, cookie: new Headers(init.headers).get('cookie') ?? '' })
      return network(url, init)
    },
  })
  cleanup.push(() => service.dispose())
  let rejection: 401 | 403 | undefined
  const routes = createDouyinRoutes({ service, reject: () => rejection })
  const server = createServer((req, res) => {
    const route = routes.find((item) => item.path === new URL(req.url!, 'http://localhost').pathname)
    if (route) void route.handler(req, res)
    else { res.writeHead(404); res.end() }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  cleanup.push(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing address')
  const port = address.port
  async function call(action = 'status', method = action === 'status' ? 'GET' : 'POST', body?: unknown, marker = true) {
    const response = await fetch(`http://127.0.0.1:${port}/custom-center/douyin/${action}`, {
      method, headers: { ...(marker ? { [MARKER_HEADER]: '1' } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { code: response.status, headers: response.headers, body: await response.json() }
  }
  async function direct(action = 'status', remoteAddress = '127.0.0.1') {
    const route = routes.find((route) => route.path.endsWith(`/${action}`))!
    let code = 0
    let body: any
    const req = { method: action === 'status' ? 'GET' : 'POST', url: route.path, socket: { remoteAddress }, headers: { [MARKER_HEADER]: '1' } } as unknown as IncomingMessage
    const res = { writeHead(status: number) { code = status }, end(value: string) { body = JSON.parse(value) } } as unknown as ServerResponse
    await route.handler(req, res)
    return { code, body }
  }
  return { root, service, fixture, sent, call, direct, routes, reject: (value: 401 | 403 | undefined) => { rejection = value }, network: (fn: typeof network) => { network = fn } }
}

describe('抖音登录宿主接口', () => {
  it('进入页面不启动窗口；手动检查完成身份、私有快照及独立同 UID HTTP 验证', async () => {
    const app = await setup()
    expect((await app.call()).body.window).toBe('closed')
    expect(app.fixture.windows()).toBe(0)
    expect((await app.call('open')).body.window).toBe('open')
    const result = await app.call('check')
    expect(result.body).toMatchObject({ browserAuth: 'verified', persistence: 'saved', http: { state: 'verified', uid: '1234567890123456789' } })
    expect(app.sent[0]?.cookie).toBe('sessionid=host-only-secret')
    const file = join(app.root, 'credentials.json')
    const snapshot = JSON.parse(await readFile(file, 'utf8'))
    expect(snapshot).toMatchObject({ schema: 1, account: { uid: '1234567890123456789' }, cookies: [{ value: 'host-only-secret', httpOnly: true }] })
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect(JSON.stringify(result.body)).not.toContain('host-only-secret')
    expect(result.headers.get('cache-control')).toBe('no-store')
  })

  it('在浏览器产生副作用前拒绝认证、来源、标记、方法和任意输入', async () => {
    const app = await setup()
    expect((await app.call('open', 'POST', undefined, false)).code).toBe(403)
    for (const rejection of [401, 403] as const) {
      app.reject(rejection)
      expect((await app.call('open')).code).toBe(rejection)
    }
    app.reject(undefined)
    expect((await app.direct('open', '192.168.1.2')).code).toBe(403)
    expect((await app.call('open', 'GET')).code).toBe(405)
    expect((await app.call('status', 'POST')).code).toBe(405)
    expect((await app.call('open?url=https://evil.test')).code).toBe(400)
    expect((await app.call('open', 'POST', { path: '/tmp', script: 'secret' })).code).toBe(400)
    expect(app.fixture.windows()).toBe(0)
    expect(app.sent).toEqual([])
  })

  it.each(['browser-missing', 'browser-start-failed', 'navigation-failed', 'profile-busy'])('区分 %s，失败不报告开窗成功', async (failure) => {
    const app = await setup()
    app.fixture.setFailure(failure)
    const result = await app.call('open')
    expect(result.body).toMatchObject({ window: 'closed', notice: failure, browserAuth: 'unverified' })
    expect(app.sent).toEqual([])
    app.fixture.setFailure()
    expect((await app.call('open')).body.window).toBe('open')
  })

  it('等待实际开窗完成，重复打开复用一个窗口', async () => {
    const app = await setup()
    const started = deferred<void>()
    const release = deferred<void>()
    app.fixture.setOpenWork(async () => { started.resolve(); await release.promise })
    const first = app.direct('open')
    await started.promise
    expect((await app.direct()).body.window).toBe('opening')
    const second = app.direct('open')
    release.resolve()
    await Promise.all([first, second])
    expect(app.fixture.windows()).toBe(1)
  })

  it.each([
    { user: { uid: '1234567890123456789', nickname: '头像存在' } },
    { status_code: 1, user: { uid: '1234567890123456789' } },
    { status_code: 0, user: { nickname: '没有 UID' } },
    { status_code: 0, user: { uid: 1234567890123456789 } },
    { status_code: 0, user: { uid: '0' } },
  ])('Cookie 与不充分身份响应不会产生登录成功：%j', async (identity) => {
    const app = await setup()
    app.fixture.setIdentity(identity)
    await app.call('open')
    expect((await app.call('check')).body).toMatchObject({ browserAuth: 'waiting', persistence: 'none', notice: 'identity-unconfirmed' })
    expect(app.sent).toEqual([])
    await expect(readFile(join(app.root, 'credentials.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each([
    [429, 'rate-limited'], [403, 'challenge'], [502, 'network'],
  ] as const)('HTTP %s 保留已确认浏览器身份与完整凭据', async (status, reason) => {
    const app = await setup()
    app.network(async () => new Response('untrusted-secret-html', { status }))
    await app.call('open')
    const result = await app.call('check')
    expect(result.body).toMatchObject({ browserAuth: 'verified', persistence: 'saved', http: { state: 'pending', reason } })
    expect(JSON.stringify(result.body)).not.toContain('untrusted-secret')
    expect(JSON.parse(await readFile(join(app.root, 'credentials.json'), 'utf8')).usable).toBe(true)
  })

  it('HTTP 原始网络异常不泄露秘密，稍后可重新验证', async () => {
    const app = await setup()
    let now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    app.network(async () => { throw new Error('sessionid=secret-stack') })
    await app.call('open')
    const failed = await app.call('check')
    expect(failed.body).toMatchObject({ browserAuth: 'verified', persistence: 'saved', http: { state: 'pending', reason: 'network' } })
    expect(JSON.stringify(failed.body)).not.toContain('secret-stack')
    now += 21_000
    app.network(async () => Response.json({ status_code: 0, user: { uid: '1234567890123456789' } }))
    expect((await app.call('check')).body.http.state).toBe('verified')
  })

  it.each([
    [401, {}, 'expired'],
    [200, { status_code: 8 }, 'expired'],
    [200, { status_code: 0, user: { uid: '999999' } }, 'account-mismatch'],
  ] as const)('HTTP 明确拒绝或异 UID 停用凭据但保留原账号', async (status, body, reason) => {
    const app = await setup()
    app.network(async () => Response.json(body, { status }))
    await app.call('open')
    const result = await app.call('check')
    expect(result.body).toMatchObject({ browserAuth: reason, account: { uid: '1234567890123456789' }, http: { state: 'rejected', reason } })
    expect(JSON.parse(await readFile(join(app.root, 'credentials.json'), 'utf8'))).toMatchObject({ usable: false, account: { uid: '1234567890123456789' } })
  })

  it('浏览器切到其他 UID 不覆盖原账号；明确未登录也使旧凭据失效', async () => {
    const app = await setup()
    let now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    await app.call('open')
    await app.call('check')
    now += 11_000
    app.fixture.setIdentity({ status_code: 0, user: { uid: '999999' } })
    expect((await app.call('check')).body).toMatchObject({ browserAuth: 'account-mismatch', account: { uid: '1234567890123456789' } })
    now += 11_000
    app.fixture.setIdentity({ status_code: 8 })
    expect((await app.call('check')).body).toMatchObject({ browserAuth: 'expired', http: { state: 'rejected' } })
    expect(app.sent).toHaveLength(1)
  })

  it('按域、路径、到期、host-only、重名及分区作用范围发送 Cookie', async () => {
    const app = await setup()
    const cookie = (name: string, value: string, more: Partial<CredentialCookie> = {}): CredentialCookie => ({
      name, value, domain: 'www.douyin.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax', ...more,
    })
    app.fixture.setCookies([
      cookie('host', 'www-only'), cookie('domain', 'shared', { domain: '.douyin.com' }),
      cookie('sid', 'root'), cookie('sid', 'narrow', { path: '/aweme/v1' }),
      cookie('private', 'wrong-path', { path: '/messages' }),
      cookie('expired', 'old', { expires: 1 }), cookie('partition', 'partition-only', { partitionKey: 'https://www.douyin.com' }),
      cookie('subdomain', 'other-host', { domain: 'live.douyin.com' }),
    ])
    app.network(async (url) => new URL(url).hostname === 'www.douyin.com'
      ? new Response(null, { status: 302, headers: { location: 'https://douyin.com/aweme/v1/web/user/profile/self/' } })
      : Response.json({ status_code: 0, user: { uid: '1234567890123456789' } }))
    await app.call('open')
    await app.call('check')
    expect(app.sent[0]?.cookie).toContain('sid=narrow;')
    expect(app.sent[0]?.cookie).toContain('sid=root')
    expect(app.sent[0]?.cookie).toContain('host=www-only')
    for (const excluded of ['wrong-path', 'old', 'partition-only', 'other-host']) expect(app.sent[0]?.cookie).not.toContain(excluded)
    expect(app.sent[1]?.cookie).toBe('domain=shared')
    const saved = JSON.parse(await readFile(join(app.root, 'credentials.json'), 'utf8'))
    expect(saved.browserCookies.find((c: CredentialCookie) => c.name === 'partition').partitionKey).toBe('https://www.douyin.com')
  })

  it.each(['https://evil.test/', 'http://www.douyin.com/', 'https://douyin.com.evil.test/', 'https://www.douyin.com:444/'])('阻止凭据重定向到 %s', async (location) => {
    const app = await setup()
    app.network(async () => new Response(null, { status: 302, headers: { location } }))
    await app.call('open')
    expect((await app.call('check')).body.http).toMatchObject({ state: 'pending', reason: 'redirect-rejected' })
    expect(app.sent).toHaveLength(1)
  })

  it('Set-Cookie 产生新代次，后续检查使用更新后的 HTTP Cookie 而恢复仍使用浏览器源', async () => {
    const app = await setup()
    let now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    app.network(async () => Response.json({ status_code: 0, user: { uid: '1234567890123456789' } }, {
      headers: { 'set-cookie': 'sessionid=http-updated; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600' },
    }))
    await app.call('open')
    expect((await app.call('check')).body.http).toMatchObject({ state: 'pending', reason: 'credentials-updated' })
    const snapshot = JSON.parse(await readFile(join(app.root, 'credentials.json'), 'utf8'))
    expect(snapshot.cookies[0]).toMatchObject({ value: 'http-updated', httpOnly: true, secure: true })
    expect(snapshot.cookies[0].expires).toBeGreaterThan(now / 1000)
    app.network(async () => Response.json({ status_code: 0, user: { uid: '1234567890123456789' } }))
    now += 21_000
    const result = await app.call('check')
    expect(app.sent[1]?.cookie).toBe('sessionid=http-updated')
    expect(result.body.http).toMatchObject({ state: 'verified', generation: snapshot.generation })
    await app.call('close')
    await app.call('open')
    expect(app.fixture.restored[1]?.[0]?.value).toBe('host-only-secret')
  })

  it('不把 HTTP 分区 Cookie 更新当成普通 Cookie 使用', async () => {
    const app = await setup()
    app.network(async () => Response.json({ status_code: 0, user: { uid: '1234567890123456789' } }, {
      headers: { 'set-cookie': 'partition=private; Secure; SameSite=None; Partitioned' },
    }))
    await app.call('open')
    expect((await app.call('check')).body.http).toMatchObject({ state: 'pending', reason: 'cookie-unsupported' })
    expect(JSON.parse(await readFile(join(app.root, 'credentials.json'), 'utf8')).cookies).toHaveLength(1)
  })

  it('替换已有 Cookie 的 Max-Age 从响应时间计算，后续读取不会延长有效期', async () => {
    const app = await setup()
    vi.useFakeTimers({ toFake: ['Date'] })
    await app.direct('open')
    await app.direct('check')
    vi.setSystemTime(new Date(Date.now() + 120_000))
    const receivedAt = Date.now()
    app.network(async () => Response.json({ status_code: 0, user: { uid: '1234567890123456789' } }, {
      headers: { 'set-cookie': 'sessionid=renewed; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600' },
    }))
    await app.direct('check')
    const saved = JSON.parse(await readFile(join(app.root, 'credentials.json'), 'utf8'))
    expect(saved.cookies[0].expires).toBe((receivedAt + 3_600_000) / 1000)
    vi.setSystemTime(new Date(receivedAt + 60_000))
    app.network(async () => Response.json({ status_code: 0, user: { uid: '1234567890123456789' } }))
    expect((await app.direct('check')).body.http.state).toBe('verified')
    const after = JSON.parse(await readFile(join(app.root, 'credentials.json'), 'utf8'))
    expect(after.cookies[0].expires).toBe(saved.cookies[0].expires)
  })

  it('新 Cookie 保存失败保留上一份完整快照，导出失败不会沿用旧 HTTP 成功', async () => {
    const app = await setup()
    let now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    await app.call('open')
    await app.call('check')
    const file = join(app.root, 'credentials.json')
    const previous = await readFile(file, 'utf8')
    const backup = join(app.root, 'previous.json')
    await writeFile(backup, previous)
    await rm(file)
    await symlink(backup, file)
    now += 11_000
    expect((await app.call('check')).body).toMatchObject({ persistence: 'failed', http: { state: 'unverified' }, notice: 'save-failed' })
    expect(await readFile(backup, 'utf8')).toBe(previous)
    await rm(file)
    await writeFile(file, previous, { mode: 0o600 })
    now += 11_000
    app.fixture.failExport()
    expect((await app.call('check')).body).toMatchObject({ persistence: 'failed', http: { state: 'unverified' }, notice: 'export-failed' })
    expect(await readFile(file, 'utf8')).toBe(previous)
  })

  it('关闭与重启保留资料；历史成功不直接恢复为当前有效', async () => {
    const app = await setup()
    await app.call('open')
    await app.call('check')
    await Promise.all([app.direct('close'), app.direct('close')])
    expect(app.fixture.windows()).toBe(0)
    expect((await app.call()).body.window).toBe('closed')
    await app.service.dispose()
    const restarted = await setup(app.root)
    expect((await restarted.call()).body).toMatchObject({ persistence: 'historical', browserAuth: 'unverified', http: { state: 'unverified' }, account: { uid: '1234567890123456789' } })
    await restarted.call('open')
    expect(restarted.fixture.restored[0]?.[0]?.value).toBe('host-only-secret')
    expect((await restarted.call('check')).body.http.state).toBe('verified')
  })

  it.each(['{broken', '{"schema":99}', 'symlink'])('损坏、未知版本或符号链接快照 %s 不被消费', async (content) => {
    const app = await setup()
    await app.service.status()
    await app.service.dispose()
    const file = join(app.root, 'credentials.json')
    if (content === 'symlink') {
      await writeFile(join(app.root, 'outside.json'), '{"schema":99}')
      await symlink(join(app.root, 'outside.json'), file)
    } else await writeFile(file, content)
    const restarted = await setup(app.root)
    expect((await restarted.call()).body).toMatchObject({ persistence: 'invalid', http: { state: 'unverified' }, notice: 'snapshot-invalid' })
    expect(restarted.sent).toEqual([])
    restarted.fixture.setFailure('browser-missing')
    expect((await restarted.call('open')).body.notice).toBe('browser-missing')
    restarted.fixture.setFailure()
    await restarted.call('open')
    expect((await restarted.call('open')).body.window).toBe('open')
    expect(restarted.fixture.restored[0]).toBeUndefined()
  })

  it('不同 profile 的账号资料互相隔离', async () => {
    const app = await setup()
    const other = await setup()
    await app.call('open')
    await app.call('check')
    const otherStatus = (await other.call()).body
    expect(otherStatus.persistence).toBe('none')
    expect(otherStatus.account).toBeUndefined()
    expect(other.fixture.windows()).toBe(0)
    await expect(readFile(join(other.root, 'credentials.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('并发检查合并，关闭中止旧请求，重开不产生过期写回', async () => {
    const app = await setup()
    const started = deferred<void>()
    app.fixture.setIdentityWork(async (signal) => {
      started.resolve()
      await new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted-secret')), { once: true }))
      return { status: 0, body: null }
    })
    await app.direct('open')
    const first = app.direct('check')
    await started.promise
    const second = app.direct('check')
    const closing = app.direct('close')
    await Promise.all([first, second, closing])
    expect(app.fixture.checks()).toBe(1)
    expect(app.fixture.windows()).toBe(0)
    expect((await app.direct()).body).toMatchObject({ window: 'closed', persistence: 'none', phase: 'idle' })
    app.fixture.setIdentityWork(undefined)
    await app.direct('open')
    expect((await app.direct('check')).body.http.state).toBe('verified')
    expect(app.fixture.windows()).toBe(1)
  })

  it('新实例等待旧实例释放相同 profile，并停止旧观察任务', async () => {
    const app = await setup()
    await app.direct('open')
    const next = await setup(app.root)
    expect(app.fixture.windows()).toBe(0)
    expect((await next.direct()).body.window).toBe('closed')
    await next.direct('open')
    expect(next.fixture.windows()).toBe(1)
    expect((await app.direct('open')).code).toBe(503)
  })

  it('有界自动观察退避，十分钟暂停但保留窗口，手动检查可继续', async () => {
    const app = await setup()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    app.fixture.setIdentity({ status_code: 1 })
    await app.direct('open')
    await vi.advanceTimersByTimeAsync(3_000)
    expect(app.fixture.checks()).toBe(1)
    await vi.advanceTimersByTimeAsync(9_000)
    expect(app.fixture.checks()).toBe(1)
    await vi.advanceTimersByTimeAsync(590_000)
    expect((await app.direct()).body).toMatchObject({ observation: 'paused', window: 'open', browserAuth: 'waiting' })
    expect(app.fixture.checks()).toBeLessThan(15)
    await vi.advanceTimersByTimeAsync(61_000)
    app.fixture.setIdentity({ status_code: 0, user: { uid: '1234567890123456789' } })
    expect((await app.direct('check')).body).toMatchObject({ observation: 'idle', browserAuth: 'verified', http: { state: 'verified' } })
    await app.service.dispose()
    const count = app.fixture.checks()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(app.fixture.checks()).toBe(count)
  })

  it('首次未登录继续等待扫码并能自动发现成功；HTTP 临时失败也会退避', async () => {
    const app = await setup()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    app.fixture.setIdentity({ status_code: 8 })
    await app.direct('open')
    await vi.advanceTimersByTimeAsync(3_000)
    expect((await app.direct()).body).toMatchObject({ browserAuth: 'waiting', notice: 'waiting', observation: 'observing' })
    app.fixture.setIdentity({ status_code: 0, user: { uid: '1234567890123456789' } })
    app.network(async () => new Response(null, { status: 429 }))
    await vi.advanceTimersByTimeAsync(21_000)
    expect(app.fixture.checks()).toBe(2)
    // Join the in-flight observation: fake timers do not await real filesystem IO.
    await app.direct('check')
    expect(app.sent).toHaveLength(1)
    expect((await app.direct()).body.http).toMatchObject({ state: 'pending', reason: 'rate-limited' })
    await vi.advanceTimersByTimeAsync(12_000)
    expect(app.sent).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(9_000)
    await app.direct('check')
    expect(app.sent).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(app.sent).toHaveLength(2)
    app.network(async () => Response.json({ status_code: 0, user: { uid: '1234567890123456789' } }))
    await vi.advanceTimersByTimeAsync(12_000)
    await app.direct('check')
    expect((await app.direct()).body).toMatchObject({ browserAuth: 'verified', http: { state: 'verified' }, observation: 'idle' })
  })
})
