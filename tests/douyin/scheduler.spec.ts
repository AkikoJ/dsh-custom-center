import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULTS } from '../../src/douyin/config.js'
import { douyinPaths } from '../../src/douyin/server/paths.js'
import { createLedger } from '../../src/douyin/server/ledger.js'
import { createRuntimeState } from '../../src/douyin/server/state.js'
import { createScheduler, inWindow, WINDOWS } from '../../src/douyin/server/scheduler.js'
import { nextWindowInfo } from '../../src/douyin/server/status.js'
import { currentExecution } from '../../src/douyin/server/execution-context.js'

const roots: string[] = []
afterEach(() => { vi.useRealTimers(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'douyin-scheduler-')); roots.push(root)
  const paths = douyinPaths(root), config = { ...DEFAULTS }, clock = { now: new Date(2026, 10, 3, 12) }
  const ledger = createLedger(paths, () => clock.now), state = createRuntimeState(paths, () => clock.now), events: string[] = []
  const step = (name: string) => vi.fn(async () => { events.push(name); expect(currentExecution().origin).toBe('timer') })
  const deps = { config: () => config, ledger, state, round: vi.fn(async () => { events.push('round'); return { ok: true, picked: 1 } }), streak: step('streak'), dm: step('dm'), reply: step('reply'), clean: step('clean'), persona: step('persona'), busy: () => false, random: () => 0, log: vi.fn() }
  const scheduler = createScheduler(deps)
  return { config, clock, ledger, state, events, deps, scheduler }
}

describe('owned inspection scheduler', () => {
  it('uses half-open local windows including crossing midnight and disabled next-window flags', () => {
    expect(inWindow(new Date(2026, 10, 3, 12), WINDOWS.noon)).toBe(true)
    expect(inWindow(new Date(2026, 10, 3, 14), WINDOWS.noon)).toBe(false)
    expect(inWindow(new Date(2026, 10, 3, 23), { start: '22:00', end: '02:00' })).toBe(true)
    expect(inWindow(new Date(2026, 10, 3, 1), { start: '22:00', end: '02:00' })).toBe(true)
    expect(nextWindowInfo(new Date(2026, 10, 3, 14), DEFAULTS)).toBe(null)
    const next = nextWindowInfo(new Date(2026, 10, 3, 14), { ...DEFAULTS, peakValley: true, night: false })!
    expect(next.name).toBe('noon'); expect(new Date(next.at).getDate()).toBe(4)
  })
  it('keeps the inspection sequence, catches individual failures and respects reply gates', async () => {
    const f = fixture(); f.config.autoReply = true
    f.deps.clean.mockImplementationOnce(async () => { f.events.push('clean'); throw new Error('temporary') })
    await f.scheduler.tick()
    expect(f.events).toEqual(['clean', 'persona', 'streak', 'dm', 'reply'])
    expect(f.deps.log).toHaveBeenCalledWith(expect.stringContaining('temporary'))
    f.events.length = 0; f.config.replyAllDay = false; f.clock.now = new Date(2026, 10, 3, 15)
    await f.scheduler.tick(); expect(f.events).not.toContain('reply')
    await f.scheduler.dispose()
  })
  it('caps each window at six attempts, marks only success and resets attempts on a new day', async () => {
    const f = fixture(); f.config.peakValley = true
    f.deps.round.mockResolvedValue({ ok: false, picked: 0 })
    for (let index = 0; index < 8; index++) await f.scheduler.tick()
    expect(f.deps.round).toHaveBeenCalledTimes(6); expect(f.state.read().windows).toEqual({})
    f.clock.now = new Date(2026, 10, 4, 12); f.deps.round.mockResolvedValue({ ok: true, picked: 1 })
    await f.scheduler.tick()
    expect(f.deps.round).toHaveBeenCalledTimes(7)
    expect(f.state.read().windows).toEqual({ '2026-11-04:noon': true })
    const data = f.ledger.read(); data.pickFloor[f.ledger.day()] = f.config.perDay; f.ledger.write(data)
    await f.scheduler.tick(); expect(f.deps.round).toHaveBeenCalledTimes(7)
    await f.scheduler.dispose()
  })
  it('serializes concurrent ticks and waits for the current step before stopping', async () => {
    const f = fixture(); let release!: () => void
    f.deps.clean.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    const first = f.scheduler.tick(), second = f.scheduler.tick()
    expect(first).toBe(second); expect(f.scheduler.status().busy).toBe(true)
    const disposing = f.scheduler.dispose(); release(); await disposing
    expect(f.deps.persona).not.toHaveBeenCalled(); expect(f.deps.streak).not.toHaveBeenCalled()
    await f.scheduler.tick(); expect(f.deps.clean).toHaveBeenCalledTimes(1)
  })
  it('applies interval jitter and runs only cleanup from the independent nightly timer', async () => {
    vi.useFakeTimers()
    const f = fixture(); f.config.replyIntervalMin = 60
    f.scheduler.start(); f.scheduler.start()
    expect(f.scheduler.status().nextAt).toBe(new Date(f.clock.now.getTime() + 48 * 60000).toISOString())
    await vi.advanceTimersByTimeAsync(30 * 60000)
    expect(f.events).toEqual(['clean'])
    await vi.advanceTimersByTimeAsync(18 * 60000)
    expect(f.events).toEqual(['clean', 'clean', 'persona', 'streak', 'dm'])
    await f.scheduler.dispose(); expect(vi.getTimerCount()).toBe(0)
  })
})
