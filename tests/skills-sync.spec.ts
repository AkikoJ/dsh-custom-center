import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const ENV_KEYS = ['HOME', 'USERPROFILE', 'DSH_HOME', 'DSH_AGENTS_HOME', 'DSH_CODEX_HOME'] as const

let temp: string
let saved: Record<string, string | undefined>

function skillDoc(name: string, description: string, body = 'body') {
  return `---\nname: ${name}\ndescription: ${description}\n---\n${body}\n`
}

function writeCodexSkill(name: string, description: string, body?: string) {
  const dir = join(temp, 'codex', 'skills', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), skillDoc(name, description, body))
  return dir
}

async function core() {
  return import('../src/skills/core.ts')
}

async function codexRow(name: string) {
  const { state } = await core()
  const snapshot = await state()
  const root = snapshot.roots.find((item) => item.key === 'codex')
  return { snapshot, root, skill: root?.skills.find((item) => item.name === name) }
}

beforeEach(() => {
  temp = mkdtempSync(join(tmpdir(), 'dsh-skills-sync-'))
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
  process.env.HOME = temp
  process.env.USERPROFILE = temp
  process.env.DSH_HOME = join(temp, 'dsh')
  process.env.DSH_AGENTS_HOME = join(temp, 'agents')
  process.env.DSH_CODEX_HOME = join(temp, 'codex')
  mkdirSync(join(temp, 'dsh'), { recursive: true })
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  rmSync(temp, { recursive: true, force: true })
})

describe('skills sync', () => {
  it('marks other agent skills as unsynced and excludes them from DSH counts', async () => {
    writeCodexSkill('alpha', 'Alpha skill')
    const { root, skill, snapshot } = await codexRow('alpha')
    expect(root?.toggleable).toBe(false)
    expect(root?.enabled).toBe(false)
    expect(skill?.sync).toEqual({ status: 'unsynced', target: { root: 'dsh', name: 'alpha' } })
    expect(snapshot.summary.total).toBe(0)
  })

  it('copies a skill into DSH without touching the source, then reports synced', async () => {
    const source = writeCodexSkill('alpha', 'Alpha skill', 'one')
    writeFileSync(join(source, 'extra.txt'), 'extra')
    const { syncSkills } = await core()

    const result = await syncSkills({ root: 'codex', names: ['alpha'] })
    expect(result.ok).not.toBe(false)
    expect(result.synced?.map((item) => item.name)).toEqual(['alpha'])

    const target = join(temp, 'dsh', 'skills', 'alpha')
    expect(readFileSync(join(target, 'SKILL.md'), 'utf8')).toContain('one')
    expect(readFileSync(join(target, 'extra.txt'), 'utf8')).toBe('extra')
    expect(readFileSync(join(source, 'SKILL.md'), 'utf8')).toContain('one')
    expect((await codexRow('alpha')).skill?.sync?.status).toBe('synced')
  })

  it('flags a changed source as outdated and only overwrites on request', async () => {
    const source = writeCodexSkill('alpha', 'Alpha skill', 'one')
    const { syncSkills } = await core()
    await syncSkills({ root: 'codex', names: ['alpha'] })

    writeFileSync(join(source, 'SKILL.md'), skillDoc('alpha', 'Alpha skill', 'two'))
    expect((await codexRow('alpha')).skill?.sync?.status).toBe('outdated')

    const skipped = await syncSkills({ root: 'codex', names: ['alpha'] })
    expect(skipped.synced).toEqual([])
    expect(skipped.skipped).toEqual([{ name: 'alpha', reason: 'exists' }])
    expect(readFileSync(join(temp, 'dsh', 'skills', 'alpha', 'SKILL.md'), 'utf8')).toContain('one')

    const overwritten = await syncSkills({ root: 'codex', names: ['alpha'], overwrite: true })
    expect(overwritten.synced?.[0]).toMatchObject({ name: 'alpha', overwritten: true })
    expect(readFileSync(join(temp, 'dsh', 'skills', 'alpha', 'SKILL.md'), 'utf8')).toContain('two')
    expect((await codexRow('alpha')).skill?.sync?.status).toBe('synced')

    const trash = join(temp, 'dsh', 'skills-manager', 'trash')
    expect(existsSync(trash) && readdirSync(trash).length).toBeTruthy()
  })

  it('treats an unrelated same-name DSH skill as a conflict', async () => {
    writeCodexSkill('alpha', 'Alpha skill', 'codex copy')
    const own = join(temp, 'dsh', 'skills', 'alpha')
    mkdirSync(own, { recursive: true })
    writeFileSync(join(own, 'SKILL.md'), skillDoc('alpha', 'Mine', 'my own'))

    expect((await codexRow('alpha')).skill?.sync?.status).toBe('exists')
    const { syncSkills } = await core()
    const result = await syncSkills({ root: 'codex', all: true })
    expect(result.skipped).toEqual([{ name: 'alpha', reason: 'exists' }])
    expect(readFileSync(join(own, 'SKILL.md'), 'utf8')).toContain('my own')
  })

  it('syncs everything with all and rejects unknown or DSH-owned sources', async () => {
    writeCodexSkill('alpha', 'Alpha skill')
    writeCodexSkill('beta', 'Beta skill')
    const { syncSkills } = await core()

    const all = await syncSkills({ root: 'codex', all: true })
    expect(all.synced?.map((item) => item.name).sort()).toEqual(['alpha', 'beta'])

    expect(await syncSkills({ root: 'dsh', all: true })).toMatchObject({ ok: false, code: 'error.sync.source' })
    expect(await syncSkills({ root: 'nope', all: true })).toMatchObject({ ok: false, code: 'error.sync.source' })
    expect(await syncSkills({ root: 'codex', names: [] })).toMatchObject({ ok: false, code: 'error.sync.empty' })
  })

  it('rejects a name that is not a scanned entry', async () => {
    writeCodexSkill('alpha', 'Alpha skill')
    const { syncSkills } = await core()
    const result = await syncSkills({ root: 'codex', names: ['../escape'] })
    expect(result.ok).toBe(false)
    expect(result.failed?.[0]?.code).toBe('error.skill.notFound')
    expect(existsSync(join(temp, 'dsh', 'skills'))).toBe(false)
  })

  it('refuses sources containing symbolic links', async () => {
    const source = writeCodexSkill('alpha', 'Alpha skill')
    const { symlinkSync } = await import('node:fs')
    symlinkSync(join(temp, 'dsh'), join(source, 'link'))
    const { syncSkills } = await core()
    const result = await syncSkills({ root: 'codex', names: ['alpha'] })
    expect(result.synced ?? []).toEqual([])
    expect(existsSync(join(temp, 'dsh', 'skills', 'alpha'))).toBe(false)
  })

  it('no longer publishes other agent skills to the host provider', async () => {
    writeCodexSkill('alpha', 'Alpha skill')
    const own = join(temp, 'dsh', 'skills', 'mine')
    mkdirSync(own, { recursive: true })
    writeFileSync(join(own, 'SKILL.md'), skillDoc('mine', 'Mine'))
    const { listProviderCandidates, setSkillEnabled } = await core()

    expect((await listProviderCandidates()).some((item) => item.locator.rootKey === 'codex')).toBe(false)
    expect(await setSkillEnabled('codex', 'alpha', false)).toMatchObject({ ok: false })
  })
})
