import type { Log, Serialize } from "../src/skills/server/types.ts"
import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSkillsCommands } from "../src/skills/server/commands.ts"
import { apply } from "../src/skills/index.js";
import type { HostContext } from '../src/skills/host-types.ts'
import { createSkillsHandler, type RouterOptions } from '../src/skills/server/router.ts'
import { createSkill } from "../src/skills/server/skill-create.js";

vi.mock('../src/skills/server/skill-create.ts', async (original) => {
  const real = await original<typeof import('../src/skills/server/skill-create.ts')>()
  return { ...real, createSkill: vi.fn() }
})

function request(method: string, action: string, body = '{}', headers: IncomingMessage['headers'] = {}) {
  return Object.assign(Readable.from([Buffer.from(body)]), {
    method, url: `/api/dsh-custom-center/skills${action}`,
    headers: { host: 'localhost:3000', 'x-dsh-custom-center-skills': '1', 'content-type': 'application/json', ...headers },
  }) as unknown as IncomingMessage
}
function response() {
  const record = { status: 0, headers: {} as Record<string, string | number>, body: '' }
  const stream = Object.assign(new EventEmitter(), {
    writableEnded: false, destroyed: false,
    writeHead(status: number, headers: typeof record.headers) { Object.assign(record, { status, headers }) },
    end(body?: string) { record.body = body ?? ''; stream.writableEnded = true },
  })
  return { record, stream: stream as unknown as ServerResponse }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function flush() { for (let i = 0; i < 16; i++) await Promise.resolve() }

let options: Omit<RouterOptions, "commands"> & { log: Log; enqueueMutation: Serialize; afterWrite: () => void }
beforeEach(() => {
  options = {
    state: vi.fn().mockResolvedValue({ roots: [], label: '技能' }),
    workspaceSkills: vi.fn().mockResolvedValue({ roots: [] }),
    ctx: { connection: { requestRejection: vi.fn() } } as unknown as HostContext,
    log: vi.fn(), rootByKey: {}, getTrustedHosts: vi.fn(() => []),
    enqueueMutation: vi.fn(async (task) => task()), afterWrite: vi.fn(),
    activeSessionCwds: vi.fn(() => ['/active']), registeredWorkspacePaths: vi.fn(() => ['/registered']),
  }
  vi.mocked(createSkill).mockReset().mockResolvedValue({ name: 'alpha', path: '/fixture/alpha', root: 'dsh' })
})
afterEach(() => vi.restoreAllMocks())

async function call(method: string, action: string, body = '{}', headers: IncomingMessage['headers'] = {}) {
  const res = response()
  await createSkillsHandler({ ...options, commands: { ...createSkillsCommands({ log: options.log, afterWrite: options.afterWrite, workspaceSkills: options.workspaceSkills, registeredWorkspaces: () => options.registeredWorkspacePaths(options.ctx) }), enqueueMutation: options.enqueueMutation } })(request(method, action, body, headers), res.stream)
  return res.record
}

describe('Skills HTTP contracts', () => {
  it('checks Host before Connection, and Connection before methods and mutation headers', async () => {
    expect(await call('PUT', '/create', '{}', { host: 'evil.example' })).toMatchObject({ status: 403 })
    expect(options.ctx.connection?.requestRejection).not.toHaveBeenCalled()
    vi.mocked(options.ctx.connection!.requestRejection).mockReturnValue(401)
    const denied = await call('PUT', '/create', '{}', { 'x-dsh-custom-center-skills': undefined })
    expect(denied.status).toBe(401)
    expect(JSON.parse(denied.body)).toMatchObject({ code: 'error.proto.unauthorized' })
    vi.mocked(options.ctx.connection!.requestRejection).mockReturnValue(undefined)
    expect(await call('PUT', '/create')).toMatchObject({ status: 405 })
    expect(await call('POST', '/create', 'invalid', { 'x-dsh-custom-center-skills': undefined, 'content-type': 'text/plain' }))
      .toMatchObject({ status: 403 })
    expect(await call('POST', '/create', 'invalid', { 'content-type': 'text/plain' })).toMatchObject({ status: 415 })
    expect(await call('POST', '/create', 'invalid')).toMatchObject({ status: 400 })
    expect(options.enqueueMutation).not.toHaveBeenCalled()
  })

  it('reads trusted hosts on each request and rejects malformed authorities and cross-site requests', async () => {
    expect(await call('GET', '/state', '', { host: '192.168.1.2:3000' })).toMatchObject({ status: 403 })
    vi.mocked(options.getTrustedHosts).mockReturnValue(['192.168.1.2:3000'])
    expect(await call('GET', '/state', '', { host: '192.168.1.2:3000' })).toMatchObject({ status: 200 })
    for (const headers of [
      { host: 'localhost:03000' }, { host: 'localhost/path' },
      { origin: 'http://localhost:4000' }, { 'sec-fetch-site': 'cross-site' },
    ]) expect(await call('GET', '/state', '', headers)).toMatchObject({ status: 403 })
  })

  it('retains GET and HEAD lengths and passes session scope without queueing reads', async () => {
    const get = await call('GET', '/state', '', { 'x-dsh-skills-session': 'session-one' })
    const head = await call('HEAD', '/state')
    expect(get.status).toBe(200)
    expect(get.headers['content-length']).toBe(Buffer.byteLength(get.body))
    expect(head).toMatchObject({ status: 200, body: '', headers: get.headers })
    expect(options.state).toHaveBeenCalledWith({ projectCwds: ['/active'] })
    expect(options.activeSessionCwds).toHaveBeenCalledWith(options.ctx, 'session-one')
    expect(options.enqueueMutation).not.toHaveBeenCalled()
    expect(await call('HEAD', '/missing')).toMatchObject({ status: 405, body: '' })
  })

  it('queues POST read operations, preserves envelopes, and only notifies successful writes', async () => {
    expect(await call('POST', '/workspace-skills', '{"workspace":"/registered"}')).toMatchObject({ status: 200 })
    expect(options.workspaceSkills).toHaveBeenCalledWith('/registered', ['/registered'])
    expect(options.enqueueMutation).toHaveBeenCalledTimes(1)
    expect(options.afterWrite).not.toHaveBeenCalled()
    expect(JSON.parse((await call('POST', '/create', '{"name":"alpha"}')).body)).toEqual({
      ok: true, data: { name: 'alpha', path: '/fixture/alpha', root: 'dsh' },
    })
    expect(options.afterWrite).toHaveBeenCalledTimes(1)
    vi.mocked(createSkill).mockResolvedValueOnce({ ok: false, code: 'error.create.exists', error: 'exists' })
    expect(await call('POST', '/create')).toMatchObject({ status: 400 })
    expect(options.afterWrite).toHaveBeenCalledTimes(1)
    vi.mocked(createSkill).mockRejectedValueOnce(Object.assign(new Error('fixture error'), {
      statusCode: 409, code: 'fixture.code', params: { name: 'alpha' },
    }))
    const error = await call('POST', '/create')
    expect(error.status).toBe(409)
    expect(JSON.parse(error.body)).toEqual({ ok: false, error: 'fixture error', code: 'fixture.code', params: { name: 'alpha' } })
    expect(options.afterWrite).toHaveBeenCalledTimes(1)
    expect(await call('POST', '/missing')).toMatchObject({ status: 404 })
  })

  it('keeps reads and notification failures independent of completed writes and rejects oversized JSON', async () => {
    vi.mocked(options.afterWrite).mockImplementation(() => { throw new Error('notification failed') })
    expect(await call('POST', '/create')).toMatchObject({ status: 200 })
    expect(await call('POST', '/create', ' '.repeat((1 << 20) + 1))).toMatchObject({ status: 413 })
    expect(options.enqueueMutation).toHaveBeenCalledTimes(1)
  })

  it('queues unknown prefixed paths without treating their suffix as a valid command', async () => {
    const req = request('POST', '/create')
    req.url = '/api/dsh-custom-center/skillsXcreate'
    const res = response()
    const commands = createSkillsCommands({
      log: options.log, afterWrite: options.afterWrite,
      workspaceSkills: options.workspaceSkills, registeredWorkspaces: () => [],
    })
    const enqueueMutation = vi.spyOn(commands, 'enqueueMutation')
    await createSkillsHandler({ ...options, commands })(req, res.stream)
    expect(res.record.status).toBe(404)
    expect(JSON.parse(res.record.body)).toMatchObject({ ok: false, code: 'error.proto.unknownAction' })
    expect(enqueueMutation).toHaveBeenCalledOnce()
    expect(createSkill).not.toHaveBeenCalled()
  })

  it('continues the shared queue after a tool failure and preserves queued HTTP responses', async () => {
    const commands = createSkillsCommands({
      log: options.log, afterWrite: options.afterWrite,
      workspaceSkills: options.workspaceSkills, registeredWorkspaces: () => [],
    })
    const failed = deferred<Awaited<ReturnType<typeof createSkill>>>()
    vi.mocked(createSkill).mockReturnValueOnce(failed.promise)
    const tool = commands.create({ name: 'first', description: 'First', body: 'body' })
    const failure = expect(tool).rejects.toThrow('write failed')
    await flush()
    const res = response()
    const http = createSkillsHandler({ ...options, commands })(request('POST', '/create', '{"name":"second"}'), res.stream)
    await flush()
    expect(createSkill).toHaveBeenCalledTimes(1)
    failed.reject(new Error('write failed'))
    await Promise.all([failure, http])
    expect(vi.mocked(createSkill).mock.calls.map(([input]) => input.name)).toEqual(['first', 'second'])
    expect(res.record.status).toBe(200)
    expect(options.afterWrite).toHaveBeenCalledOnce()
  })

  it('shares the host queue between tools and HTTP and owns registration disposal', async () => {
    const disposers: (() => void)[] = []
    const stopRoute = vi.fn()
    let handler!: ReturnType<typeof createSkillsHandler>
    let execute!: (args: { name: string; description: string; body: string }) => Promise<unknown>
    const ctx = {
      connection: options.ctx.connection,
      skills: { registerProvider: vi.fn(() => vi.fn()) },
      tools: { register: vi.fn((tool) => { execute = tool.execute; return vi.fn() }) },
      webServer: { register: vi.fn((route) => { handler = route.handler; return stopRoute }) },
      effect: (effect: () => () => void) => { disposers.push(effect()) },
      get: vi.fn(), emit: vi.fn(),
    } as unknown as HostContext
    apply(ctx)
    const first = deferred<Awaited<ReturnType<typeof createSkill>>>()
    vi.mocked(createSkill).mockReturnValueOnce(first.promise)
    const tool = execute({ name: 'first', description: 'First', body: 'body' })
    await flush()
    const res = response()
    const http = handler(request('POST', '/create', '{"name":"second"}'), res.stream)
    await flush()
    expect(createSkill).toHaveBeenCalledTimes(1)
    first.resolve({ name: 'first', path: '/fixture/first', root: 'dsh' })
    await Promise.all([tool, http])
    expect(createSkill).toHaveBeenCalledTimes(2)
    expect(vi.mocked(createSkill).mock.calls.map(([input]) => input.name)).toEqual(['first', 'second'])
    expect(res.record.status).toBe(200)
    disposers.reverse().forEach((dispose) => dispose())
    expect(stopRoute).toHaveBeenCalledTimes(1)
  })
})
