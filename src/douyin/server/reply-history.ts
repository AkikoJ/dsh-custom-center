import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Ledger } from './ledger.js'
import type { DouyinPaths } from './paths.js'
import { readRequiredObject } from './storage.js'
import { object } from './ledger-model.js'

export function createReplyHistory(paths: DouyinPaths, ledger: Ledger) {
  const cidFile = paths.file('replied-cids.txt')
  const userFile = paths.file('replied-users.txt')
  const read = (file: string) => new Set(existsSync(file) ? readFileSync(file, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean) : [])
  const append = (file: string, value: string) => {
    const clean = value.trim()
    if (!clean || /[\r\n]/.test(clean)) return
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    appendFileSync(file, clean + '\n', { mode: 0o600 })
  }
  const ensureIndex = () => {
    const data = ledger.read()
    if (data.replyIndexMigrated) return
    const cids = read(cidFile), users = read(userFile)
    const collect = (records: Record<string, unknown>) => {
      for (const [cid, record] of Object.entries(records)) {
        if (!object(record)) throw new Error('归档回复记录无效')
        cids.add(cid)
        if (typeof record.user === 'string' && record.user.trim()) users.add(record.user.trim())
      }
    }
    collect(data.replies)
    const base = paths.file('ledger')
    const directories = (path: string, pattern: RegExp) => existsSync(path)
      ? readdirSync(path, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && pattern.test(entry.name)).map((entry) => entry.name) : []
    for (const year of directories(base, /^\d{4}$/)) for (const month of directories(join(base, year), /^\d{2}$/)) {
      const folder = join(base, year, month)
      for (const file of readdirSync(folder).filter((name) => /^\d{2}\.json$/.test(name))) {
        const archived = readRequiredObject(join(folder, file))
        if (archived.replies !== undefined && !object(archived.replies)) throw new Error('归档回复字段无效')
        collect(archived.replies as Record<string, unknown> ?? {})
      }
    }
    const oldCids = read(cidFile), oldUsers = read(userFile)
    for (const cid of cids) if (!oldCids.has(cid)) append(cidFile, cid)
    for (const user of users) if (!oldUsers.has(user)) append(userFile, user)
    data.replyIndexMigrated = true
    ledger.write(data)
  }
  const cids = () => { ensureIndex(); return new Set([...read(cidFile), ...Object.keys(ledger.read().replies)]) }
  const users = () => { ensureIndex(); return new Set([...read(userFile), ...Object.values(ledger.read().replies).map((record) => String(record.user || '')).filter(Boolean)]) }
  const mark = (cid: string, user = '') => {
    ensureIndex()
    if (!read(cidFile).has(cid)) append(cidFile, cid)
    if (user && !read(userFile).has(user)) append(userFile, user)
  }
  return { cids, users, mark, ensureIndex }
}
export type ReplyHistory = ReturnType<typeof createReplyHistory>
