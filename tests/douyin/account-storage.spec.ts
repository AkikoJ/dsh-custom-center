import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withActionLock } from '../../src/douyin/server/actions.js'
import { createActionProxy } from '../../src/douyin/server/action-proxy.js'
import { createLedger } from '../../src/douyin/server/ledger.js'
import { createRuntimeState } from '../../src/douyin/server/state.js'
import { createReplyHistory } from '../../src/douyin/server/reply-history.js'
import { douyinPaths } from '../../src/douyin/server/paths.js'
import { writeJson } from '../../src/douyin/server/storage.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function temporary() { const root = mkdtempSync(join(tmpdir(), 'douyin-account-')); roots.push(root); return root }

describe('account lock ownership', () => {
  it('is reentrant across physical path aliases and releases after failed work', async () => {
    const root = temporary(), alias = join(root, 'alias')
    symlinkSync(root, alias, 'dir')
    const events: string[] = []
    const first = withActionLock(root, async () => {
      events.push('first')
      await withActionLock(alias, () => { events.push('nested') })
      throw new Error('failed task')
    })
    const second = withActionLock(alias, () => { events.push('second'); return 42 })
    const [failure, success] = await Promise.allSettled([first, second])
    expect(failure.status).toBe('rejected'); expect(success).toMatchObject({ status: 'fulfilled', value: 42 })
    expect(events).toEqual(['first', 'nested', 'second'])
    expect(existsSync(join(root, '.action-lock'))).toBe(false)
  })

  it('recovers only an unambiguously dead owner', async () => {
    const root = temporary(), lock = join(root, '.action-lock')
    mkdirSync(lock); writeJson(join(lock, 'owner.json'), { pid: 1073741823, token: 'old' })
    expect(await withActionLock(root, () => 'done')).toBe('done')
    expect(readdirSync(root)).toEqual([])
  })

  it('does not steal a live, malformed or interrupted-recovery lock', async () => {
    for (const mode of ['live', 'unknown', 'recovering']) {
      const root = temporary(), lock = join(root, '.action-lock')
      mkdirSync(lock)
      const owner = join(lock, 'owner.json')
      writeFileSync(owner, mode === 'unknown' ? '{bad' : JSON.stringify({ pid: mode === 'live' ? process.pid : 1073741823, token: mode }))
      if (mode === 'recovering') mkdirSync(join(lock, '.recovery'))
      const before = readFileSync(owner, 'utf8')
      await expect(withActionLock(root, () => { throw new Error('must not run') }, { timeoutMs: 1 })).rejects.toThrow('另一个账号任务')
      expect(readFileSync(owner, 'utf8')).toBe(before)
    }
  })

  it('never removes a replacement owner during release', async () => {
    const root = temporary(), file = join(root, '.action-lock', 'owner.json')
    await withActionLock(root, () => writeJson(file, { pid: process.pid, token: 'replacement' }))
    expect(JSON.parse(readFileSync(file, 'utf8')).token).toBe('replacement')
  })
})

describe('ledger and permanent reply history', () => {
  it('migrates legacy report picks while excluding fenced examples and respecting prior floors', () => {
    const paths = douyinPaths(temporary())
    mkdirSync(paths.reports)
    writeFileSync(join(paths.reports, '2026-11-03.md'), '### 111111\n```\n### 222222\n```\n### 333333\n')
    writeJson(paths.state, { day: '2026-11-03', picked: 4 })
    const ledger = createLedger(paths, () => new Date('2026-11-03T12:00:00'))
    expect(Object.keys(ledger.read().picks)).toEqual(['2026-11-03:111111', '2026-11-03:333333'])
    expect(ledger.picked()).toBe(4)
    expect(ledger.watched()).toBe(0)
    const data = ledger.read(); data.picks['2026-11-03:111111'].watched = true; ledger.write(data)
    expect(ledger.watched()).toBe(1)
  })

  it('merges day archives idempotently and reconstructs indexes from imported history', () => {
    const paths = douyinPaths(temporary())
    const ledger = createLedger(paths, () => new Date('2026-11-03T12:00:00'))
    const data = ledger.read()
    data.replies['123456'] = { day: '2026-11-02', user: 'friend', ok: true }
    data.comments.push({ day: '2026-11-02', aweme_id: '111111', text: 'old' })
    ledger.write(data)
    writeJson(ledger.archivePath('2026-11-02'), { replies: { '654321': { day: '2026-11-02', user: 'other', ok: true } }, comments: [] })
    ledger.prune(); ledger.prune()
    const archive = JSON.parse(readFileSync(ledger.archivePath('2026-11-02'), 'utf8'))
    expect(new Set(Object.keys(archive.replies))).toEqual(new Set(['654321', '123456']))
    expect(archive.comments).toHaveLength(1)
    expect(ledger.read().replies).toEqual({})
    const history = createReplyHistory(paths, ledger)
    expect(history.cids()).toEqual(new Set(['654321', '123456']))
    expect(history.users()).toEqual(new Set(['other', 'friend']))
    history.ensureIndex()
    expect(readFileSync(paths.file('replied-cids.txt'), 'utf8').trim().split('\n')).toHaveLength(2)
  })

  it('retains unknown fields but refuses malformed collections and unsafe archive dates', () => {
    const paths = douyinPaths(temporary()), ledger = createLedger(paths)
    writeJson(paths.ledger, { extra: { old: true }, replies: {} })
    expect(ledger.read().extra).toEqual({ old: true })
    for (const invalid of [{ replies: [] }, { actions: { key: { status: 'invented' } } }, { pickFloor: { today: 'invalid' } }]) {
      writeJson(paths.ledger, invalid)
      expect(() => ledger.read()).toThrow('账本')
    }
    expect(() => ledger.archivePath('../../outside')).toThrow('日期')
  })

  it('preserves login state while resetting day-scoped counters at the next write', () => {
    const paths = douyinPaths(temporary())
    const store = createRuntimeState(paths, () => new Date('2026-11-03T12:00:00'))
    writeJson(paths.state, { day: '2026-11-02', count: 3, picked: 4, windows: { night: true }, loggedIn: true, nickname: 'self' })
    expect(store.roundsToday()).toBe(0)
    expect(store.hasLogin()).toBe(true)
    expect(store.bump({ phase: 'ready' })).toMatchObject({ day: '2026-11-03', count: 0, picked: 0, windows: {}, loggedIn: true, nickname: 'self' })
  })
})

describe('headless loopback action proxy', () => {
  it('requires the ephemeral credential, rechecks tools and removes authorization-shaped payload fields', async () => {
    const allowed = new Set(['douyin_like'])
    const execute = vi.fn(async () => ({ ok: true }))
    const proxy = await createActionProxy({ allowed: () => allowed, execute })
    const body = '{"name":"douyin_like","args":{"aweme_id":"111111","force":true,"constructor":"x","__proto__":{"polluted":true}}}'
    try {
      expect((await fetch(proxy.url, { method: 'POST', body })).status).toBe(403)
      const headers = { authorization: `Bearer ${proxy.token}` }
      expect((await fetch(proxy.url, { headers })).status).toBe(404)
      expect((await fetch(proxy.url, { method: 'POST', headers, body })).status).toBe(200)
      expect(execute).toHaveBeenCalledWith('douyin_like', { aweme_id: '111111' })
      expect({}).not.toHaveProperty('polluted')
      allowed.clear()
      expect((await fetch(proxy.url, { method: 'POST', headers, body })).status).toBe(403)
      expect(execute).toHaveBeenCalledTimes(1)
    } finally { await proxy.close(); await proxy.close() }
  })

  it('rejects oversized or non-object arguments before execution', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    const proxy = await createActionProxy({ allowed: () => new Set(['douyin_like']), execute })
    const headers = { authorization: `Bearer ${proxy.token}` }
    try {
      const malformed = await fetch(proxy.url, { method: 'POST', headers, body: JSON.stringify({ name: 'douyin_like', args: [] }) })
      expect(malformed.status).toBe(400)
      const oversized = await fetch(proxy.url, { method: 'POST', headers, body: JSON.stringify({ name: 'douyin_like', args: { text: 'x'.repeat(70000) } }) })
      expect(oversized.status).toBe(413)
      expect(execute).not.toHaveBeenCalled()
    } finally { await proxy.close() }
  })
})
