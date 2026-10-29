import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getProviderSkill, listProviderCandidates, workspaceSkills } from '../src/skills/core.ts'
import { assignSkillCategory, createCategory, deleteCategory, moveSkillInCategory } from '../src/skills/server/categories.ts'
import { defaultManagerState, readManagerState, setSidebarEntry } from '../src/skills/server/policy-store.ts'
import { setSkillEnabled } from '../src/skills/server/policy.ts'
import { createSkill } from '../src/skills/server/skill-import.ts'
import { managerStatePath, rootByKey } from '../src/skills/server/source-roots.ts'
import { deleteSkill, permanentlyDeleteTrash } from '../src/skills/server/trash.ts'

const ENV_KEYS = ['HOME', 'USERPROFILE', 'DSH_HOME', 'DSH_AGENTS_HOME', 'DSH_CODEX_HOME'] as const
let temp: string
let saved: Record<string, string | undefined>
function saveState(value: unknown) {
  mkdirSync(join(temp, 'dsh', 'skills-manager'), { recursive: true })
  writeFileSync(managerStatePath(), JSON.stringify(value))
}

beforeEach(() => {
  temp = mkdtempSync(join(tmpdir(), 'dsh-skills-state-'))
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

describe('manager state and workspace contracts', () => {
  it('migrates added v1 sources while keeping disabled original sources and optional fields', async () => {
    const legacy = defaultManagerState()
    delete legacy.sources.cursor
    delete legacy.disabledSkills.cursor
    delete legacy.enabledSkills.cursor
    legacy.sources.codex = false
    saveState(legacy)
    const current = await readManagerState()
    expect(current).toMatchObject({ writable: true, warning: null })
    expect(current.state.sources).toMatchObject({ cursor: true, codex: false })
    expect(current.state.disabledSkills.cursor).toEqual([])
  })

  it('fails closed and refuses writes for missing original fields or malformed state', async () => {
    const damaged = defaultManagerState()
    delete damaged.sources.codex
    for (const value of [damaged, { version: 1, sources: {} }]) {
      saveState(value)
      const before = readFileSync(managerStatePath(), 'utf8')
      const current = await readManagerState()
      expect(current).toMatchObject({ writable: false, warning: { code: 'warning.state.invalid' } })
      expect(Object.values(current.state.sources).every((flag) => flag === false)).toBe(true)
      expect(await createCategory('dsh', 'Blocked')).toMatchObject({ ok: false, code: 'error.state.invalid' })
      await expect(setSidebarEntry(true)).rejects.toMatchObject({ code: 'error.state.invalid' })
      expect(readFileSync(managerStatePath(), 'utf8')).toBe(before)
    }
  })

  it('preserves membership and manual order, then cleans permanent trash and deleted categories', async () => {
    for (const name of ['alpha', 'beta']) await createSkill({ name, description: name, body: 'body' })
    const created = await createCategory('dsh', 'Group')
    if ('ok' in created) throw new Error('category fixture failed')
    const id = created.category.id
    for (const name of ['alpha', 'beta']) await assignSkillCategory('dsh', name, id)
    expect(await moveSkillInCategory('dsh', 'beta', id, 'alpha', 'before')).toMatchObject({ order: ['beta', 'alpha'] })
    const deleted = await deleteSkill(rootByKey('dsh'), 'beta')
    if ('ok' in deleted) throw new Error('trash fixture failed')
    expect((await readManagerState()).state.categoryMembers.dsh.beta).toBe(id)
    await permanentlyDeleteTrash(deleted.id)
    const current = (await readManagerState()).state
    expect(current.categoryMembers.dsh).toEqual({ alpha: id })
    expect(current.categoryOrder.dsh[id]).toEqual(['alpha'])
    await deleteCategory('dsh', id)
    expect((await readManagerState()).state).toMatchObject({ categories: { dsh: [] }, categoryMembers: { dsh: {} } })
  })

  it('isolates same-name registered projects and rejects unregistered project requests', async () => {
    const paths = [join(temp, 'one', 'project'), join(temp, 'two', 'project')]
    for (const [index, path] of paths.entries()) {
      mkdirSync(join(path, '.git'), { recursive: true })
      mkdirSync(join(path, '.dsh', 'skills', 'alpha'), { recursive: true })
      writeFileSync(join(path, '.dsh', 'skills', 'alpha', 'SKILL.md'), `---\nname: alpha\ndescription: Project ${index}\n---\nbody`)
    }
    const first = await workspaceSkills(paths[0], paths)
    const second = await workspaceSkills(paths[1], paths)
    if ('ok' in first || 'ok' in second) throw new Error('workspace fixture failed')
    expect(first.project.root).toBe(realpathSync(paths[0]))
    expect(second.project.root).toBe(realpathSync(paths[1]))
    expect(first.roots.flatMap((root) => root.skills).map((skill) => skill.description)).toContain('Project 0')
    expect(first.roots.flatMap((root) => root.skills).map((skill) => skill.description)).not.toContain('Project 1')
    expect(await workspaceSkills(paths[0], [paths[1]])).toMatchObject({ ok: false })
  })

  it('revalidates provider locators and honors policy without editing source documents', async () => {
    await createSkill({ name: 'alpha', description: 'Alpha', body: 'body' })
    const file = join(temp, 'dsh', 'skills', 'alpha', 'SKILL.md')
    const original = readFileSync(file, 'utf8')
    await setSkillEnabled(rootByKey('dsh'), 'alpha', true)
    const candidate = (await listProviderCandidates()).find((item) => item.name === 'alpha')
    if (!candidate) throw new Error('provider fixture missing')
    expect(await getProviderSkill(candidate)).toBeTruthy()
    await setSkillEnabled(rootByKey('dsh'), 'alpha', false)
    expect((await listProviderCandidates()).find((item) => item.name === 'alpha')?.invocation).toEqual({ modelInvocable: false, userInvocable: false })
    expect(readFileSync(file, 'utf8')).toBe(original)
    rmSync(file)
    expect(await getProviderSkill(candidate)).toBeUndefined()
  })
})
