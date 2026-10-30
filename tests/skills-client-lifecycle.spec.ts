import type * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ViewProps } from "../src/skills/client/manager-types.js";
import { useWorkspaceCatalog } from '../src/skills/client/useWorkspaceCatalog.js'
import { createSessionApi } from '../src/skills/client/api-client.js'
import { useSkillCatalog } from '../src/skills/client/useSkillCatalog.js'
import { useSkillCommands } from '../src/skills/client/useSkillCommands.js'
import { useSkillCategories } from '../src/skills/client/useSkillCategories.js'
import { currentSessionId, SkillManagerSection } from '../src/skills/client/manager-page.js'

// A deterministic hook scheduler lets promises resolve in any order without a DOM or host.
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0,
  effects: [] as (() => void | (() => void))[], cleanups: [] as (() => void)[],
}))
vi.mock('react', async (original) => {
  const real = await original<typeof React>()
  return {
    ...real,
    useState(initial: unknown) {
      const index = hooks.cursor++
      if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? initial() : initial
      return [hooks.slots[index], (next: unknown) => {
        hooks.slots[index] = typeof next === 'function' ? next(hooks.slots[index]) : next
      }]
    },
    useRef(initial: unknown) {
      const index = hooks.cursor++
      if (!(index in hooks.slots)) hooks.slots[index] = { current: initial }
      return hooks.slots[index]
    },
    useEffect(effect: () => void | (() => void)) {
      const index = hooks.cursor++
      if (!(index in hooks.slots)) {
        hooks.slots[index] = true
        hooks.effects.push(effect)
      }
    },
  }
})
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Switch: 'host-switch', Button: 'host-button', Modal: 'host-modal',
  Input: Object.assign(() => null, { TextArea: () => null }), SegmentedTabs: 'host-tabs',
}))

function render<T>(callback: () => T) {
  hooks.cursor = 0
  return callback()
}
function mountEffects() {
  for (const effect of hooks.effects.splice(0)) {
    const cleanup = effect()
    if (cleanup) hooks.cleanups.push(cleanup)
  }
}
function unmount() {
  for (const cleanup of hooks.cleanups.splice(0)) cleanup()
}
async function flush() {
  for (let i = 0; i < 16; i++) await Promise.resolve()
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const t = (key: string) => key
const emptyState = { roots: [], writeDestinations: [], projects: [], trash: [], warnings: [], summary: { total: 0, enabled: 0, disabled: 0, issues: 0 } }
function props(scope = 'user'): ViewProps {
  return { t, scope, sessionId: 'session-one', setScope: vi.fn(), savedFilters: {}, setSavedFilters: vi.fn(), expanded: {}, setExpanded: vi.fn() }
}
function workspace(path: string) {
  return { name: 'same name', path, registeredPaths: [path], available: true, skillCount: 0 }
}
let requests: { url: string; options?: RequestInit; pending: ReturnType<typeof deferred<Response>> }[]
function respond(index: number, data: unknown) {
  requests[index].pending.resolve(Response.json({ ok: true, data }))
}
beforeEach(() => {
  hooks.slots = []; hooks.cursor = 0; hooks.effects = []; hooks.cleanups = []
  requests = []
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
    const pending = deferred<Response>()
    requests.push({ url, options, pending })
    return pending.promise
  }))
})
afterEach(() => { unmount(); vi.unstubAllGlobals() })

describe('Skills lifecycle and concurrent requests', () => {
  it('discards old workspace lists and details per path and invalidates responses on refresh', async () => {
    const catalog = () => render(() => useWorkspaceCatalog(t, 'project'))
    let view = catalog(); mountEffects()
    const oldList = view.loadWorkspaces(false)
    const newList = view.loadWorkspaces(false)
    respond(1, { items: [workspace('/a'), workspace('/b')] }); await newList
    respond(0, { items: [workspace('/obsolete')] }); await oldList
    view = catalog()
    expect(view.workspaceRows.map((item) => item.path)).toEqual(['/a', '/b'])
    expect(view.selectedWorkspace).toBe('/a')
    const aOld = view.loadWorkspaceDetail('/a')
    const aNew = view.loadWorkspaceDetail('/a')
    const b = view.loadWorkspaceDetail('/b')
    respond(3, { roots: [{ key: 'a-new' }] }); await aNew
    respond(4, { roots: [{ key: 'b' }] }); await b
    respond(2, { roots: [{ key: 'a-old' }] }); await aOld
    view = catalog()
    expect(view.workspaceDetails['/a'].roots).toEqual([{ key: 'a-new' }])
    expect(view.workspaceDetails['/b'].roots).toEqual([{ key: 'b' }])
    const stale = view.loadWorkspaceDetail('/a')
    const refresh = view.refreshWorkspaceDetails()
    respond(5, { roots: [{ key: 'stale' }] }); await stale
    expect(catalog().workspaceDetails).toEqual({})
    respond(6, { items: [] }); await refresh
    expect(catalog().selectedWorkspace).toBe('')
  })

  it('prevents post-unmount responses from writing workspace state', async () => {
    const catalog = () => render(() => useWorkspaceCatalog(t, 'project'))
    const view = catalog(); mountEffects()
    const list = view.loadWorkspaces(false)
    const detail = view.loadWorkspaceDetail('/a')
    unmount()
    respond(0, { items: [workspace('/a')] }); respond(1, { roots: [{ key: 'late' }] })
    await Promise.all([list, detail])
    expect(catalog().workspaceRows).toEqual([])
    expect(catalog().workspaceDetails['/a'].roots).toEqual([])
  })

  it('uses registered paths to distinguish identically named workspaces and rejects unavailable choices', async () => {
    const catalog = () => render(() => useWorkspaceCatalog(t, 'project'))
    let view = catalog(); mountEffects()
    const list = view.loadWorkspaces(false)
    respond(0, { items: [workspace('/a'), workspace('/b'), { ...workspace('/missing'), available: false }] })
    await list
    view = catalog(); view.selectWorkspace('/b')
    expect(catalog().selectedWorkspace).toBe('/b')
    expect(JSON.parse(String(requests[1].options?.body))).toEqual({ workspace: '/b' })
    catalog().selectWorkspace('/missing')
    expect(catalog().selectedWorkspace).toBe('/b')
    respond(1, { roots: [] }); await flush()
  })

  it('holds the mutation lock until state and workspace refresh finish and preserves scope ownership', async () => {
    let input = props('project')
    const manager = () => render(() => useMutationWorkflows(input))
    let view = manager(); mountEffects(); respond(0, emptyState); await flush()
    view = manager()
    const mutation = view.post('/enable', { name: 'alpha', workspace: '/a' })
    await expect(view.post('/disable', {})).rejects.toEqual({ error: 'operation already in progress' })
    expect(manager().busy).toBe(true)
    expect(new Headers(requests[1].options?.headers).get('x-dsh-skills-session')).toBe('session-one')
    respond(1, {}); await flush()
    expect(requests.slice(2).map((item) => item.url.split('/').pop())).toEqual(['state', 'workspace-skills'])
    respond(2, emptyState); await flush()
    expect(manager().busy).toBe(true)
    respond(3, { roots: [] }); await mutation
    expect(manager().busy).toBe(false)
    expect(manager().result).toMatchObject({ ok: true, scope: 'project' })
    input = props('user')
    expect(manager().result).toBeNull()
    input = props('project')
    expect(manager().result?.ok).toBe(true)
  })

  it('releases failed mutation locks and refreshes partial category batches in serial order', async () => {
    const manager = () => render(() => useMutationWorkflows(props('project')))
    let view = manager(); mountEffects(); respond(0, emptyState); await flush()
    const failed = view.post('/disable', {})
    requests[1].pending.reject(new Error('offline'))
    await expect(failed).rejects.toThrow('offline')
    expect(manager().busy).toBe(false)
    view = manager()
    view.assignCategoryBatch({ type: 'category-add', root: 'dsh', id: 'cat', name: 'Group', workspace: '/a', skills: [] }, ['a', 'b', 'c'])
    await flush()
    expect(requests).toHaveLength(3)
    expect(JSON.parse(String(requests[2].options?.body))).toEqual({ root: 'dsh', name: 'a', category: 'cat', workspace: '/a' })
    respond(2, {}); await flush()
    expect(JSON.parse(String(requests[3].options?.body)).name).toBe('b')
    requests[3].pending.reject(new Error('second failed')); await flush()
    expect(requests.slice(4).map((item) => item.url.split('/').pop())).toEqual(['state', 'workspace-skills'])
    expect(manager().result).toMatchObject({ ok: false, text: 'second failed', scope: 'project' })
    expect(manager().busy).toBe(false)
    respond(4, emptyState); respond(5, { roots: [] }); await flush()
  })

  it('retains session selection and keyed manager remounting', () => {
    expect(currentSessionId({ ids: ['background', 'active'], byId: { background: {}, active: { retainedBy: { mainView: true } } } })).toBe('active')
    expect(currentSessionId({ ids: ['background'], byId: { other: { retainedBy: { mainView: true } } } })).toBe('other')
    const section = render(() => SkillManagerSection({ t, useSessions: () => 'session-one' }))
    expect(section.key).toBe('session-one')
    const next = render(() => SkillManagerSection({ t, useSessions: () => 'session-two' }))
    expect(next.key).toBe('session-two')
    expect(next.props.savedFilters).toBe(section.props.savedFilters)
    expect(next.props.expanded).toBe(section.props.expanded)
  })
})

// Exercise the same catalog/command/category composition used by the session-keyed view.
function useMutationWorkflows(props: ViewProps) {
  const api = createSessionApi(props.sessionId)
  const catalog = useSkillCatalog(t, api, props.scope)
  const commands = useSkillCommands(t, props.scope, api, catalog.refresh, catalog.workspaces.loadWorkspaceDetail)
  const categories = useSkillCategories(t, api, vi.fn(), commands, catalog.refresh, catalog.workspaces.loadWorkspaceDetail)
  return { ...commands, assignCategoryBatch: categories.assignCategoryBatch }
}
