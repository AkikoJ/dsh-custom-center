import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface Held { key: string; active: boolean }
const held = new AsyncLocalStorage<Held>()
const queues = new Map<string, Promise<void>>()

function recoverDeadOwner(directory: string): void {
  const owner = join(directory, 'owner.json')
  const recovery = join(directory, '.recovery')
  let recovering = false
  try {
    if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) return
    const candidate = JSON.parse(readFileSync(owner, 'utf8')) as { pid?: number }
    if (!Number.isInteger(candidate.pid) || Number(candidate.pid) <= 0) return
    try { process.kill(candidate.pid!, 0); return }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return }
    // A marker inside the old directory excludes simultaneous stale-owner recovery.
    mkdirSync(recovery)
    recovering = true
    const current = JSON.parse(readFileSync(owner, 'utf8')) as { pid?: number }
    if (current.pid !== candidate.pid) return
    try { process.kill(current.pid!, 0); return }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return }
    const abandoned = `${directory}.stale-${randomUUID()}`
    renameSync(directory, abandoned)
    recovering = false
    unlinkSync(join(abandoned, 'owner.json'))
    rmdirSync(join(abandoned, '.recovery'))
    rmdirSync(abandoned)
  } catch { /* Unknown, incomplete or busy ownership is never stolen. */ }
  finally { if (recovering) { try { rmdirSync(recovery) } catch { /* Preserve ambiguity. */ } } }
}

/** Serialize account work across tools, nested rounds, instances and physical path aliases. */
export async function withActionLock<T>(home: string, task: () => Promise<T> | T, options: { timeoutMs?: number } = {}): Promise<T> {
  mkdirSync(home, { recursive: true, mode: 0o700 })
  const key = realpathSync(home)
  if (held.getStore()?.key === key && held.getStore()?.active) return task()
  const previous = queues.get(key) ?? Promise.resolve()
  let release!: () => void
  const tail = new Promise<void>((resolve) => { release = resolve })
  queues.set(key, tail)
  await previous
  const directory = join(key, '.action-lock')
  const owner = join(directory, 'owner.json')
  const identity = JSON.stringify({ pid: process.pid, token: randomUUID() })
  const token = { key, active: true }
  let acquired = false
  try {
    const deadline = Date.now() + (options.timeoutMs ?? 30000)
    while (!acquired) {
      try {
        mkdirSync(directory, { mode: 0o700 })
        try { writeFileSync(owner, identity, { flag: 'wx', mode: 0o600 }) }
        catch (error) { try { rmdirSync(directory) } catch { /* Leave incomplete ownership. */ }; throw error }
        acquired = true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        recoverDeadOwner(directory)
        if (!existsSync(directory)) continue
        if (Date.now() >= deadline) throw new Error('另一个账号任务正在运行，请稍后重试')
        await new Promise<void>((resolve) => setTimeout(resolve, 50))
      }
    }
    return await held.run(token, task)
  } finally {
    token.active = false
    if (acquired) {
      try { if (readFileSync(owner, 'utf8') === identity) { unlinkSync(owner); rmdirSync(directory) } }
      catch { /* Do not remove another owner's files. */ }
    }
    release()
    if (queues.get(key) === tail) queues.delete(key)
  }
}

export function confirmed(value: unknown): value is Record<string, unknown> & { ok: true; verified: true } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const result = value as Record<string, unknown>
  return result.ok === true && result.verified === true && !result.needLogin
}
