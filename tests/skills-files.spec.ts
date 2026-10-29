import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSkill, importSkill } from '../src/skills/server/skill-import.ts'
import { rootByKey } from '../src/skills/server/source-roots.ts'
import { importUploadedSkill } from '../src/skills/server/upload-import.ts'
import { deleteSkill, listTrash, restoreTrash } from '../src/skills/server/trash.ts'

const ENV_KEYS = ['HOME', 'USERPROFILE', 'DSH_HOME', 'DSH_AGENTS_HOME', 'DSH_CODEX_HOME'] as const
let temp: string
let saved: Record<string, string | undefined>
const doc = (body = 'original') => `---\nname: alpha\ndescription: Alpha skill\n---\n${body}\n`
const target = () => join(temp, 'dsh', 'skills', 'alpha')

beforeEach(() => {
  temp = mkdtempSync(join(tmpdir(), 'dsh-skills-files-'))
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
  process.env.HOME = temp
  process.env.USERPROFILE = temp
  process.env.DSH_HOME = join(temp, 'dsh')
  process.env.DSH_AGENTS_HOME = join(temp, 'agents')
  process.env.DSH_CODEX_HOME = join(temp, 'codex')
  mkdirSync(join(temp, 'dsh'))
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  rmSync(temp, { recursive: true, force: true })
})

describe('skill publication and trash compatibility', () => {
  it('creates normalized skills and refuses duplicate and read-only destinations', async () => {
    const input = { name: 'Alpha Skill', description: 'Description', body: 'Instructions' }
    expect(await createSkill(input)).toMatchObject({ name: 'alpha-skill', root: 'dsh' })
    const path = join(temp, 'dsh', 'skills', 'alpha-skill', 'SKILL.md')
    const original = readFileSync(path, 'utf8')
    expect(original).toContain('Instructions')
    expect(await createSkill(input)).toMatchObject({ ok: false })
    expect(readFileSync(path, 'utf8')).toBe(original)
    expect(await createSkill(input, undefined, { root: 'codex' })).toMatchObject({ ok: false })
  })

  it('preflights a directory without publishing, skips conflicts, and atomically overwrites', async () => {
    const source = join(temp, 'source', 'alpha')
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, 'SKILL.md'), doc())
    writeFileSync(join(source, 'asset.bin'), Buffer.from([0, 128, 255]))
    expect(await importSkill(source, undefined, { dryRun: true })).toMatchObject({ pending: [{ name: 'alpha' }], conflicts: [] })
    expect(existsSync(target())).toBe(false)
    expect(await importSkill(source)).toMatchObject({ imported: [{ name: 'alpha', overwritten: false }] })
    writeFileSync(join(source, 'SKILL.md'), doc('replacement'))
    expect(await importSkill(source)).toMatchObject({ imported: [], skipped: [{ name: 'alpha' }] })
    expect(readFileSync(join(target(), 'SKILL.md'), 'utf8')).toContain('original')
    expect(await importSkill(source, undefined, { conflict: 'overwrite' })).toMatchObject({ imported: [{ name: 'alpha', overwritten: true }] })
    expect(readFileSync(join(target(), 'SKILL.md'), 'utf8')).toContain('replacement')
    expect(readFileSync(join(target(), 'asset.bin'))).toEqual(Buffer.from([0, 128, 255]))
    expect(readdirSync(join(temp, 'dsh', 'skills'))).toEqual(['alpha'])
  })

  it('keeps an existing skill when a preflight source disappears before replacement', async () => {
    const source = join(temp, 'source', 'alpha')
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, 'SKILL.md'), doc())
    await importSkill(source)
    const original = readFileSync(join(target(), 'SKILL.md'), 'utf8')
    const result = await importSkill(source, undefined, {
      conflict: 'overwrite',
      beforeImport: async () => { rmSync(source, { recursive: true }) },
    })
    expect(result).toMatchObject({ ok: false })
    expect(readFileSync(join(target(), 'SKILL.md'), 'utf8')).toBe(original)
    expect(readdirSync(join(temp, 'dsh', 'skills'))).toEqual(['alpha'])
  })

  it('imports standalone, folder and ZIP uploads with identical binary contents', async () => {
    for (const input of [
      { name: 'alpha', entries: [{ path: 'SKILL.md', data: Buffer.from(doc()).toString('base64') }] },
      { name: 'folder', entries: [
        { path: 'alpha/SKILL.md', data: Buffer.from(doc()).toString('base64') },
        { path: 'alpha/asset.bin', data: 'AID/' },
      ] },
      { name: 'bundle.zip', zip: Buffer.from(zipSync({
        'alpha/SKILL.md': strToU8(doc()), 'alpha/asset.bin': new Uint8Array([0, 128, 255]),
      })).toString('base64') },
    ]) {
      const result = await importUploadedSkill(input)
      expect(result).toMatchObject({ imported: [{ name: 'alpha' }], failed: [] })
      expect(readFileSync(join(target(), 'SKILL.md'), 'utf8')).toBe(doc())
      if (input.name !== 'alpha') expect(readFileSync(join(target(), 'asset.bin'))).toEqual(Buffer.from([0, 128, 255]))
      rmSync(target(), { recursive: true })
    }
  })

  it('rejects traversal and symlink sources without changing outside files', async () => {
    expect(await importUploadedSkill({ entries: [{ path: '../escape', data: 'eA==' }] })).toMatchObject({ ok: false })
    const source = join(temp, 'source', 'alpha')
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, 'SKILL.md'), doc())
    const outside = join(temp, 'outside.txt')
    writeFileSync(outside, 'outside')
    symlinkSync(outside, join(source, 'link'))
    expect(await importSkill(source)).toMatchObject({ ok: false })
    expect(existsSync(target())).toBe(false)
    expect(readFileSync(outside, 'utf8')).toBe('outside')
  })

  it('preserves trash metadata and refuses restore conflicts before restoring content', async () => {
    await createSkill({ name: 'alpha', description: 'Alpha', body: 'original' })
    const original = readFileSync(join(target(), 'SKILL.md'), 'utf8')
    const deleted = await deleteSkill(rootByKey('dsh'), 'alpha')
    if ('ok' in deleted) throw new Error('delete failed')
    expect(existsSync(target())).toBe(false)
    expect(await listTrash()).toMatchObject([{ id: deleted.id, name: 'alpha' }])
    await createSkill({ name: 'alpha', description: 'Alpha', body: 'conflict' })
    expect(await restoreTrash(deleted.id)).toMatchObject({ ok: false, code: 'error.trash.conflict' })
    expect(await listTrash()).toHaveLength(1)
    rmSync(target(), { recursive: true })
    expect(await restoreTrash(deleted.id)).toMatchObject({ id: deleted.id, name: 'alpha' })
    expect(readFileSync(join(target(), 'SKILL.md'), 'utf8')).toBe(original)
    expect(await listTrash()).toEqual([])
  })
})
