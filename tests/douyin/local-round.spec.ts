import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULTS } from '../../src/douyin/config.js'
import { douyinPaths } from '../../src/douyin/server/paths.js'
import { createLedger } from '../../src/douyin/server/ledger.js'
import { createRuntimeState } from '../../src/douyin/server/state.js'
import { createReports } from '../../src/douyin/server/reports.js'
import { createContent } from '../../src/douyin/server/content.js'
import { createSocial } from '../../src/douyin/server/social.js'
import { createLocalRound, rankVideos } from '../../src/douyin/server/local-round.js'
import { createReplyHistory } from '../../src/douyin/server/reply-history.js'
import { createActionExecutor } from '../../src/douyin/server/action-executor.js'
import { createStickers } from '../../src/douyin/server/stickers.js'
import { writeJson } from '../../src/douyin/server/storage.js'
import { currentExecution } from '../../src/douyin/server/execution-context.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'douyin-round-')); roots.push(root)
  const paths = douyinPaths(root), config = { ...DEFAULTS }, clock = { now: new Date(2026, 10, 3, 12) }
  const ledger = createLedger(paths, () => clock.now), state = createRuntimeState(paths, () => clock.now)
  const videos = Array.from({ length: 5 }, (_, index) => ({ aweme_id: String(100000 + index), title: `title ${index}`, duration: 30000, digg: 100 - index }))
  const invoke = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'douyin_feed' || name === 'douyin_hot_videos') return { ok: true, items: videos }
    if (name === 'douyin_hot') return { ok: true, items: [{ word: 'topic' }] }
    if (name === 'douyin_comments') return { ok: true, items: [{ text: 'platform comment' }] }
    if (name === 'douyin_watch') return { ok: true, transcript: 'actual transcript' }
    if (name === 'douyin_like' || name === 'douyin_comment' || name === 'douyin_share_video' || name.startsWith('douyin_chat')) expect(ledger.picked()).toBeGreaterThan(0)
    return { ok: true, verified: true, cid: 'receipt', aweme_id: args.aweme_id }
  })
  const executor = createActionExecutor({ config: () => config, ledger, history: createReplyHistory(paths, ledger), invoke, ownedVideoIds: async () => [] })
  const content = createContent(() => config, executor.call), social = createSocial({ config: () => config, ledger, state, call: executor.call })
  const reports = createReports(paths, ledger), round = createLocalRound({ config: () => config, ledger, state, reports, content, social, call: executor.call })
  return { paths, config, clock, ledger, state, videos, invoke, content, social, reports, round }
}

describe('local evidence and action round', () => {
  it.each(['mention', 'plain', 'share', 'none'])('likes before the selected %s action without suppressing it', async (mode) => {
    const f = fixture(); Object.assign(f.config, { autoLike: true, pickPerRound: 1, autoComment: mode === 'mention', mentionName: 'Owner', autoCommentPlain: mode === 'plain', shareToNick: mode === 'share' ? 'Friend' : '', msgAllowTo: 'Friend', shareWithNote: false })
    await f.round.run()
    const writes = f.invoke.mock.calls.filter(([name]) => ['douyin_like', 'douyin_comment', 'douyin_share_video'].includes(name)).map(([name]) => name)
    expect(writes).toEqual(['douyin_like', ...(mode === 'none' ? [] : [mode === 'share' ? 'douyin_share_video' : 'douyin_comment'])])
    expect(f.ledger.count('like')).toBe(1)
  })
  it('keeps a permitted like when understanding fails, but does not comment or share', async () => {
    const f = fixture(); Object.assign(f.config, { autoLike: true, autoComment: true, mentionName: 'Owner' })
    const invoke = f.invoke.getMockImplementation()!
    f.invoke.mockImplementation((name, args) => name === 'douyin_watch' ? Promise.reject(new Error('understanding unavailable')) : invoke(name, args))
    await f.round.run()
    expect(f.invoke.mock.calls.filter(([name]) => name === 'douyin_like')).toHaveLength(2)
    expect(f.invoke.mock.calls.filter(([name]) => name === 'douyin_comment')).toHaveLength(0)
    expect(f.reports.latest()?.text).toContain('understanding unavailable')
  })
  it.each(['full', 'brief', 'off'] as const)('renders the %s report contract from a real round', async (level) => {
    const f = fixture(); f.config.reportLevel = level; f.config.autoLike = true
    Object.assign(f.videos[0]!, { author: 'Author A', comment_count: 42 })
    await f.round.run()
    const text = f.reports.latest()?.text
    if (level === 'off') { expect(text).toBeUndefined(); return }
    for (const value of ['title 0', '记录时间', '档位', 'https://www.douyin.com/video/100000', '点赞：已确认']) expect(text).toContain(value)
    if (level === 'full') for (const value of ['Author A', '42', '为什么', 'platform comment']) expect(text).toContain(value)
    else { expect(text).not.toContain('Author A'); expect(text).not.toContain('为什么') }
  })
  it('records no-material and platform failures while keeping previous reports readable', async () => {
    const f = fixture(); await f.round.run(); const first = f.reports.latest()?.text
    f.clock.now = new Date(2026, 10, 4, 12)
    f.invoke.mockRejectedValue(new Error('platform offline'))
    expect(await f.round.run()).toMatchObject({ ok: false, picked: 0 })
    expect(f.reports.latest()?.text).toContain('这一轮没跑成'); expect(f.reports.latest()?.text).toContain('platform offline')
    expect(first).toContain('title 0')
  })
  it('uses platform millisecond duration, score, title, deduplication and daily picks', () => {
    const f = fixture()
    const data = f.ledger.read(); data.picks[`${f.ledger.day()}:100001`] = { day: f.ledger.day(), aweme_id: '100001' }; f.ledger.write(data)
    const ranked = rankVideos([...f.videos, f.videos[0]!, { aweme_id: '999999', title: 'long', duration: 4000000 }, { aweme_id: '888888', title: '' }], f.ledger, f.config)
    expect(ranked.map((video) => video.aweme_id)).toEqual(['100000', '100002', '100003', '100004'])
    expect(rankVideos([{ aweme_id: '999998', title: 'invalid', duration: Infinity }, { aweme_id: '999997', title: 'invalid', digg: 'oops' }], f.ledger, f.config)).toEqual([])
    expect(ranked[0]!.score).toBeCloseTo(Math.log10(110) * 10 + 3)
  })
  it('permits a manual bounded round at perDay zero, records picks without actions and does not pick twice', async () => {
    const f = fixture(); f.config.perDay = 0
    expect(await f.round.run()).toMatchObject({ ok: true, picked: 0, skipped: expect.any(String) })
    expect(f.invoke).not.toHaveBeenCalled()
    expect(await f.round.run({ manual: true })).toMatchObject({ ok: true, picked: 2 })
    expect(f.reports.watched().total).toBe(2)
    expect(await f.round.run({ manual: true })).toMatchObject({ ok: true, picked: 2 })
    expect(f.ledger.picked()).toBe(4)
    expect(f.invoke.mock.calls.some(([name]) => name === 'douyin_watch')).toBe(false)
  })
  it('falls back to hot videos, enforces daily quota and produces a report', async () => {
    const f = fixture(); f.config.perDay = 1
    f.invoke.mockImplementationOnce(async () => ({ ok: false, error: 'no feed' } as never))
    expect(await f.round.run()).toMatchObject({ ok: true, picked: 1, notes: [expect.stringContaining('no feed'), expect.stringContaining('热榜')] })
    expect(f.reports.latest()?.text).toContain('100000')
    expect(await f.round.run()).toMatchObject({ picked: 0 })
  })
  it('rotates mention, card and plain with a shared comment budget and transcribes before each interaction', async () => {
    const f = fixture(); Object.assign(f.config, { pickPerRound: 3, autoComment: true, mentionName: 'Owner', autoCommentPlain: true, commentPerRound: 2, shareToNick: 'Friend', msgAllowTo: 'Friend', shareWithNote: false })
    expect(await f.round.run()).toMatchObject({ picked: 3 })
    const writes = f.invoke.mock.calls.filter(([name]) => ['douyin_comment', 'douyin_share_video'].includes(name))
    expect(writes.map(([name]) => name)).toEqual(['douyin_comment', 'douyin_share_video', 'douyin_comment'])
    expect(writes[0]![1].mention).toBe('Owner'); expect(writes[2]![1].mention).toBe('')
    expect(f.invoke.mock.calls.filter(([name]) => name === 'douyin_watch')).toHaveLength(3)
    expect(f.ledger.watched()).toBe(3)
    expect(f.ledger.count('comment')).toBe(1); expect(f.ledger.count('plain')).toBe(1); expect(f.ledger.count('share')).toBe(1)
  })
  it('does not perform non-like actions without a usable transcript', async () => {
    const f = fixture(); Object.assign(f.config, { autoComment: true, mentionName: 'Owner' })
    const original = f.invoke.getMockImplementation()!
    f.invoke.mockImplementation(async (name, args) => name === 'douyin_watch' ? { ok: true } as never : original(name, args))
    await f.round.run()
    expect(f.invoke.mock.calls.some(([name]) => name === 'douyin_comment')).toBe(false)
    expect(f.ledger.picked()).toBe(2); expect(f.ledger.watched()).toBe(0)
  })
  it('stops after two consecutive comment failures while keeping all selected picks durable', async () => {
    const f = fixture(); Object.assign(f.config, { autoComment: true, mentionName: 'Owner', pickPerRound: 5, commentPerRound: 5 })
    const original = f.invoke.getMockImplementation()!
    f.invoke.mockImplementation(async (name, args) => name === 'douyin_comment' ? { ok: false, error: 'blocked' } as never : original(name, args))
    await f.round.run()
    expect(f.invoke.mock.calls.filter(([name]) => name === 'douyin_comment')).toHaveLength(2)
    expect(f.ledger.picked()).toBe(5); expect(f.ledger.count('comment')).toBe(0)
  })
  it('waits for an active read on disposal and starts no further work', async () => {
    const f = fixture(); let release!: () => void
    f.invoke.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ ok: true, items: f.videos } as never) }))
    const running = f.round.run()
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    expect(await f.round.run()).toMatchObject({ ok: false })
    const disposing = f.round.dispose(); release(); await disposing; await running
    expect(f.ledger.picked()).toBe(0); expect(f.invoke).toHaveBeenCalledTimes(1)
    expect(await f.round.run()).toMatchObject({ ok: false, error: expect.stringContaining('卸载') })
  })
  it('stops interactive work on crossing midnight, leaving the previous day pick intact', async () => {
    const f = fixture(); Object.assign(f.config, { autoLike: true })
    const original = f.invoke.getMockImplementation()!
    f.invoke.mockImplementation(async (name, args) => { if (name === 'douyin_comments') f.clock.now = new Date(2026, 10, 4, 0); return original(name, args) })
    expect(await f.round.run()).toMatchObject({ picked: 1 })
    expect(f.ledger.picked('2026-11-03')).toBe(1); expect(f.ledger.picked()).toBe(0)
    expect(f.invoke.mock.calls.some(([name]) => name === 'douyin_like')).toBe(false)
  })
})

describe('verified social sequencing and sticker labels', () => {
  function socialFixture() {
    const f = fixture(); const events: string[] = []
    const call = vi.fn(async (name: string, _args: Record<string, unknown>) => { events.push(name); return { ok: true, verified: true } })
    const social = createSocial({ config: () => f.config, ledger: f.ledger, state: f.state, call })
    return { ...f, events, call, social }
  }
  it.each([true, false])('understands an already titled manual share before its %s model note', async (model) => {
    const f = socialFixture(); f.config.modelShareNote = model
    const generate = vi.fn(async () => '吃饭开心')
    const social = createSocial({ config: () => f.config, ledger: f.ledger, state: f.state, call: f.call, generate })
    f.call.mockImplementation(async (name) => { f.events.push(name); return name === 'douyin_watch' ? { ok: true, transcript: '美食的实际转写' } as never : { ok: true, verified: true } })
    await social.share(f.videos[0]!, 'Friend', { understand: true })
    expect(f.events).toEqual(['douyin_share_video', 'douyin_watch', 'douyin_chat_send', 'douyin_chat_sticker'])
    expect(f.call.mock.calls[2][1].text).toContain(model ? '吃饭' : '实际转写')
    expect(f.call.mock.calls[3][1].keyword).toBe('干饭')
    expect(generate).toHaveBeenCalledTimes(model ? 1 : 0)
  })
  it('keeps fixed notes, reports understanding failure, and does no understanding when notes are off', async () => {
    const f = socialFixture(); f.config.shareNote = '固定一句'
    f.call.mockImplementation(async (name) => { f.events.push(name); if (name === 'douyin_watch') throw new Error('watch failed'); return { ok: true, verified: true } })
    expect(await f.social.share(f.videos[0]!, 'Friend', { understand: true })).toMatchObject({ noteText: '固定一句', understandingError: expect.stringContaining('watch failed') })
    expect(f.call.mock.calls.find(([name]) => name === 'douyin_chat_send')![1].text).toBe('固定一句')
    f.events.length = 0; f.config.shareWithNote = false
    await f.social.share(f.videos[1]!, 'Friend', { understand: true })
    expect(f.events).toEqual(['douyin_share_video'])
  })
  it('requires a verified card before note, and a verified note before sticker', async () => {
    const f = socialFixture()
    f.call.mockResolvedValueOnce({ ok: true, verified: false })
    await f.social.share(f.videos[0]!, 'Friend'); expect(f.call).toHaveBeenCalledTimes(1)
    f.events.length = 0
    await f.social.share(f.videos[0]!, 'Friend')
    expect(f.events).toEqual(['douyin_share_video', 'douyin_chat_send', 'douyin_chat_sticker'])
    f.events.length = 0; const previous = f.call.mock.calls.length
    f.call.mockResolvedValueOnce({ ok: true, verified: true }).mockResolvedValueOnce({ ok: false, verified: false })
    await f.social.share(f.videos[0]!, 'Friend')
    expect(f.call.mock.calls.length - previous).toBe(2)
    expect(f.call.mock.calls.at(-1)![0]).toBe('douyin_chat_send')
  })
  it('requires configured outbound authorization for streak and establishes trusted sticker-only context', async () => {
    const f = socialFixture(); f.config.streakNick = 'Friend'
    expect(await f.social.streak()).toMatchObject({ skipped: expect.any(String) }); expect(f.call).not.toHaveBeenCalled()
    f.config.msgAllowTo = 'Friend'
    f.call.mockImplementation(async (name) => { expect(name).toBe('douyin_chat_sticker'); expect(currentExecution()).toMatchObject({ origin: 'timer', action: 'streak' }); return { ok: true, verified: false } })
    await f.social.streak(); expect(f.state.read()[`streak:${f.ledger.day()}`]).toBe(0)
  })
  it('updates only fixed server-owned favorites files, preserving unknown fields and bounding labels', async () => {
    const f = fixture(), stickers = createStickers(f.paths)
    writeJson(f.paths.file('favorites2.json'), { extra: true, items: [{ index: 0, key: 'stored-key', tags: ['old'], retained: true }] })
    expect(await stickers.tags({ file: '../../escape', index: 0, tags: [' happy ', 'happy', '', 'cute'] })).toEqual({ ok: true, tags: ['happy', 'cute'] })
    expect(stickers.list()).toMatchObject({ custom: [{ index: 0, key: 'stored-key', tags: ['happy', 'cute'] }] })
    expect(await stickers.tags({ index: 5, tags: [] })).toMatchObject({ ok: false })
  })
})
