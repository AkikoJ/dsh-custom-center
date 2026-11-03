import type { DouyinConfig } from '../config.js'
import type { Ledger } from './ledger.js'
import type { RuntimeStateStore } from './state.js'
import { localDay, object } from './ledger-model.js'
import { withActionLock } from './actions.js'
import { withExecution } from './execution-context.js'
import { errorMessage } from './storage.js'

export const WINDOWS = { noon: { label: '中午谷时', start: '12:00', end: '14:00' }, night: { label: '夜间谷时', start: '00:30', end: '08:30' } } as const
export function inWindow(now: Date, window: { start: string; end: string }) {
  const minutes = (value: string) => { const [hour, minute] = value.split(':').map(Number); return hour! * 60 + minute! }
  const current = now.getHours() * 60 + now.getMinutes(), start = minutes(window.start), end = minutes(window.end)
  return start <= end ? current >= start && current < end : current >= start || current < end
}
interface SchedulerDependencies {
  config(): DouyinConfig
  ledger: Ledger
  state: RuntimeStateStore
  round(): Promise<unknown>
  streak(): Promise<unknown>
  dm(): Promise<unknown>
  reply(): Promise<unknown>
  clean(): Promise<unknown>
  persona(): unknown
  busy(): boolean
  random?: () => number
  log?(message: string): void
}
/** Owns one serialized inspection chain and drains it before disposal completes. */
export function createScheduler(deps: SchedulerDependencies) {
  const { ledger, state } = deps
  let timer: ReturnType<typeof setTimeout> | undefined, nightly: ReturnType<typeof setTimeout> | undefined
  let stopped = false, started = false, active: Promise<void> | undefined
  let lastAt: string | null = null, nextAt: string | null = null
  const safe = async (label: string, task: () => unknown) => { try { await task() } catch (error) { try { deps.log?.(`${label}失败：${errorMessage(error)}`) } catch { /* Logging is not part of task completion. */ } } }
  const windowTick = () => withActionLock(ledger.paths.root, async () => {
    const config = deps.config(), now = ledger.now(), day = localDay(now)
    if (stopped || deps.busy() || !config.peakValley || config.perDay <= 0 || ledger.picked() >= config.perDay) return
    for (const name of ['noon', 'night'] as const) {
      if (!config[name] || !inWindow(now, WINDOWS[name])) continue
      const key = `${day}:${name}`, tries = `winTries:${key}`, previous = state.read()
      // A successful window can be revisited until the shared daily pick quota is exhausted.
      if (Number(previous[tries] || 0) >= 6) return
      state.bump({ [tries]: Number(previous[tries] || 0) + 1 })
      const result = await deps.round()
      if (object(result) && result.ok !== false && (Number(result.picked) > 0 || result.skipped) && ledger.day() === day) {
        state.bump({ windows: { ...(state.read().windows || {}), [key]: true }, lastRunAt: now.toISOString(), lastWhy: `window:${name}` })
      }
      return
    }
  })
  const inspection = async () => {
    const steps: [string, () => unknown][] = [
      ['清理', deps.clean], ['人设观察更新', deps.persona], ['谷时轮次', windowTick], ['续火花', deps.streak], ['私信巡检', deps.dm],
      ['评论巡检', async () => {
        const config = deps.config(), now = ledger.now()
        if (!config.autoReply || !(config.replyAllDay || config.noon && inWindow(now, WINDOWS.noon) || config.night && inWindow(now, WINDOWS.night))) return
        await deps.reply()
      }],
    ]
    for (const [label, task] of steps) { if (stopped) return; if (!deps.busy()) await safe(label, task) }
  }
  const tick = (cleanOnly = false) => {
    if (stopped || active) return active ?? Promise.resolve()
    lastAt = ledger.now().toISOString()
    const task = withExecution({ origin: 'timer' }, cleanOnly ? () => safe('夜间清理', deps.clean) : inspection); active = task
    const clear = () => { if (active === task) active = undefined }
    void task.then(clear, clear)
    return task
  }
  const schedule = () => {
    if (stopped) return
    const base = Math.max(5, Math.min(Number(deps.config().replyIntervalMin) || 30, 1440)) * 60000
    const random = Math.max(0, Math.min(1, (deps.random ?? Math.random)()))
    const delay = base * (0.8 + random * 0.4)
    nextAt = new Date(ledger.now().getTime() + delay).toISOString()
    timer = setTimeout(() => { nextAt = null; void safe('巡检', tick).then(schedule) }, delay); timer.unref?.()
  }
  const scheduleNightly = () => {
    if (stopped) return
    nightly = setTimeout(() => {
      const task = !active && !deps.busy() && ledger.now().getHours() >= 3 ? tick(true) : Promise.resolve()
      void safe('夜间巡检', () => task).then(scheduleNightly)
    }, 30 * 60000); nightly.unref?.()
  }
  const start = () => { if (started || stopped) return; started = true; schedule(); scheduleNightly() }
  const dispose = async () => { stopped = true; clearTimeout(timer); clearTimeout(nightly); nextAt = null; await active }
  return { start, tick, windowTick, dispose, status: () => ({ lastAt, nextAt, busy: !!active }) }
}
export type Scheduler = ReturnType<typeof createScheduler>
