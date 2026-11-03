import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULTS } from '../../src/douyin/config.js'
import { douyinPaths } from '../../src/douyin/server/paths.js'
import { createLedger } from '../../src/douyin/server/ledger.js'
import { createRuntimeState } from '../../src/douyin/server/state.js'
import { createMemory } from '../../src/douyin/server/memory.js'
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
  const ledger = createLedger(paths, () => clock.now), state = createRuntimeState(paths, () => clock.now), memory = createMemory(paths, state, () => clock.now)
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
  const content = createContent(() => config, executor.call), social = createSocial({ config: () => config, ledger, state, memory, call: executor.call })
  const reports = createReports(paths, ledger), round = createLocalRound({ config: () => config, ledger, state, memory, reports, content, social, call: executor.call })
  return { paths, config, clock, ledger, state, memory, videos, invoke, content, social, reports, round }
}

describe('local evidence and action round', () => {
  it('uses platform millisecond duration, score, title, deduplication and daily picks', () => {
    const f = fixture()
    const data = f.ledger.read(); data.picks[`${f.ledger.day()}:100001`] = { day: f.ledger.day(), aweme_id: '100001' }; f.ledger.write(data)
    const ranked = rankVideos([...f.videos, f.videos[0]!, { aweme_id: '999999', title: 'long', duration: 4000000 }, { aweme_id: '888888', title: '' }], f.ledger, f.config)
    expect(ranked.map((video) => video.aweme_id)).toEqual(['100000', '100002', '100003', '100004'])
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
    expect(await f.round.run()).toMatchObject({ ok: true, picked: 1, notes: [expect.stringContaining('热榜')] })
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
    const social = createSocial({ config: () => f.config, ledger: f.ledger, state: f.state, memory: f.memory, call })
    return { ...f, events, call, social }
  }
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
