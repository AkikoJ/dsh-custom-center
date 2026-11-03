import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { DouyinPaths } from './paths.js'
import { within } from './paths.js'
import { withActionLock } from './actions.js'
import type { RuntimeStateStore } from './state.js'
import { localDay, object } from './ledger-model.js'
import { readJson, writeJson } from './storage.js'

/** Removal accepts only physical descendants of roots owned by this runtime. */
export function createCleanup(paths: DouyinPaths, busy: () => boolean, state: RuntimeStateStore) {
  const run = (options: { thumbDays?: number; reportDays?: number } = {}) => withActionLock(paths.root, () => {
    if (busy()) return { ok: true, skipped: '浏览器或后台任务仍在运行', cleaned: 0, items: [] }
    const items: string[] = [], now = Date.now()
    const remove = (root: string, candidate: string, recursive = false) => {
      const absolute = resolve(candidate)
      if (!within(root, absolute) || absolute === resolve(root)) return false
      try {
        const physicalHome = realpathSync(paths.root), physicalRoot = realpathSync(root)
        if (!within(physicalHome, physicalRoot) || lstatSync(absolute).isSymbolicLink() || !within(physicalRoot, realpathSync(absolute))) return false
        rmSync(absolute, { force: true, recursive }); items.push(`删除 ${absolute.slice(root.length + 1)}`); return true
      } catch { return false }
    }
    const drop = (root: string, days: number, filter: (name: string) => boolean = () => true) => {
      if (!existsSync(root)) return
      for (const name of readdirSync(root)) {
        const path = join(root, name)
        try {
          const stat = lstatSync(path)
          if (!stat.isFile() || !filter(name)) continue
          if (days === 0 || now - stat.mtimeMs > days * 86400000) remove(root, path)
        } catch { /* A concurrent removal does not stop cleanup. */ }
      }
    }
    for (const [name, days] of [['.tmp', 0], ['shots', 7], ['stickers', 0], ['sticker-cache', 0]] as const) drop(paths.file(name), days)
    drop(paths.file('media'), 0, (name) => !name.endsWith('.json'))
    drop(join(paths.file('media'), 'lab'), 0)
    drop(paths.file('thumbs'), Math.max(0, options.thumbDays ?? 30))
    drop(paths.reports, Math.max(0, options.reportDays ?? 120), (name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    const attachments = readJson<Record<string, unknown>>(paths.file('dm-sticker-attachments.json'), {})
    if (Array.isArray(attachments.items)) {
      const keep = attachments.items.filter((entry) => {
        if (!object(entry) || typeof entry.path !== 'string' || !Number.isFinite(Number(entry.at)) || now - Number(entry.at) < 86400000) return true
        // Imported ledgers may contain arbitrary attachment paths; only our cache is owned.
        return !remove(paths.cache, entry.path)
      })
      writeJson(paths.file('dm-sticker-attachments.json'), { ...attachments, items: keep })
    }
    const logfile = paths.file('duty.log')
    if (existsSync(logfile) && !lstatSync(logfile).isSymbolicLink() && lstatSync(logfile).size > 2 * 1024 * 1024) {
      writeFileSync(logfile, readFileSync(logfile, 'utf8').split('\n').slice(-2000).join('\n'), { mode: 0o600 })
      items.push('日志轮转（保留最后 2000 行）')
    }
    const cache = join(paths.browser, 'Default', 'Cache')
    if (existsSync(cache) && !lstatSync(cache).isSymbolicLink() && within(realpathSync(paths.browser), realpathSync(cache))) {
      for (const name of readdirSync(cache)) remove(cache, join(cache, name), true)
    }
    return { ok: true, cleaned: items.length, items: items.slice(0, 20) }
  })
  const maybe = (enabled: boolean) => withActionLock(paths.root, async () => {
    const key = `clean:${localDay()}`
    if (!enabled || state.read()[key] || busy()) return
    const result = await run()
    state.bump({ [key]: true, lastCleanAt: new Date().toISOString(), lastCleanCount: result.cleaned })
  })
  return { run, maybe }
}
export type Cleanup = ReturnType<typeof createCleanup>
