import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, lstatSync } from 'node:fs'
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
  const dates = () => {
    try { return readdirSync(paths.reports).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).map((name) => name.slice(0, 10)).sort().reverse() } catch { return [] }
  }
  const read = (day?: string) => {
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('日报日期格式无效')
    const selected = day || dates()[0]
    if (!selected) return null
    const path = join(paths.reports, `${selected}.md`)
    try {
      if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error('报告必须是普通文件')
      return { file: path, name: `${selected}.md`, text: readFileSync(path, 'utf8').slice(0, 200000), mtime: statSync(path).mtimeMs }
    } catch { return null }
  }
  const latest = () => read()
  const watched = (limit = 14) => {
    const picks = Object.values(ledger.read().picks)
    const dates = [...new Set(picks.map((pick) => pick.day))].sort().reverse().slice(0, Math.max(1, Math.min(limit, 60)))
    const items = picks.filter((pick) => dates.includes(pick.day)).map((pick) => ({ ...pick, url: pick.url || `https://www.douyin.com/video/${pick.aweme_id}` }))
    return { ok: true, items, days: dates.map((day) => ({ day, count: items.filter((pick) => pick.day === day).length })), total: items.length }
  }
  return { file, append, latest, read, dates, watched }
}
export type Reports = ReturnType<typeof createReports>
