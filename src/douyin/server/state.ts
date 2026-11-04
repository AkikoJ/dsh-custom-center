import type { DouyinPaths } from './paths.js'
import { localDay } from './ledger-model.js'
import { readRequiredObject, writeJson } from './storage.js'

export interface RuntimeState extends Record<string, unknown> {
  day?: string
  count?: number
  picked?: number
  windows?: Record<string, unknown>
  loggedIn?: boolean
  nickname?: string
  avatarUrl?: string
  uid?: string
}
export function createRuntimeState(paths: DouyinPaths, now: () => Date = () => new Date()) {
  const read = () => readRequiredObject(paths.state) as RuntimeState
  const bump = (patch: RuntimeState) => {
    const state = read()
    if (state.day !== localDay(now())) Object.assign(state, { day: localDay(now()), count: 0, picked: 0, windows: {} })
    const next = { ...state, ...patch }
    writeJson(paths.state, next)
    return next
  }
  const roundsToday = () => { const state = read(); return state.day === localDay(now()) ? Number(state.count || 0) : 0 }
  return { read, bump, roundsToday, hasLogin: () => read().loggedIn === true }
}
export type RuntimeStateStore = ReturnType<typeof createRuntimeState>
