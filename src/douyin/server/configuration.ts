import { PLUGIN_ID } from '../contracts.js'
import { DEFAULTS, type DouyinConfig } from '../config.js'
import { clampPatch, normalizeConfig } from './config-rules.js'
import { errorMessage, readJson, writeJson } from './storage.js'

interface SettingsRow {
  ns: string
  revision?: number
  value?: unknown
  user?: Record<string, unknown>
}
export interface ConfigurationDependencies {
  file: string
  initial?: unknown
  settings?: {
    describe(): SettingsRow[]
    update(ns: string, patch: object, revision?: number): Promise<void>
  }
  log?: (message: string) => void
  now?: () => number
}
interface SavedConfig extends Partial<DouyinConfig> {
  _set?: string[]
  _localOnly?: string[]
}

/** Keep one live configuration object while reconciling host revisions and local fallback. */
export function createConfiguration(deps: ConfigurationDependencies) {
  const log = deps.log ?? (() => {})
  const now = deps.now ?? Date.now
  const raw = () => readJson<SavedConfig>(deps.file, {})
  const initial = raw()
  const touched = new Set(initial._set ?? Object.keys(DEFAULTS).filter((key) =>
    key in initial && JSON.stringify(initial[key as keyof DouyinConfig]) !== JSON.stringify(DEFAULTS[key as keyof DouyinConfig])))
  let cached: { at: number; row: SettingsRow | null } | undefined
  const row = (fresh = false) => {
    if (!fresh && cached && now() - cached.at < 3000) return cached.row
    let found: SettingsRow | null = null
    try { found = deps.settings?.describe().find((item) => item.ns === PLUGIN_ID) ?? null }
    catch (error) { log(`读 DSH 设置表单失败（不影响跑）：${errorMessage(error)}`) }
    cached = { at: now(), row: found }
    return found
  }
  const localOnly = () => new Set((raw()._localOnly ?? []).filter((key) => typeof key === 'string'))
  const load = (): DouyinConfig => {
    const saved = normalizeConfig(raw(), normalizeConfig(deps.initial))
    const host = row()
    if (!host) return { ...saved, ...clampPatch(saved) }
    const output: Record<string, unknown> = normalizeConfig(host.value)
    const local = localOnly()
    for (const key of Object.keys(DEFAULTS) as (keyof DouyinConfig)[]) {
      const hostValue = host.user?.[key]
      output[key] = local.has(key) ? saved[key]
        : hostValue !== undefined && typeof hostValue === typeof DEFAULTS[key] ? hostValue : saved[key]
    }
    return { ...saved, ...clampPatch(output) }
  }
  const current = load()
  const refresh = () => {
    try { Object.assign(current, load()) }
    catch (error) { log(`重读配置失败（沿用旧值）：${errorMessage(error)}`) }
    return current
  }
  const saveLocal = (patch: Partial<DouyinConfig>) => {
    Object.assign(current, normalizeConfig(patch, current))
    const local = localOnly()
    for (const key of Object.keys(patch)) { touched.add(key); local.add(key) }
    writeJson(deps.file, { ...current, _set: [...touched], _localOnly: [...local] })
  }
  const saveHost = async (patch: Partial<DouyinConfig>) => {
    if (!deps.settings) return { ok: false, error: '宿主没有 settings.update' }
    try {
      const host = row(true)
      if (!host?.ns) return { ok: false, error: '宿主里没有可写的设置表单（值只落在 config.json）' }
      await deps.settings.update(host.ns, patch, host.revision)
      cached = undefined
      return { ok: true, ns: host.ns }
    } catch (error) {
      const message = errorMessage(error)
      if (/revision|stale|conflict/i.test(message)) {
        try {
          const latest = row(true)
          if (latest?.ns) {
            await deps.settings.update(latest.ns, patch, latest.revision)
            cached = undefined
            return { ok: true, ns: latest.ns, retried: true }
          }
        } catch (retry) { log(`写 DSH 设置重试仍失败：${errorMessage(retry)}`) }
      }
      log(`写 DSH 设置失败（本地那份仍然生效）：${message}`)
      return { ok: false, error: message }
    }
  }
  let pending = Promise.resolve<unknown>(undefined)
  const save = async (input: unknown) => {
    const clean = clampPatch(input)
    saveLocal(clean)
    const host = await saveHost(clean)
    const local = localOnly()
    for (const key of Object.keys(clean)) { if (host.ok) local.delete(key); else local.add(key) }
    writeJson(deps.file, { ...raw(), _localOnly: [...local] })
    return { clean, host }
  }
  const persist = (input: unknown) => {
    const task = pending.then(() => save(input))
    pending = task.catch(() => undefined)
    return task
  }
  return { current, refresh, persist }
}
export type Configuration = ReturnType<typeof createConfiguration>
