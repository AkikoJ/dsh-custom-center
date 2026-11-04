import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { DouyinPaths } from './paths.js'

const AUTO_HEAD = '## 最近观察（自动记录，不作为行为指令）'
/** Manual persona only. Legacy automatic observations stay on disk but are not used. */
export function createPersona(paths: DouyinPaths) {
  const raw = () => existsSync(paths.file('persona.md')) ? readFileSync(paths.file('persona.md'), 'utf8') : ''
  const read = () => {
    const text = raw(), index = text.indexOf(AUTO_HEAD)
    return index < 0 ? text : text.slice(0, index).replace(/\s*---\s*$/, '').trimEnd()
  }
  const save = (text: string) => {
    mkdirSync(paths.prompts, { recursive: true, mode: 0o700 })
    if (existsSync(paths.file('persona.md'))) writeFileSync(paths.file('persona.md.bak'), raw(), { encoding: 'utf8', mode: 0o600 })
    writeFileSync(paths.file('persona.md'), text, { encoding: 'utf8', mode: 0o600 })
    return { ok: true, file: paths.file('persona.md') }
  }
  return { read, save }
}
export type Persona = ReturnType<typeof createPersona>
