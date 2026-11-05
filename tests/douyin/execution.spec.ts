import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULTS, type DouyinConfig } from '../../src/douyin/config.js'
import { createActionExecutor, type Invoke } from '../../src/douyin/server/action-executor.js'
import { withExecution } from '../../src/douyin/server/execution-context.js'
import { createLedger } from '../../src/douyin/server/ledger.js'
import { douyinPaths } from '../../src/douyin/server/paths.js'
import { createReplyHistory } from '../../src/douyin/server/reply-history.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture(patch: Partial<DouyinConfig> = {}, backend?: Invoke) {
  const root = mkdtempSync(join(tmpdir(), 'douyin-execution-')); roots.push(root)
  const paths = douyinPaths(root)
  const config = { ...DEFAULTS, ...patch }
  let time = new Date('2026-11-03T12:00:00')
  const ledger = createLedger(paths, () => time)
  const history = createReplyHistory(paths, ledger)
  const invoke = vi.fn(backend ?? (async () => ({ ok: true, verified: true, cid: '999999' })))
  const inputs = { ledger, history, invoke, config: () => config, ownedVideoIds: async () => ['111111'] }
  const executor = createActionExecutor(inputs)
  return { root, paths, config, ledger, history, invoke, executor, inputs, setTime: (value: string) => { time = new Date(value) } }
}

describe('shared account execution', () => {
  it('keeps every account write gate closed by default and still allows reads', async () => {
    const f = fixture()
    for (const [name, args] of [
      ['douyin_like', { aweme_id: '111111' }],
      ['douyin_comment', { aweme_id: '111111', text: '不错' }],
      ['douyin_publish', { video_path: '/explicit/video.mp4' }],
      ['douyin_chat_send', { nickname: 'friend', text: '你好' }],
    ] as const) expect(await f.executor.call(name, args)).toMatchObject({ ok: false, blocked: true })
    expect(f.invoke).not.toHaveBeenCalled()
    expect(await f.executor.call('douyin_video', { aweme_id: '111111' })).toMatchObject({ ok: true })
  })

  it('uses the latest configuration inside the lock', async () => {
    const f = fixture()
    expect((await f.executor.call('douyin_like', { aweme_id: '111111' })).ok).toBe(false)
    f.config.autoLike = true
    expect((await f.executor.call('douyin_like', { aweme_id: '111111' })).verified).toBe(true)
    expect(f.invoke).toHaveBeenCalledTimes(1)
  })

  it('serializes HTTP and timer instances against one daily allowance', async () => {
    const f = fixture({ autoCommentPlain: true, plainCommentPerDay: 1 })
    const second = createActionExecutor(f.inputs)
    const results = await Promise.all([
      withExecution({ origin: 'http' }, () => f.executor.call('douyin_comment', { aweme_id: '111111', text: '第一条' })),
      withExecution({ origin: 'timer' }, () => second.call('douyin_comment', { aweme_id: '222222', text: '第二条' })),
    ])
    expect(results.filter((result) => result.verified)).toHaveLength(1)
    expect(f.invoke).toHaveBeenCalledTimes(1)
    expect(f.ledger.count('plain')).toBe(1)
  })

  it('honors imported upstream action keys before contacting the backend', async () => {
    const f = fixture({ msgAllowTo: 'friend' })
    const data = f.ledger.read()
    data.actions['share:friend:111111'] = { kind: 'share', status: 'succeeded', day: f.ledger.day() }
    f.ledger.write(data)
    expect(await f.executor.call('douyin_share_video', { nickname: 'friend', aweme_id: '111111' })).toMatchObject({ already: true, status: 'succeeded' })
    expect(f.invoke).not.toHaveBeenCalled()
  })

  it('reserves an unverified send without reporting success or automatically retrying', async () => {
    const f = fixture({ autoCommentPlain: true, plainCommentPerDay: 1 }, async () => ({ ok: true }))
    const result = await f.executor.call('douyin_comment', { aweme_id: '111111', text: '你好' })
    expect(result).toMatchObject({ ok: false, verified: false, status: 'unknown' })
    expect(f.ledger.count('plain')).toBe(0)
    expect(await f.executor.call('douyin_comment', { aweme_id: '111111', text: '你好' })).toMatchObject({ already: true, status: 'unknown' })
    expect(await f.executor.call('douyin_comment', { aweme_id: '222222', text: '你好' })).toMatchObject({ blocked: true })
    expect(f.invoke).toHaveBeenCalledTimes(1)
  })

  it('keeps transport, malformed protocol and partial outcomes pending verification', async () => {
    for (const backend of [async () => { throw new Error('disconnected') }, async () => null, async () => ({ ok: false, status: 'partial' })]) {
      const f = fixture({ autoLike: true }, backend)
      expect(await f.executor.call('douyin_like', { aweme_id: '111111' })).toMatchObject({ verified: false, status: 'unknown' })
      expect((await f.executor.call('douyin_like', { aweme_id: '111111' })).already).toBe(true)
      expect(f.invoke).toHaveBeenCalledTimes(1)
    }
  })

  it('requires platform confirmation and a valid login rather than an ok flag', async () => {
    const f = fixture({ autoCommentPlain: true }, async () => ({ ok: true, verified: true, needLogin: true }))
    expect(await f.executor.call('douyin_comment', { aweme_id: '111111', text: '你好' })).toMatchObject({ ok: false, verified: false, status: 'unknown' })
    expect(f.ledger.count('plain')).toBe(0)
  })

  it('allows retry after a definite failure and atomically records a verified receipt', async () => {
    let attempts = 0
    const f = fixture({ autoCommentPlain: true }, async () => ++attempts === 1 ? { ok: false } : { ok: true, verified: true, cid: 'receipt' })
    expect((await f.executor.call('douyin_comment', { aweme_id: '111111', text: '你好' })).status).toBe('failed')
    expect((await f.executor.call('douyin_comment', { aweme_id: '111111', text: '你好' })).status).toBe('succeeded')
    const data = f.ledger.read()
    expect(data.actions['top:111111'].platformId).toBe('receipt')
    expect(data.plainComments['111111'].text).toBe('你好')
    expect(f.ledger.count('plain')).toBe(1)
  })

  it('accepts force only from a trusted explicit tool context', async () => {
    const f = fixture({ plainCommentPerDay: 0 })
    const args = { aweme_id: '111111', text: '你好', force: true }
    expect((await f.executor.call('douyin_comment', args)).blocked).toBe(true)
    expect((await withExecution({ origin: 'headless', force: true }, () => f.executor.call('douyin_comment', args))).blocked).toBe(true)
    for (let count = 0; count < 2; count++) expect((await withExecution({ origin: 'tool', force: true }, () => f.executor.call('douyin_comment', args))).verified).toBe(true)
    expect(f.invoke).toHaveBeenCalledTimes(2)
    expect(f.invoke.mock.calls[0][1]).not.toHaveProperty('force')
    expect(f.ledger.count('plain')).toBe(2)
  })

  it('restricts replies to authorized own works even with explicit force', async () => {
    const f = fixture({ autoReply: true })
    expect(await withExecution({ origin: 'tool', force: true }, () => f.executor.call('douyin_comment', { aweme_id: '222222', reply_cid: '123456', text: '你好' }))).toMatchObject({ blocked: true })
    expect(f.invoke).not.toHaveBeenCalled()
  })

  it('reads the actual target, sanitizes replies and persists permanent reply indexes', async () => {
    const f = fixture({ autoReply: true }, async (name) => name === 'douyin_comments'
      ? { ok: true, items: [{ cid: '123456', user: 'friend', text: '谢谢喜欢' }] }
      : { ok: true, verified: true, cid: 'receipt' })
    expect((await f.executor.call('douyin_comment', { aweme_id: '111111', reply_cid: '123456', text: '一'.repeat(30) })).verified).toBe(true)
    expect(f.invoke.mock.calls[1][1]).toMatchObject({ text: '一'.repeat(20), mention: '' })
    expect(readFileSync(f.paths.file('replied-cids.txt'), 'utf8')).toContain('123456')
    expect(readFileSync(f.paths.file('replied-users.txt'), 'utf8')).toContain('friend')
    f.setTime('2026-11-04T12:00:00'); f.ledger.prune()
    expect(f.history.cids().has('123456')).toBe(true)
    expect((await f.executor.call('douyin_comment', { aweme_id: '111111', reply_cid: '123456', text: '再回' })).already).toBe(true)
  })

  it('refuses sensitive topics and declines targets absent from the comment list', async () => {
    const f = fixture({ autoReply: true }, async (name) => name === 'douyin_comments' ? { ok: true, items: [] } : { ok: true, verified: true })
    expect((await f.executor.call('douyin_comment', { aweme_id: '111111', reply_cid: '123456', text: '你好' })).blocked).toBe(true)
    const result = await withExecution({ origin: 'tool', replyTarget: { user: 'friend', text: '怎么起诉' } }, () => f.executor.call('douyin_comment', { aweme_id: '111111', reply_cid: '123456', text: '提供法律建议' }))
    expect(result.verified).toBe(true)
    expect(f.invoke.mock.calls.at(-1)?.[1].text).toBe('这个我不太方便聊，换个话题吧。')
  })

  it('confines headless MP4s by realpath, rejects directories and forces configured drafts', async () => {
    const f = fixture({ autoPublish: true, publishPerDay: 10 })
    const output = join(f.root, 'comfy'); mkdirSync(output)
    f.config.comfyOutputDir = output
    const outside = join(f.root, 'outside.mp4'); writeFileSync(outside, 'fake')
    const escaped = join(output, 'escape.mp4'); symlinkSync(outside, escaped)
    const directory = join(output, 'directory.mp4'); mkdirSync(directory)
    for (const video_path of [outside, escaped, directory]) expect((await withExecution({ origin: 'headless', runId: 'run' }, () => f.executor.call('douyin_publish', { video_path, draft: false }))).blocked).toBe(true)
    const video_path = join(output, 'inside.mp4'); writeFileSync(video_path, 'fake')
    expect((await withExecution({ origin: 'headless', runId: 'run' }, () => f.executor.call('douyin_publish', { video_path, draft: false }))).verified).toBe(true)
    expect(f.invoke).toHaveBeenCalledTimes(1)
    expect(f.invoke.mock.calls[0][1].draft).toBe(true)
    expect(Object.keys(f.ledger.read().actions)[0]).toMatch(/:draft$/)
  })

  it('authorizes incoming messages by trusted contact and message id with per-contact caps', async () => {
    const f = fixture({ dmReply: true, dmReplyOnlyTo: 'friend', dmReplyPerContact: 1, dmReplyPerDay: 10 })
    const args = { nickname: 'friend', text: '你好', inbound: true }
    expect((await f.executor.call('douyin_chat_send', args)).blocked).toBe(true)
    expect((await withExecution({ origin: 'timer', inbound: { contact: 'someone else', messageId: 'm1' } }, () => f.executor.call('douyin_chat_send', args))).blocked).toBe(true)
    expect((await withExecution({ origin: 'timer', inbound: { contact: 'friend', messageId: 'm1', peerId: 'stable' } }, () => f.executor.call('douyin_chat_send', args))).verified).toBe(true)
    expect((await withExecution({ origin: 'timer', inbound: { contact: 'friend', messageId: 'm2', peerId: 'stable' } }, () => f.executor.call('douyin_chat_send', args))).blocked).toBe(true)
    expect(f.ledger.read().dm.stable).toMatchObject({ count: 1, lastMessageId: 'm1', exempt: false })
  })

  it('keeps reply recipients independent and applies quotas equally to outbound contacts', async () => {
    const f = fixture({ msgAllowTo: 'friend', dmReplyOnlyTo: 'friend', dmReplyPerContact: 0, dmReplyPerDay: 0 })
    const send = (messageId: string) => withExecution({ origin: 'timer', inbound: { contact: 'friend', messageId } }, () => f.executor.call('douyin_chat_send', { nickname: 'friend', text: '你好' }))
    expect((await send('m1')).blocked).toBe(true)
    f.config.dmReply = true
    expect((await send('m1')).blocked).toBe(true)
    f.config.dmReplyPerDayUnlimited = true
    expect((await send('m1')).blocked).toBe(true)
    f.config.dmReplyPerContactUnlimited = true
    expect((await send('m1')).verified).toBe(true)
    f.config.msgAllowTo = ''
    expect((await send('m2')).verified).toBe(true)
    expect(f.ledger.read().dm.friend).toMatchObject({ count: 2, exempt: false })
    f.config.dmReplyOnlyTo = ''
    expect((await send('m3')).blocked).toBe(true)
    expect((await f.executor.call('douyin_chat_send', { nickname: 'friend', text: '主动消息' })).blocked).toBe(true)
  })

  it('enforces each finite quota independently and counts uncertain sends with normalized names', async () => {
    const f = fixture({ dmReply: true, dmReplyOnlyTo: 'friend,other', dmReplyPerContact: 1, dmReplyPerDay: 1 }, async () => ({ ok: true, verified: false }))
    const send = (name: string, messageId: string) => withExecution({ origin: 'timer', inbound: { contact: name, messageId } }, () => f.executor.call('douyin_chat_send', { nickname: name, text: '你好' }))
    expect((await send('Friend', 'm1')).status).toBe('unknown')
    f.config.dmReplyPerDayUnlimited = true
    expect((await send(' friend ', 'm2')).blocked).toBe(true)
    f.config.dmReplyPerDayUnlimited = false; f.config.dmReplyPerContactUnlimited = true
    expect((await send('other', 'm3')).blocked).toBe(true)
    f.config.dmReplyPerDayUnlimited = true
    expect((await send('friend', 'm4')).status).toBe('unknown')
    expect(f.invoke).toHaveBeenCalledTimes(2)
  })

  it('counts legacy exempt replies while excluding streak records from the daily reply quota', async () => {
    const f = fixture({ dmReply: true, dmReplyOnlyTo: 'friend', dmReplyPerDay: 1, dmReplyPerContactUnlimited: true })
    const data = f.ledger.read()
    data.dm.friend = { day: f.ledger.day(), name: 'friend', exempt: true, count: 1 }
    data.dm['streak:today'] = { day: f.ledger.day(), count: 20 }
    f.ledger.write(data)
    const send = () => withExecution({ origin: 'timer', inbound: { contact: 'friend', messageId: 'new' } }, () => f.executor.call('douyin_chat_send', { nickname: 'friend', text: '你好' }))
    expect((await send()).blocked).toBe(true)
    delete data.dm.friend; f.ledger.write(data)
    expect((await send()).verified).toBe(true)
    expect(f.invoke).toHaveBeenCalledOnce()
  })

  it('shares the comment round cap across mentioned and plain headless comments', async () => {
    const f = fixture({ autoComment: true, autoCommentPlain: true, mentionName: 'friend', commentPerRound: 1 })
    await withExecution({ origin: 'headless', runId: 'r1' }, () => f.executor.call('douyin_comment', { aweme_id: '111111', text: '第一条' }))
    const result = await withExecution({ origin: 'headless', runId: 'r1' }, () => f.executor.call('douyin_comment', { aweme_id: '222222', text: '第二条', mention: 'friend' }))
    expect(result).toMatchObject({ blocked: true })
    expect(f.invoke).toHaveBeenCalledTimes(1)
  })

  it('retains the clicked-share outcome for a following note while leaving confirmation unknown', async () => {
    const f = fixture({ msgAllowTo: 'friend' }, async () => ({ ok: false, clicked: true }))
    expect(await f.executor.call('douyin_share_video', { nickname: 'friend', aweme_id: '111111' })).toMatchObject({ ok: true, status: 'unknown', verified: false })
    expect(f.ledger.count('share')).toBe(0)
  })

  it('reconciles an old uncertain reply without sending or charging it to today', async () => {
    const f = fixture({}, async () => ({ ok: true, found: true, cid: 'receipt' }))
    const data = f.ledger.read()
    data.actions['reply:123456'] = { kind: 'reply', status: 'unknown', day: '2026-11-02', args: { aweme_id: '111111', reply_cid: '123456', text: '你好' } }
    f.ledger.write(data)
    expect(await f.executor.reconcile()).toMatchObject({ checked: 1, verified: 1 })
    expect(f.invoke.mock.calls[0][0]).toBe('douyin_check_reply')
    expect(f.ledger.count('reply')).toBe(0)
    expect(f.ledger.count('reply', '2026-11-02')).toBe(1)
    expect(f.history.cids().has('123456')).toBe(true)
    expect(await f.executor.reconcile()).toMatchObject({ checked: 0 })
  })

  it('stops before external work if the ledger is malformed', async () => {
    const f = fixture({ autoCommentPlain: true })
    mkdirSync(join(f.root, 'ledger')); writeFileSync(f.paths.ledger, '{')
    await expect(f.executor.call('douyin_comment', { aweme_id: '111111', text: '你好' })).rejects.toThrow('账本损坏')
    expect(f.invoke).not.toHaveBeenCalled()
  })
})
