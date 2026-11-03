import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { DouyinPaths } from './paths.js'
import { localDay } from './ledger-model.js'
import type { Ledger } from './ledger.js'

export function createReports(paths: DouyinPaths, ledger: Ledger) {
  const file = (when = ledger.now()) => join(paths.reports, `${localDay(when)}.md`)
  const append = (text: string, level: string, when = ledger.now()) => {
    if (level === 'off') return
    mkdirSync(paths.reports, { recursive: true, mode: 0o700 })
    appendFileSync(file(when), '\n' + text.trim() + '\n', { encoding: 'utf8', mode: 0o600 })
  }
  const latest = () => {
    try {
      const name = readdirSync(paths.reports).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).sort().at(-1)
      if (!name) return null
      const path = join(paths.reports, name)
      return { file: path, name, text: readFileSync(path, 'utf8').slice(0, 200000), mtime: statSync(path).mtimeMs }
    } catch { return null }
  }
  const watched = (limit = 14) => {
    const picks = Object.values(ledger.read().picks)
    const dates = [...new Set(picks.map((pick) => pick.day))].sort().reverse().slice(0, Math.max(1, Math.min(limit, 60)))
    const items = picks.filter((pick) => dates.includes(pick.day)).map((pick) => ({ ...pick, url: pick.url || `https://www.douyin.com/video/${pick.aweme_id}` }))
    return { ok: true, items, days: dates.map((day) => ({ day, count: items.filter((pick) => pick.day === day).length })), total: items.length }
  }
  return { file, append, latest, watched }
}
export type Reports = ReturnType<typeof createReports>
