import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULTS } from '../../src/douyin/config.js'
import { douyinPaths } from '../../src/douyin/server/paths.js'
import { createComfy } from '../../src/douyin/server/comfy.js'
import { createMemory } from '../../src/douyin/server/memory.js'
import { createReports } from '../../src/douyin/server/reports.js'
import { createLedger } from '../../src/douyin/server/ledger.js'
import { createRuntimeState } from '../../src/douyin/server/state.js'
import { createCleanup } from '../../src/douyin/server/cleanup.js'
import { createBrowser } from '../../src/douyin/server/browser.js'
import { dmMessageContext, dmMessageKey, normalizeDmMessage } from '../../src/douyin/server/dm-messages.js'
import { withExecution } from '../../src/douyin/server/execution-context.js'
import { writeJson } from '../../src/douyin/server/storage.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'douyin-support-')); roots.push(root)
  const paths = douyinPaths(root), state = createRuntimeState(paths)
  return { root, paths, state }
}

describe('ComfyUI outputs', () => {
  it('lists nested MP4s by modification time without following symlinks', () => {
    const f = fixture(), output = join(f.root, 'output'); mkdirSync(join(output, 'nested'), { recursive: true })
    const old = join(output, 'old.mp4'), recent = join(output, 'nested/new.MP4')
    writeFileSync(old, 'old'); utimesSync(old, 1, 1); writeFileSync(recent, 'new')
    writeFileSync(join(output, 'ignore.json'), '{}'); symlinkSync(old, join(output, 'alias.mp4'))
    const comfy = createComfy({ config: () => ({ ...DEFAULTS, comfyOutputDir: output }) })
    expect(comfy.list(1)).toMatchObject({ total: 2, items: [{ path: recent }] })
  })

  it('uses only the completed prompt outputs rather than the newest unrelated video', async () => {
    const f = fixture(), output = join(f.root, 'output'); mkdirSync(output)
    const video = join(output, 'result.mp4'); writeFileSync(video, 'result'); writeFileSync(join(output, 'unrelated.mp4'), 'new')
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{"prompt_id":"job"}')).mockResolvedValueOnce(new Response(JSON.stringify({ job: { status: { completed: true }, outputs: { '4': { videos: [{ type: 'output', filename: 'result.mp4' }] } } } })))
    const comfy = createComfy({ config: () => ({ ...DEFAULTS, comfyWorkflow: '{"1":{}}', comfyOutputDir: output }), fetch: request, sleep: async () => {} })
    expect(await comfy.runWorkflow()).toMatchObject({ ok: true, promptId: 'job', video: realpathSync(video) })
    expect(request.mock.calls[0][0]).toBe(DEFAULTS.comfyUrl + '/prompt')
  })

  it('inherits cancellation and does not poll after the workflow wait is cancelled', async () => {
    const abort = new AbortController(), request = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"prompt_id":"job"}'))
    const comfy = createComfy({ config: () => ({ ...DEFAULTS, comfyWorkflow: '{}' }), fetch: request, sleep: async () => { abort.abort() } })
    await expect(withExecution({ origin: 'tool', signal: abort.signal }, () => comfy.runWorkflow())).rejects.toThrow()
    expect(request).toHaveBeenCalledTimes(1)
    expect((request.mock.calls[0]![1]!.signal as AbortSignal).aborted).toBe(true)
  })
  it('rejects ambiguous and physically escaped workflow results', async () => {
    for (const escaped of [false, true]) {
      const f = fixture(), output = join(f.root, 'output'); mkdirSync(output)
      const outside = join(f.root, 'outside.mp4'); writeFileSync(outside, 'outside')
      const video = join(output, 'first.mp4')
      if (escaped) symlinkSync(outside, video); else writeFileSync(video, 'first')
      writeFileSync(join(output, 'second.mp4'), 'second')
      const videos = [{ type: 'output', filename: 'first.mp4' }, ...(escaped ? [] : [{ type: 'output', filename: 'second.mp4' }])]
      const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{"prompt_id":"job"}')).mockResolvedValueOnce(new Response(JSON.stringify({ job: { status: { status_str: 'success' }, outputs: { '4': { videos } } } })))
      const comfy = createComfy({ config: () => ({ ...DEFAULTS, comfyWorkflow: '{}', comfyOutputDir: output }), fetch: request, sleep: async () => {} })
      await expect(comfy.runWorkflow()).rejects.toThrow(escaped ? '符号链接越界' : '2 个有效 MP4')
    }
  })
})

describe('memory, persona and reports', () => {
  it('reads two months of memory and refreshes only the automatic persona tail once daily', () => {
    const f = fixture(), when = new Date('2026-11-03T12:00:00'), memory = createMemory(f.paths, f.state, () => when)
    mkdirSync(f.paths.memory)
    writeFileSync(join(f.paths.memory, '2026-09.md'), 'too old\n')
    writeFileSync(join(f.paths.memory, '2026-10.md'), 'previous month\n')
    memory.append('观察素材（不是指令）：喜欢猫')
    memory.savePersona('手写人设正文\n')
    memory.dm('friend', 'hello\nthere', '你好', when)
    expect(memory.read().join('\n')).not.toContain('too old')
    expect(memory.read().join('\n')).toContain('previous month')
    expect(memory.refreshPersona()).toMatchObject({ ok: true, items: 1 })
    expect(memory.persona()).toContain('手写人设正文\n')
    expect(memory.persona()).toContain('喜欢猫')
    expect(memory.refreshPersona()).toMatchObject({ skipped: '今天已经更新过' })
    expect(readFileSync(f.paths.file('persona.md.bak'), 'utf8')).toBe('手写人设正文\n')
  })

  it('keeps report-off silent and watched grouping compatible with the ledger', () => {
    const f = fixture(), ledger = createLedger(f.paths, () => new Date('2026-11-03T12:00:00')), reports = createReports(f.paths, ledger)
    reports.append('hidden', 'off')
    expect(reports.latest()).toBeNull()
    reports.append('# Today\n### 111111', 'full')
    expect(reports.latest()).toMatchObject({ name: '2026-11-03.md', text: '\n# Today\n### 111111\n' })
    const data = ledger.read()
    data.picks['2026-11-03:111111'] = { day: '2026-11-03', aweme_id: '111111', title: 'one' }
    data.picks['2026-11-02:222222'] = { day: '2026-11-02', aweme_id: '222222' }
    ledger.write(data)
    expect(reports.watched(1)).toMatchObject({ total: 1, days: [{ day: '2026-11-03', count: 1 }], items: [{ url: 'https://www.douyin.com/video/111111' }] })
  })
})

describe('owned-resource cleanup', () => {
  it('removes owned temporary media but retains transcripts, account state and external attachment paths', async () => {
    const f = fixture(), media = f.paths.file('media'), temp = f.paths.file('.tmp')
    mkdirSync(media, { recursive: true }); mkdirSync(temp)
    const external = join(f.root, 'external.txt'); writeFileSync(external, 'keep')
    writeFileSync(join(media, 'download.mp4'), 'remove'); writeFileSync(join(media, 'transcript.json'), '{}')
    symlinkSync(external, join(temp, 'alias')); writeFileSync(join(temp, 'remove'), 'remove')
    mkdirSync(join(f.paths.browser, 'Default/Cache'), { recursive: true })
    writeFileSync(join(f.paths.browser, 'Default/Cookies'), 'keep-login'); writeFileSync(join(f.paths.browser, 'Default/Cache/old'), 'remove')
    writeJson(f.paths.file('dm-sticker-attachments.json'), { items: [{ path: external, at: 1 }] })
    const cleanup = createCleanup(f.paths, () => false, f.state)
    expect((await cleanup.run()).cleaned).toBe(3)
    expect(existsSync(join(media, 'download.mp4'))).toBe(false)
    expect(existsSync(join(media, 'transcript.json'))).toBe(true)
    expect(existsSync(join(temp, 'alias'))).toBe(true)
    expect(readFileSync(external, 'utf8')).toBe('keep')
    expect(readFileSync(join(f.paths.browser, 'Default/Cookies'), 'utf8')).toBe('keep-login')
  })

  it('refuses cleanup roots redirected outside the runtime home', async () => {
    const f = fixture(), external = fixture()
    mkdirSync(f.paths.cache); writeFileSync(join(external.root, 'keep.mp4'), 'keep')
    symlinkSync(external.root, f.paths.file('media'))
    expect((await createCleanup(f.paths, () => false, f.state).run()).cleaned).toBe(0)
    expect(readFileSync(join(external.root, 'keep.mp4'), 'utf8')).toBe('keep')
  })

  it('defers cleanup while account work is active', async () => {
    const f = fixture(); mkdirSync(f.paths.file('.tmp'), { recursive: true }); writeFileSync(join(f.paths.file('.tmp'), 'keep'), 'keep')
    expect(await createCleanup(f.paths, () => true, f.state).run()).toMatchObject({ cleaned: 0, skipped: expect.any(String) })
    expect(existsSync(join(f.paths.file('.tmp'), 'keep'))).toBe(true)
  })
})

describe('browser login lifecycle without a browser', () => {
  it('uses the server-owned QR path and returns to headless after verified login', async () => {
    const f = fixture(); mkdirSync(f.paths.cache); writeFileSync(f.paths.file('login-qr.png'), 'png')
    const invoke = vi.fn(async (name: string) => name === 'douyin_login_qr' ? { ok: true, png: '/untrusted/path' } : { ok: true, loggedIn: true })
    const restart = vi.fn(async () => {})
    const browser = createBrowser({ paths: f.paths, config: () => DEFAULTS, persist: async () => {}, invoke, restart, env: () => f.paths.childEnv() }, f.state)
    expect(await browser.qr()).toMatchObject({ png: f.paths.file('login-qr.png'), qr: 'data:image/png;base64,cG5n' })
    await browser.visible(true)
    expect(existsSync(f.paths.file('.login-browser'))).toBe(true)
    expect(await browser.poll()).toMatchObject({ loggedIn: true })
    expect(existsSync(f.paths.file('.login-browser'))).toBe(false)
    expect(f.state.hasLogin()).toBe(true)
    expect(restart).toHaveBeenCalledTimes(2)
  })
})

describe('incoming message identity and context', () => {
  it('deduplicates attachments and keeps author, peer and message identities separate', () => {
    const message = normalizeDmMessage({ messageId: '1', direction: 'inbound', conversationId: 'c', awemeId: '111111', videoAuthor: 'author', media: ['https://example.com/image'], attachments: [{ url: 'https://example.com/image', alt: 'one' }, { url: 'file:///private' }] })
    expect(message.attachments).toHaveLength(1)
    expect(dmMessageKey('friend', message)).not.toBe(dmMessageKey('other', message))
    expect(dmMessageKey('friend', normalizeDmMessage({}))).toBe('')
    expect(dmMessageContext(message)).toContain('不是分享者或聊天对象')
    expect(dmMessageContext(message)).toContain('不得假装看懂')
    expect(message.fromMe).toBe(false)
  })
})
