import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULTS } from '../../src/douyin/config.js'
import { douyinPaths } from '../../src/douyin/server/paths.js'
import { createPythonRuntime, pythonCommand, venvPython } from '../../src/douyin/server/python-runtime.js'
import { createSetup } from '../../src/douyin/server/setup.js'
import { createContent } from '../../src/douyin/server/content.js'
import { createPublication } from '../../src/douyin/server/publication.js'
import { createComfy } from '../../src/douyin/server/comfy.js'
import { createLedger } from '../../src/douyin/server/ledger.js'
import { createRuntimeState } from '../../src/douyin/server/state.js'
import { createMemory } from '../../src/douyin/server/memory.js'
import { createReplyHistory } from '../../src/douyin/server/reply-history.js'
import { createReplies } from '../../src/douyin/server/replies.js'
import { createActionExecutor } from '../../src/douyin/server/action-executor.js'
import { withExecution } from '../../src/douyin/server/execution-context.js'
import { writeJson } from '../../src/douyin/server/storage.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'douyin-business-')); roots.push(root)
  const paths = douyinPaths(root), config = { ...DEFAULTS }, ledger = createLedger(paths)
  const memory = createMemory(paths, createRuntimeState(paths)), history = createReplyHistory(paths, ledger)
  return { root, paths, config, ledger, memory, history }
}

describe('Python runtime and environment setup', () => {
  it('selects explicit, virtual environment and uv interpreters without changing the host environment', async () => {
    const f = fixture(), before = { ...process.env }
    const runtime = createPythonRuntime(f.paths, () => f.config)
    expect(pythonCommand(f.paths, '/custom/python')).toMatchObject({ command: '/custom/python', via: 'config' })
    expect(pythonCommand(f.paths, 'uv')).toMatchObject({ args: ['run', '--no-project', 'python'], via: 'uv' })
    mkdirSync(join(f.paths.python, process.platform === 'win32' ? 'Scripts' : 'bin'), { recursive: true }); writeFileSync(venvPython(f.paths), '')
    expect(runtime.python()).toMatchObject({ command: venvPython(f.paths), via: 'venv' })
    expect(runtime.env()).toMatchObject({ DSH_DOUYIN_HOME: f.paths.root, DOUYIN_HEADLESS: '1', DOUYIN_ALLOW_WRITES: '1', TMPDIR: f.paths.file('.tmp') })
    expect(process.env).toEqual(before)
    runtime.dispose()
    expect(() => runtime.invoke('douyin_whoami')).toThrow('已卸载')
  })

  it('builds and verifies the interpreter before persisting it, and collects the setup task on disposal', async () => {
    const f = fixture(), runtime = createPythonRuntime(f.paths, () => f.config), persist = vi.fn(async () => {})
    const command = vi.fn(async (_name: string, _args: string[]) => ({ code: 0, output: 'verified\n' }))
    const setup = createSetup(f.paths, runtime, persist, command)
    expect(setup.start()).toMatchObject({ started: true, status: 'running' })
    expect(setup.start()).toMatchObject({ started: true })
    await vi.waitFor(() => expect(setup.state().status).toBe('completed'))
    expect(command.mock.calls[0][1]).toEqual(['-m', 'venv', f.paths.python])
    expect(command.mock.calls[1][1]).toEqual(['-m', 'pip', 'install', '-r', runtime.resources.requirements])
    expect(persist).toHaveBeenCalledWith({ pythonPath: venvPython(f.paths) })
    expect(await setup.status()).toMatchObject({ venvReady: true, phase: 'ready' })
    await setup.dispose(); runtime.dispose()
  })

  it('cancels an active installation before disposal completes', async () => {
    const f = fixture(), runtime = createPythonRuntime(f.paths, () => f.config), persist = vi.fn(async () => {})
    const command: typeof import('../../src/douyin/server/process.js').runCommand = async (_name, _args, options) => new Promise((_, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    })
    const setup = createSetup(f.paths, runtime, persist, command)
    setup.start(); await setup.dispose()
    expect(setup.state().status).toBe('interrupted')
    expect(setup.running()).toBe(false); expect(persist).not.toHaveBeenCalled()
    runtime.dispose()
  })

  it('marks a stopped installation as interrupted without persisting an unverified interpreter', async () => {
    const f = fixture(), runtime = createPythonRuntime(f.paths, () => f.config), persist = vi.fn(async () => {})
    writeJson(f.paths.file('setup-state.json'), { status: 'running', phase: 'dependencies' })
    const command = vi.fn(async () => { throw new Error('dependency installation failed') })
    const setup = createSetup(f.paths, runtime, persist, command)
    expect(setup.state()).toMatchObject({ status: 'interrupted' })
    setup.start(); await vi.waitFor(() => expect(setup.state().status).toBe('failed'))
    expect(persist).not.toHaveBeenCalled()
    expect(readFileSync(f.paths.file('setup.log'), 'utf8')).toContain('dependency installation failed')
    await setup.dispose(); runtime.dispose()
  })
})

describe('content operation bounds', () => {
  it('retains input limits and gives video understanding its longer timeout', async () => {
    const call = vi.fn(async () => ({ ok: true })), content = createContent(() => DEFAULTS, call)
    await content.feed({ num: 100, scrolls: -3 })
    expect(call).toHaveBeenLastCalledWith('douyin_feed', { num: 50, scrolls: 1, skip_live: true }, { timeoutMs: 240000 })
    await content.watch({ aweme_id: '123456', seconds: 900, frames: 1 })
    expect(call).toHaveBeenLastCalledWith('douyin_watch', { aweme_id: '123456', seconds: 600, frames: 3 }, { timeoutMs: 600000 })
    await content.posts({ days: 50 })
    expect(call).toHaveBeenLastCalledWith('douyin_my_posts', { days: 30 }, { timeoutMs: 90000 })
  })
})

describe('publication business preflight', () => {
  it('does not queue a workflow when disabled or over quota', async () => {
    const f = fixture(), comfy = createComfy({ config: () => f.config }), workflow = vi.spyOn(comfy, 'runWorkflow'), call = vi.fn(async () => ({ ok: true, verified: true }))
    const publication = createPublication(() => f.config, f.ledger, comfy, call)
    expect(await publication.publish({ latest: true })).toMatchObject({ blocked: true })
    f.config.autoPublish = true; f.config.publishPerDay = 0
    expect(await publication.publish({ latest: true })).toMatchObject({ blocked: true })
    expect(workflow).not.toHaveBeenCalled(); expect(call).not.toHaveBeenCalled()
  })

  it('defaults to draft and leaves trusted authorization to the shared executor', async () => {
    const f = fixture(), video = join(f.root, 'video.mp4'); writeFileSync(video, 'mp4')
    const comfy = createComfy({ config: () => f.config }), call = vi.fn(async () => ({ ok: true, verified: true }))
    const publication = createPublication(() => f.config, f.ledger, comfy, call)
    expect(await publication.publish({ video_path: video, force: true })).toMatchObject({ blocked: true })
    await withExecution({ origin: 'tool', force: true }, () => publication.publish({ video_path: video }))
    expect(call).toHaveBeenCalledWith('douyin_publish', expect.objectContaining({ video_path: video, draft: true }), { timeoutMs: 300000 })
  })
})

describe('comment reply orchestration through the shared executor', () => {
  function repliesFixture() {
    const f = fixture(); f.config.autoReply = true; f.config.replyRandom = false
    const comments = [{ cid: 'c1', text: '治疗怎么做', user: 'peer' }, { cid: 'c2', text: '', user: 'other', attachments: [{ url: 'https://example.com/image' }] }]
    const invoke = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'douyin_my_posts') return { ok: true, items: [{ aweme_id: '123456', title: 'today' }] }
      if (name === 'douyin_comments') return { ok: true, items: comments }
      if (name === 'douyin_comment') return { ok: true, verified: true, cid: 'posted-' + args.reply_cid }
      return { ok: false }
    })
    const executor = createActionExecutor({ config: () => f.config, ledger: f.ledger, history: f.history, invoke, ownedVideoIds: async () => ['123456'] })
    const generate = vi.fn(async () => 'a reply'), persist = vi.fn(async () => {})
    const replies = createReplies({ config: () => f.config, ledger: f.ledger, history: f.history, memory: f.memory, call: executor.call, generate, describe: async () => '', persist })
    return { ...f, comments, invoke, executor, generate, persist, replies }
  }
  it('refuses sensitive topics, skips unread images, and preserves permanent reply deduplication', async () => {
    const f = repliesFixture()
    const result = await f.replies.round({ count: 3 })
    expect(result).toMatchObject({ ok: true, sent: 1, items: [{ cid: 'c1', sensitive: true, sent: true }, { cid: 'c2', sent: false, skipped: '看图失败，这条先不回' }] })
    expect(f.generate).not.toHaveBeenCalled()
    expect(f.invoke.mock.calls.filter(([name]) => name === 'douyin_comment')[0][1].text).toBe('这个我不太方便聊，换个话题吧。')
    expect((await f.replies.round({ count: 3 })).sent).toBe(0)
    expect(f.history.cids().has('c1')).toBe(true)
  })

  it('looks up the actual comment instead of trusting caller-supplied benign text', async () => {
    const f = repliesFixture()
    const result = await f.replies.single({ aweme_id: '123456', cid: 'c1', text: '当然可以！', comment: '谢谢分享' })
    expect(result).toMatchObject({ ok: true, sent: '这个我不太方便聊，换个话题吧。' })
    expect(f.invoke).toHaveBeenCalledWith('douyin_comments', expect.anything())
  })

  it('does not discover or generate any reply while automatic replies are disabled', async () => {
    const f = repliesFixture(); f.config.autoReply = false
    expect(await f.replies.round()).toMatchObject({ blocked: true })
    expect(f.invoke).not.toHaveBeenCalled(); expect(f.generate).not.toHaveBeenCalled()
  })
})
