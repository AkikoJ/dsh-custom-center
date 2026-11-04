import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { douyinPaths } from '../../src/douyin/server/paths.js'
import { createLedger } from '../../src/douyin/server/ledger.js'
import { createReports } from '../../src/douyin/server/reports.js'
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
describe('daily report history', () => {
  it('reads the selected historical day, lists only real date names, and preserves off', () => {
    const root = mkdtempSync(join(tmpdir(), 'douyin-report-')); roots.push(root)
    const paths = douyinPaths(root), reports = createReports(paths, createLedger(paths))
    reports.append('# older report', 'full', new Date(2026, 10, 1, 12)); reports.append('# newest report', 'brief', new Date(2026, 10, 3, 12))
    reports.append('# disabled', 'off', new Date(2026, 10, 4, 12))
    writeFileSync(join(paths.reports, 'notes.md'), 'unrelated')
    expect(reports.dates()).toEqual(['2026-11-03', '2026-11-01'])
    expect(reports.latest()?.text).toContain('newest report')
    expect(reports.read('2026-11-01')?.text).toContain('older report')
    expect(reports.read('2026-11-04')).toBeNull()
    expect(() => reports.read('../notes')).toThrow('日报日期格式无效')
    const outside = join(root, 'outside.txt'); writeFileSync(outside, 'private')
    symlinkSync(outside, join(paths.reports, '2026-11-02.md'))
    expect(reports.read('2026-11-02')).toBeNull()
  })
})
