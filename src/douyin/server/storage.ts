import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(readFileSync(file, 'utf8')) as T } catch { return fallback }
}

/** Ledger failures must stop sends rather than silently reset deduplication. */
export function readRequiredObject(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {}
  let value: unknown
  try { value = JSON.parse(readFileSync(file, 'utf8')) } catch {
    throw new Error('账本损坏，请恢复备份；已停止自动发送')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('账本格式无效')
  return value as Record<string, unknown>
}

export function writeJson(file: string, value: unknown): void {
  const target = resolve(file)
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    renameSync(temporary, target)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
