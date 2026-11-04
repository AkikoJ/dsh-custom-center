import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const hooks = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0, effects: [] as (() => void)[], pending: [] as (() => void)[] }))
vi.mock('react', () => ({
 useState(initial: unknown) { const slot = hooks.cursor++; if (!(slot in hooks.cells)) hooks.cells[slot] = initial; return [hooks.cells[slot], (value: unknown) => { hooks.cells[slot] = typeof value === 'function' ? value(hooks.cells[slot]) : value }] },
 useRef(initial: unknown) { const slot = hooks.cursor++; if (!(slot in hooks.cells)) hooks.cells[slot] = { current: initial }; return hooks.cells[slot] },
 useCallback(fn: unknown) { return fn },
 useEffect(effect: () => (() => void) | void, deps: unknown[]) { const slot = hooks.cursor++, old = hooks.cells[slot] as unknown[] | undefined; if (old && old.length === deps.length && old.every((value, i) => Object.is(value, deps[i]))) return; hooks.cells[slot] = deps; hooks.pending.push(() => { const cleanup = effect(); if (cleanup) hooks.effects.push(cleanup) }) },
}))
import { useActions, useConfiguration } from '../../src/douyin/client/state.js'
function render<T>(hook: () => T) { hooks.cursor = 0; const result = hook(); for (const effect of hooks.pending.splice(0)) effect(); return result }
const settle = async () => { await new Promise<void>((resolve) => setImmediate(resolve)) }
beforeEach(() => { hooks.cells = []; hooks.cursor = 0; hooks.effects = []; hooks.pending = [] })
afterEach(() => { for (const dispose of hooks.effects.splice(0)) dispose(); vi.unstubAllGlobals() })
describe('configuration and action lifecycle', () => {
 it('retains structured failed self-check details while returning failure to save and sign-in callers', async () => {
   const result = { ok: false, error: 'missing runtime', items: [{ name: 'Python', ok: false, fix: 'Install runtime' }] }
   vi.stubGlobal('fetch', vi.fn(async () => Response.json(result)))
   const action = render(useActions); expect(await action.run('/selfcheck', {})).toBeNull()
   expect(render(useActions)).toMatchObject({ busy: '', error: 'missing runtime', result })
 })
 it('aborts active work on page exit and suppresses late state and successful callbacks', async () => {
   let release!: (response: Response) => void, signal!: AbortSignal
   vi.stubGlobal('fetch', vi.fn((_url, options) => { signal = options.signal; return new Promise<Response>((resolve) => { release = resolve }) }))
   const action = render(useActions), task = action.run('/login/poll', {})
   expect(await action.run('/run', {})).toBeNull()
   for (const dispose of hooks.effects.splice(0)) dispose()
   expect(signal.aborted).toBe(true); release(Response.json({ ok: true, loggedIn: true }))
   expect(await task).toBeNull(); expect(render(useActions).result).toBeNull()
 })
 it('keeps failed drafts and preserves edits made during an in-flight successful save', async () => {
   const saved = { replyPerRun: 2, reportLevel: 'full' }
   let release: ((response: Response) => void) | undefined
   const fetcher = vi.fn(async (_url: string, options: RequestInit) => options.method === 'GET' ? Response.json({ ok: true, config: saved }) : Response.json({ ok: false, error: 'disk full' }))
   vi.stubGlobal('fetch', fetcher); render(useConfiguration); await settle(); render(useConfiguration)
   let config = render(useConfiguration); config.set('replyPerRun', 7); config = render(useConfiguration)
   await config.save(); expect(render(useConfiguration)).toMatchObject({ dirty: true, draft: { replyPerRun: 7 }, error: 'disk full' })
   fetcher.mockImplementation(async () => new Promise<Response>((resolve) => { release = resolve }))
   config = render(useConfiguration); const task = config.save(); config.set('replyPerRun', 9)
   release!(Response.json({ ok: true, config: { ...saved, replyPerRun: 7 } })); await task
   expect(render(useConfiguration)).toMatchObject({ dirty: true, draft: { replyPerRun: 9 } })
 })
})
