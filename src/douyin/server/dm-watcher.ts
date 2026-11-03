import type { DouyinConfig } from '../config.js'
import type { Invoke } from './action-executor.js'
import { resultObject } from './content.js'
import { errorMessage } from './storage.js'

interface WatchDependencies {
  config(): DouyinConfig
  call: Invoke
  poll(reason: string): Promise<{ ok: boolean; error?: unknown }>
  busy(): boolean
  now?: () => number
  log?(message: string): void
}
export function createDmWatcher(deps: WatchDependencies) {
  const now = deps.now ?? Date.now
  const state = { mode: 'events', connected: false, lastEventAt: null as number | null, lastReconcileAt: null as number | null, error: '' }
  let disposed = false, dirty = true, backoff = 5000, timer: ReturnType<typeof setTimeout> | undefined, active: Promise<number> | undefined
  const check = async (): Promise<number> => {
    const cfg = deps.config()
    if (disposed) return 0
    if (!cfg.dmAutoReply || !cfg.msgAllowTo.trim()) {
      if (state.connected) { try { await deps.call('douyin_dm_events', { stop: true }, { timeoutMs: 5000 }) } catch { /* Disconnected already. */ } }
      state.connected = false; dirty = true
      return 10000
    }
    try {
      if (!dirty && now() - Number(state.lastReconcileAt || 0) < 120000) {
        const event = resultObject(await deps.call('douyin_dm_events', { wait_seconds: 25 }, { timeoutMs: 45000 }))
        if (!event.ok) throw new Error(String(event.error || '消息监听未连接'))
        if (disposed) return 0
        state.connected = true; state.error = ''
        if (event.changed) { dirty = true; state.lastEventAt = now() }
      }
      if (disposed) return 0
      if (dirty || now() - Number(state.lastReconcileAt || 0) >= 120000) {
        if (deps.busy() && !cfg.dmDuringHeadless) { dirty = true; return 1000 }
        dirty = false
        const result = await deps.poll('event')
        if (!result.ok) throw new Error(String(result.error || '读取私信失败'))
        if (disposed) return 0
        state.lastReconcileAt = now()
        const synced = resultObject(await deps.call('douyin_dm_events', { wait_seconds: 0.01, acknowledge: true }, { timeoutMs: 45000 }))
        if (!synced.ok) throw new Error(String(synced.error || '消息监听未连接'))
        state.connected = true; state.error = ''; backoff = 5000
        dirty = Boolean('started' in result && result.started || 'pending' in result && result.pending)
      }
      return 100
    } catch (error) {
      state.connected = false; state.error = errorMessage(error); dirty = true
      try { deps.log?.('私信事件监听：' + state.error) } catch { /* Logging cannot break retries. */ }
      const delay = backoff; backoff = Math.min(backoff * 2, 120000)
      return delay
    }
  }
  const tick = () => {
    if (active) return active
    const task = check().finally(() => { if (active === task) active = undefined })
    active = task
    return task
  }
  const schedule = (delay: number) => {
    if (disposed || timer) return
    timer = setTimeout(() => {
      timer = undefined
      void tick().then((next) => { if (!disposed) schedule(Math.max(100, next)) })
    }, delay)
    timer.unref()
  }
  const dispose = async () => {
    disposed = true
    if (timer) clearTimeout(timer)
    timer = undefined
    // Stop the page listener to release any active long poll; the MCP owner stops the process next.
    if (state.connected || active) { try { await deps.call('douyin_dm_events', { stop: true }, { timeoutMs: 5000 }) } catch { /* Process may already have stopped. */ } }
    if (active) await active
    state.connected = false
  }
  return { state, tick, start: () => schedule(100), dispose }
}
export type DmWatcher = ReturnType<typeof createDmWatcher>
