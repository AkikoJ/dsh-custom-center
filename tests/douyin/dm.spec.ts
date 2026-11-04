import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULTS } from '../../src/douyin/config.js'
import { douyinPaths } from '../../src/douyin/server/paths.js'
import { createLedger } from '../../src/douyin/server/ledger.js'
import { createReplyHistory } from '../../src/douyin/server/reply-history.js'
import { createActionExecutor } from '../../src/douyin/server/action-executor.js'
import { createMemory } from '../../src/douyin/server/memory.js'
import { createRuntimeState } from '../../src/douyin/server/state.js'
import { createReports } from '../../src/douyin/server/reports.js'
import { createDmHistory, type DmRecord } from '../../src/douyin/server/dm-history.js'
import { createSharedMemory } from '../../src/douyin/server/shared-memory.js'
import { createDm } from '../../src/douyin/server/dm.js'
import { createDmWatcher } from '../../src/douyin/server/dm-watcher.js'
import { latestInbound } from '../../src/douyin/server/dm-reply.js'
import type { TaskOptions } from '../../src/douyin/server/task-contract.js'

const roots: string[] = []
afterEach(() => { vi.useRealTimers(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'douyin-dm-')); roots.push(root)
  const paths = douyinPaths(root), cfg = { ...DEFAULTS, msgAllowTo: 'Friend', dmReply: true, replyRandom: false }
  let date = new Date(2026, 10, 3, 12), rows: Record<string, unknown>[] = [{ messageId: 'm1', direction: 'inbound', text: '在吗', name: 'Friend', peerId: 'peer' }]
  let verified = true
  const shared = { context: '共享角色上下文 SHARED-CONTEXT', recent: '共享最近记录 SHARED-RECENT', failContext: false, failRecent: false, failWrite: false }
  const ledger = createLedger(paths, () => date), history = createDmHistory(paths, () => date)
  const invoke = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'memory_context') { if (shared.failContext) throw new Error('context offline'); return { ok: true, context: shared.context } }
    if (name === 'memory_recent') { if (shared.failRecent) throw new Error('recent offline'); return { ok: true, items: shared.recent ? [{ content: shared.recent }] : [] } }
    if (name === 'memory_write' && shared.failWrite) throw new Error('write offline')
    if (name === 'douyin_dm_snapshot' || name === 'douyin_inbox') return { ok: true, items: rows }
    if (name === 'douyin_chat_send') return verified ? { ok: true, verified: true } : { ok: true, verified: false }
    return { ok: true }
  })
  const executor = createActionExecutor({ config: () => cfg, ledger, history: createReplyHistory(paths, ledger), invoke, ownedVideoIds: async () => [] })
  const generate = vi.fn(async (_system: string, _user: string) => '在呢[憨笑]'), run = vi.fn(async (_reason: string, _options?: TaskOptions) => ({ ok: true, started: true }))
  const sharedMemory = createSharedMemory(executor.call)
  const memory = createMemory(paths, createRuntimeState(paths), () => date, sharedMemory.writeDm)
  const dm = createDm({ config: () => cfg, ledger, history, memory, reports: createReports(paths, ledger), call: executor.call, generate, run, busy: () => false, sharedMemory: sharedMemory.context })
  return { shared, root, paths, cfg, ledger, history, invoke, executor, generate, run, memory, dm, setRows: (value: typeof rows) => { rows = value }, setVerified: (value: boolean) => { verified = value }, setDate: (value: Date) => { date = value } }
}

describe('persistent direct-message history', () => {
  it.each(['context', 'recent', 'local'] as const)('uses distinct %s memory fixtures for fast replies', async (source) => {
    const f = fixture(); f.memory.append('本地专用记录 LOCAL-ONLY'); f.memory.savePersona('人工本地人设 LOCAL-PERSONA')
    if (source !== 'context') f.shared.failContext = true
    if (source === 'local') f.shared.failRecent = true
    expect(await f.dm.poll()).toMatchObject({ replied: 1 })
    const prompt = f.generate.mock.calls[0][0]
    expect(prompt).toContain('LOCAL-PERSONA')
    expect(prompt).toContain(source === 'context' ? 'SHARED-CONTEXT' : source === 'recent' ? 'SHARED-RECENT' : 'LOCAL-ONLY')
    if (source !== 'local') expect(prompt).not.toContain('LOCAL-ONLY')
    expect(f.invoke.mock.calls.filter(([name]) => name === 'memory_write').map(([, args]) => args.content)).toEqual(['主人: 在吗（私信 · Friend）', '大肥鱼: 在呢[憨笑]（私信 · Friend）'])
  })
  it.each(['', '  \n  '])('falls back on empty shared results %j and never writes unconfirmed sends', async (empty) => {
    const f = fixture(); f.shared.context = empty; f.shared.recent = empty; f.memory.append('LOCAL-EMPTY-FALLBACK'); f.setVerified(false)
    expect(await f.dm.poll()).toMatchObject({ replied: 0 })
    expect(f.generate.mock.calls[0][0]).toContain('LOCAL-EMPTY-FALLBACK')
    expect(f.invoke.mock.calls.filter(([name]) => name === 'memory_write')).toHaveLength(0)
  })
  it('keeps the confirmed receipt and local record when shared writes fail', async () => {
    const f = fixture(); f.shared.failWrite = true
    expect(await f.dm.poll()).toMatchObject({ replied: 1 })
    expect(f.memory.read().join('')).toContain('在呢')
    expect(f.invoke.mock.calls.filter(([name]) => name === 'memory_write')).toHaveLength(2)
  })
  it('keeps the cursor after daily logs age out and clearing seen does not remove send deduplication', () => {
    const f = fixture(), entry: DmRecord = { day: f.ledger.day(), name: 'Friend', text: 'hi', key: 'key', messageId: 'm', kind: 'text', at: Date.now(), status: 'unknown', replied: false, tries: 1 }
    f.history.put(entry)
    f.setDate(new Date(2026, 10, 12, 12))
    expect(f.history.read()).toEqual([])
    expect(f.history.prior('Friend', 'key')).toMatchObject({ status: 'unknown' })
    f.history.clearSeen()
    expect(f.history.prior('Friend', 'key')).toMatchObject({ status: 'unknown' })
  })
  it('rejects corrupt cursor or log state before a reply starts', async () => {
    const f = fixture(); mkdirSync(join(f.root, 'state'), { recursive: true }); writeFileSync(f.paths.file('dm-cursors.json'), '{broken')
    expect(await f.dm.poll()).toMatchObject({ ok: false, error: expect.stringContaining('损坏') })
    expect(f.generate).not.toHaveBeenCalled(); expect(f.invoke.mock.calls.filter(([name]) => name === 'douyin_chat_send')).toHaveLength(0)
  })
})

describe('latest inbound selection', () => {
  it('does not reply to outgoing, unknown or echoed own messages and does not use avatars as identity', () => {
    const inbound = { messageId: 'm1', direction: 'inbound', text: '你好', avatar: 'same' }
    expect(latestInbound([inbound, { ...inbound, messageId: 'm2', direction: 'outbound' }], [])).toBeNull()
    expect(latestInbound([inbound, { ...inbound, messageId: 'm2', direction: 'unknown' }], [])).toBeNull()
    expect(latestInbound([inbound], ['你好[微笑]'])).toBeNull()
    expect(latestInbound([inbound], [])).toMatchObject({ messageId: 'm1' })
  })
  it('replaces reused DOM row indexes with occurrence identities', () => {
    const row = { messageId: 'idx:0', direction: 'inbound', text: 'hi' }
    expect(latestInbound([row], [])?.messageId).toBe('occ:inbound:hi:1')
    expect(latestInbound([row, row], [])?.messageId).toBe('occ:inbound:hi:2')
  })
})

describe('direct-message reply orchestration', () => {
  it('fast replies to a whitelisted inbound message once and records only a verified receipt', async () => {
    const f = fixture(); f.cfg.dmReply = false
    expect(await f.dm.poll()).toMatchObject({ ok: true, replied: 1, fast: true })
    expect(f.history.read()).toMatchObject([{ status: 'sent', replied: true, replyText: '在呢[憨笑]' }])
    expect(f.memory.read().join('\n')).toContain('在呢[憨笑]')
    expect(await f.dm.poll()).toMatchObject({ replied: 0 })
    expect(f.invoke.mock.calls.filter(([name]) => name === 'douyin_chat_send')).toHaveLength(1)
  })
  it('holds uncertain sends across restarts instead of retrying or recording successful memory', async () => {
    const f = fixture(); f.setVerified(false)
    expect(await f.dm.poll()).toMatchObject({ ok: false, replied: 0 })
    expect(f.history.read()).toMatchObject([{ status: 'unknown', replied: false }])
    expect(f.memory.read()).toEqual([])
    expect(await f.dm.poll()).toMatchObject({ replied: 0 })
    expect(f.invoke.mock.calls.filter(([name]) => name === 'douyin_chat_send')).toHaveLength(1)
  })
  it('passes videos to a recipient-confined task and waits for its verified reply outcome', async () => {
    const f = fixture(); f.setRows([{ messageId: 'video-m', direction: 'inbound', awemeId: '123456', kind: 'video' }])
    expect(await f.dm.poll()).toMatchObject({ started: true, pending: true, replied: 0 })
    const options = f.run.mock.calls[0][1]!
    expect(options.recipient).toBe('Friend'); expect(options.prompt).toContain('123456')
    expect(f.generate).not.toHaveBeenCalled(); expect(f.history.read()[0].replied).toBe(false)
    await options.onFinish?.({ code: 0 })
    expect(f.history.read()[0]).toMatchObject({ status: 'unknown', replied: false })
    expect(f.invoke.mock.calls.filter(([name]) => name === 'memory_write')).toHaveLength(0)
  })
  it('accepts a matching task receipt only once and rejects a different recipient', async () => {
    const f = fixture(); f.cfg.dmFastReply = false
    await f.dm.poll(); const done = f.run.mock.calls[0][1]!.onFinish!
    await done({ code: 0, lastReply: { nickname: 'Other', text: 'wrong' } })
    expect(f.history.read()[0]).toMatchObject({ replied: false, status: 'unknown' })
    await done({ code: 0, lastReply: { nickname: 'Friend', text: 'late' } })
    expect(f.history.read()[0].replied).toBe(false)
    expect(f.memory.read()).toEqual([])
  })
  it('writes both sides to shared memory once after a verified headless reply', async () => {
    const f = fixture(); f.cfg.dmFastReply = false; f.cfg.memory = false
    await f.dm.poll(); const done = f.run.mock.calls[0][1]!.onFinish!
    expect(f.invoke.mock.calls.filter(([name]) => name === 'memory_write')).toHaveLength(0)
    await done({ code: 0, lastReply: { nickname: 'Friend', text: 'confirmed headless' } })
    expect(f.history.read()[0].replied).toBe(true)
    expect(f.invoke.mock.calls.filter(([name]) => name === 'memory_write')).toHaveLength(2)
    await done({ code: 0, lastReply: { nickname: 'Friend', text: 'confirmed headless' } })
    expect(f.invoke.mock.calls.filter(([name]) => name === 'memory_write')).toHaveLength(2)
  })
  it('enforces contact and daily quotas for incoming strangers through the shared executor', async () => {
    const f = fixture(); f.cfg.msgAllowTo = ''; f.cfg.dmReplyPerDay = 1
    f.setRows([{ messageId: 's1', direction: 'inbound', preview: '你好', name: 'Stranger', peerId: 's' }, { messageId: 's2', direction: 'inbound', preview: '在吗', name: 'Other', peerId: 'o' }])
    expect(await f.dm.round()).toMatchObject({ replied: 1, usedToday: 1 })
    expect(await f.dm.round()).toMatchObject({ replied: 0 })
    expect(f.invoke.mock.calls.filter(([name]) => name === 'douyin_chat_send')).toHaveLength(1)
    expect(f.ledger.read().dm.s).toMatchObject({ lastMessageId: 's1', count: 1 })
  })
  it('does no browser work with disabled automation or no whitelist intersection', async () => {
    const f = fixture(); f.cfg.dmAutoReply = false
    expect(await f.dm.poll()).toMatchObject({ skipped: expect.any(String) })
    f.cfg.dmAutoReply = true; f.cfg.dmReplyOnlyTo = 'Other'
    expect(await f.dm.poll()).toMatchObject({ replied: 0 })
    expect(f.invoke).not.toHaveBeenCalled()
  })
})

describe('direct-message event watcher', () => {
  it('does no remote reads while disabled, reconciles once, and acknowledges its own changes', async () => {
    const cfg = { ...DEFAULTS, msgAllowTo: '' }, call = vi.fn(async () => ({ ok: true, changed: false })), poll = vi.fn(async () => ({ ok: true }))
    const watcher = createDmWatcher({ config: () => cfg, call, poll, busy: () => false })
    expect(await watcher.tick()).toBe(10000); expect(call).not.toHaveBeenCalled()
    cfg.msgAllowTo = 'Friend'
    await watcher.tick(); expect(poll).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenLastCalledWith('douyin_dm_events', { wait_seconds: 0.01, acknowledge: true }, { timeoutMs: 45000 })
    await watcher.tick(); expect(poll).toHaveBeenCalledTimes(1)
    await watcher.dispose(); expect(watcher.state.connected).toBe(false)
  })
  it('retains dirty state while busy and retries failures with bounded backoff', async () => {
    const cfg = { ...DEFAULTS, msgAllowTo: 'Friend', dmDuringHeadless: false }, poll = vi.fn(async () => ({ ok: false, error: 'offline' }))
    let busy = true
    const watcher = createDmWatcher({ config: () => cfg, call: async () => ({ ok: true }), poll, busy: () => busy })
    expect(await watcher.tick()).toBe(1000); expect(poll).not.toHaveBeenCalled()
    busy = false
    expect(await watcher.tick()).toBe(5000); expect(await watcher.tick()).toBe(10000)
    expect(watcher.state).toMatchObject({ connected: false, error: 'offline' })
    await watcher.dispose()
  })
})
