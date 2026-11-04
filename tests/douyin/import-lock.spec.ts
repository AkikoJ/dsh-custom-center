import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { acquireImportLock } from '../../src/douyin/server/import-lock.js'
import { importLegacy } from '../../src/douyin/server/import-legacy.js'

describe('独立导入命令与崩溃恢复', () => {
  it('保留活跃或未知锁，仅恢复已退出进程的锁', () => {
    const root = mkdtempSync(join(tmpdir(), 'douyin-import-lock-'))
    const lock = join(root, '.lock')
    const release = acquireImportLock(lock)
    expect(() => acquireImportLock(lock)).toThrow('already running')
    release()
    writeFileSync(lock, '{}')
    expect(() => acquireImportLock(lock)).toThrow('invalid')
    const deadPid = Number(execFileSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' }).trim())
    writeFileSync(lock, JSON.stringify({ pid: deadPid }))
    const recovered = acquireImportLock(lock)
    expect(JSON.parse(readFileSync(lock, 'utf8')).pid).toBe(process.pid)
    recovered()
  })

  it('不抢占不明的锁恢复过程', () => {
    const root = mkdtempSync(join(tmpdir(), 'douyin-import-recovery-')), lock = join(root, '.lock')
    writeFileSync(lock, JSON.stringify({ pid: process.pid })); mkdirSync(lock + '.recovery')
    expect(() => acquireImportLock(lock)).toThrow('ambiguous')
    expect(JSON.parse(readFileSync(lock, 'utf8')).pid).toBe(process.pid)
  })
  it('恢复时拒绝被篡改的目标路径', () => {
    const root = mkdtempSync(join(tmpdir(), 'douyin-import-manifest-'))
    const source = join(root, 'old'), target = join(root, 'new')
    mkdirSync(source)
    writeFileSync(join(source, 'file'), 'data')
    expect(() => importLegacy({ source, target, legacyStopped: true,
      afterCopy: () => { throw new Error('interrupted') } })).toThrow('interrupted')
    const file = join(target, 'legacy-import.json')
    const manifest = JSON.parse(readFileSync(file, 'utf8'))
    manifest.entries[0].target = 'config/config.json'
    writeFileSync(file, JSON.stringify(manifest))
    expect(() => importLegacy({ source, target, legacyStopped: true })).toThrow('changed')
  })
})
