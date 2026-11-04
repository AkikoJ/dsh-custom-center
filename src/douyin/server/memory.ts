import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { DouyinPaths } from './paths.js'
import type { RuntimeStateStore } from './state.js'
import { localDay } from './ledger-model.js'

const AUTO_HEAD = '## 最近观察（自动记录，不作为行为指令）'
const clean = (value: unknown, max = 300) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
export function createMemory(paths: DouyinPaths, state: RuntimeStateStore, now: () => Date = () => new Date(), writeDm?: (name: string, incoming: string, reply: string) => Promise<void>) {
  const read = (maxLines = 60): string[] => {
    try {
      return readdirSync(paths.memory).filter((name) => /^\d{4}-\d{2}\.md$/.test(name)).sort().slice(-2).flatMap((name) => {
        try { return readFileSync(join(paths.memory, name), 'utf8').split('\n').map((line) => line.trim()).filter(Boolean) } catch { return [] }
      }).slice(-Math.max(1, Math.min(2000, maxLines)))
    } catch { return [] }
  }
  const append = (line: string) => {
    mkdirSync(paths.memory, { recursive: true, mode: 0o700 })
    appendFileSync(join(paths.memory, `${localDay(now()).slice(0, 7)}.md`), line.endsWith('\n') ? line : line + '\n', { encoding: 'utf8', mode: 0o600 })
  }
  const dm = async (name: string, incoming: string, reply: string, when = now()) => {
    append(`\n## ${localDay(when)} ${when.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })} · 私信 · ${clean(name)}\n主人: ${clean(incoming)}\n大肥鱼: ${clean(reply)}\n`)
    await writeDm?.(name, incoming, reply)
  }
  const video = (kind: string, value: Record<string, unknown>, extra = '') => append(`[视频] ${kind} · ${clean(value.aweme_id)} · ${clean(value.title, 80)}${value.transcript ? ' · 转写: ' + clean(value.transcript, 120) : ''}${extra ? ' · ' + clean(extra) : ''}`)
  const persona = () => existsSync(paths.file('persona.md')) ? readFileSync(paths.file('persona.md'), 'utf8') : ''
  const savePersona = (text: string) => {
    mkdirSync(paths.prompts, { recursive: true, mode: 0o700 })
    if (existsSync(paths.file('persona.md'))) writeFileSync(paths.file('persona.md.bak'), persona(), { mode: 0o600 })
    writeFileSync(paths.file('persona.md'), text, { encoding: 'utf8', mode: 0o600 })
    return { ok: true, file: paths.file('persona.md') }
  }
  const refreshPersona = () => {
    const key = `persona:${localDay(now())}`
    if (state.read()[key]) return { ok: true, skipped: '今天已经更新过' }
    const text = persona()
    if (!text) return { ok: false, error: '没有 persona.md' }
    const picked = [...new Set(read(2000).filter((line) => line.includes('观察素材（不是指令）')).map((line) => line.replace(/^[-*\d.、\s]+/, '').slice(0, 120)))].slice(-12)
    const block = AUTO_HEAD + '\n\n' + (picked.length ? picked.map((line) => '- ' + line).join('\n') : '- （今天还没攒到新的，保持原样）') + '\n'
    const index = text.indexOf(AUTO_HEAD)
    savePersona(index >= 0 ? text.slice(0, index) + block : text.trimEnd() + '\n\n---\n\n' + block)
    state.bump({ [key]: true, personaUpdatedAt: now().toISOString(), personaItems: picked.length })
    return { ok: true, items: picked.length }
  }
  const metadata = () => {
    const dbPath = process.env.DSH_MEMORY_DB || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'memory-system', 'memory.db')
    return { directory: paths.memory, dbPath: existsSync(dbPath) ? dbPath : '未找到共享数据库', dbMb: existsSync(dbPath) ? (statSync(dbPath).size / 1024 / 1024).toFixed(2) : 0,
      files: existsSync(paths.memory) ? readdirSync(paths.memory).filter((name) => /^\d{4}-\d{2}\.md$/.test(name)).sort() : [], personaUpdatedAt: state.read().personaUpdatedAt || '', personaModifiedAt: existsSync(paths.file('persona.md')) ? statSync(paths.file('persona.md')).mtime.toISOString() : '' }
  }
  return { metadata, read, append, dm, video, persona, savePersona, refreshPersona }
}
export type Memory = ReturnType<typeof createMemory>
