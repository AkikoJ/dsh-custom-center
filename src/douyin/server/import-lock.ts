import { existsSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

/** A dead importer may be recovered; ambiguous or live ownership is never stolen. */
export function acquireImportLock(file: string): () => void {
  const target = resolve(file)
  const token = randomUUID()
  const owner = JSON.stringify({ pid: process.pid, token })
  try { writeFileSync(target, owner, { flag: 'wx', mode: 0o600 }) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const recovery = target + '.recovery'
    try { mkdirSync(recovery, { mode: 0o700 }) } catch { throw new Error('Import lock recovery is already running or ambiguous') }
    try {
      const previous = readFileSync(target, 'utf8')
      let pid: number
      try { pid = JSON.parse(previous).pid } catch { throw new Error('Import lock owner is unknown') }
      if (!Number.isInteger(pid) || pid <= 0) throw new Error('Import lock owner is invalid')
      try { process.kill(pid, 0); throw new Error(`Importer is already running: ${pid}`) }
      catch (check) { if ((check as NodeJS.ErrnoException).code !== 'ESRCH') throw check }
      if (readFileSync(target, 'utf8') !== previous) throw new Error('Import lock changed during recovery')
      unlinkSync(target)
      writeFileSync(target, owner, { flag: 'wx', mode: 0o600 })
    } finally { rmdirSync(recovery) }
  }
  return () => {
    if (existsSync(target) && readFileSync(target, 'utf8') === owner) unlinkSync(target)
  }
}
