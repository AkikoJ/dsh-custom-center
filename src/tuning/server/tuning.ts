/**
 * Host routes behind the context / compaction tab.
 *
 * `GET  /custom-center/tuning`  -> current route + every preset's policy
 * `POST /custom-center/tuning`  -> write model window and/or preset policy
 *
 * Writes go through `configEditor`, so they land in the active profile patch,
 * are validated by the owning plugin, and reconcile through the normal Loader
 * path. The routes never accept a file path; the only inputs are model window
 * and compaction numbers.
 *
 * Safety follows the wallpaper routes: loopback socket, the Connection
 * Host/Origin fence plus browser authentication, and the same-origin marker
 * header for both verbs.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  AGENT_PRESET_PLUGIN,
  COMPACTION_DEFAULTS,
  TuningError,
  applyModelWindow,
  computeCompaction,
  hasCompactionRow,
  modelWindowStrategy,
  parseTuningSaveRequest,
  readCompactionValues,
  routeKindForProvider,
  routePluginName,
  setPresetCompaction,
  type ModelEntryView,
  type ModelRouteKind,
  type ModelRouteView,
  type ModelTarget,
  type PresetTuningView,
  type TuningSnapshot,
} from '../tuning.ts'
import { MARKER_HEADER, isLoopbackAddress } from '../../shared/request.ts'
import type {
  ConfigurationRow,
  TuningHostServices,
  WebRoute,
} from '../../shared/host-env.ts'

/** Path prefix of the wallpaper library routes. */
export const TUNING_PATH = '/custom-center/tuning'

/** Options for {@link createTuningRoutes}. */
export interface TuningRouteOptions {
  /** Resolve services lazily so HMR replacement is observed. */
  services: () => TuningHostServices
  /** Host/Origin fence plus authentication; returns a rejection status or undefined. */
  reject: (req: IncomingMessage) => 401 | 403 | undefined
}

/** Failure with an HTTP status and a stable machine-readable code. */
class TuningHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code)
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(text)
}

/** Read a bounded JSON request body. */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    total += buffer.length
    if (total > 64 * 1024) throw new TuningHttpError(413, 'too-large')
    chunks.push(buffer)
  }
  if (total === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new TuningHttpError(400, 'invalid-json')
  }
}

/** The effective config of a row, falling back to its inherited layer. */
function effectiveConfig(row: ConfigurationRow): Record<string, unknown> {
  const current = record(row.entry.options.config)
  if (current !== undefined && Object.keys(current).length > 0) return current
  return record(row.inherited) ?? {}
}

/** Whether a route family's config actually serves this provider. */
function routeMatches(kind: ModelRouteKind, config: Record<string, unknown>, provider: string): boolean {
  if (kind !== 'pi-ai') return true
  const providers = record(config['providers'])
  return providers !== undefined && record(providers[provider]) !== undefined
}

/** Locate the profile row that owns one model route. */
function findRouteRow(
  rows: readonly ConfigurationRow[],
  kind: ModelRouteKind,
  provider: string,
): ConfigurationRow | undefined {
  const plugin = routePluginName(kind)
  return rows.find((row) => row.entry.options.name === plugin && routeMatches(kind, effectiveConfig(row), provider))
}

/** Locate the editable profile row of one preset. */
function findPresetRow(rows: readonly ConfigurationRow[], presetId: string): ConfigurationRow | undefined {
  return rows.find((row) => {
    if (row.entry.options.name !== AGENT_PRESET_PLUGIN) return false
    const config = effectiveConfig(row)
    return config['id'] === presetId || (config['id'] === undefined && row.entry.options.id === presetId)
  })
}

/** First positive integer among the candidates. */
function firstPositive(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  }
  return undefined
}

/**
 * Output reserve when the adapter omits `defaultMaxTokens`.
 *
 * pi-ai only reports a configured per-model cap; its catalog and route
 * fallbacks stay internal. Read the same fields the plugin would use so the
 * preview has a reserve instead of blocking on an empty value.
 */
function fallbackMaxTokens(
  kind: ModelRouteKind,
  config: Record<string, unknown>,
  provider: string,
  model: string,
): number | undefined {
  if (kind === 'pi-ai') {
    const providers = record(config['providers'])
    const providerConfig = providers === undefined ? undefined : record(providers[provider])
    if (providerConfig === undefined) return undefined
    const models = Array.isArray(providerConfig['models']) ? providerConfig['models'] : []
    const entry = models.find((candidate) => record(candidate)?.['id'] === model)
    return firstPositive(
      record(entry)?.['maxTokens'],
      providerConfig['defaultMaxTokens'],
      32_768,
    )
  }
  if (kind === 'deepseek-api-key') {
    const models = Array.isArray(config['models']) ? config['models'] : []
    const entry = models.find((candidate) => record(candidate)?.['id'] === model)
    return firstPositive(record(entry)?.['maxTokens'], config['maxTokens'], 256_000)
  }
  return firstPositive(config['maxTokens'], 256_000)
}

/** Build the current model route view. */
async function buildRoute(services: TuningHostServices, rows: readonly ConfigurationRow[]): Promise<ModelRouteView | null> {
  const selection = services.agentDefaultModel?.currentSelection()
  if (selection === undefined) return null
  const kind = routeKindForProvider(selection.provider)
  const row = findRouteRow(rows, kind, selection.provider)
  const config = row === undefined ? {} : effectiveConfig(row)
  let info: Awaited<ReturnType<NonNullable<TuningHostServices['llm']>['resolveModelInfo']>> | undefined
  let error: string | undefined
  if (services.llm === undefined) {
    error = 'LLM 路由服务不可用。'
  } else {
    try {
      info = await services.llm.resolveModelInfo(selection.provider, selection.model)
    } catch (cause) {
      error = messageOf(cause)
    }
  }
  const maxTokens = info?.defaultMaxTokens
    ?? fallbackMaxTokens(kind, config, selection.provider, selection.model)
  return {
    provider: selection.provider,
    model: selection.model,
    ...(info?.name === undefined ? {} : { name: info.name }),
    ...(info?.context === undefined ? {} : { contextWindow: info.context.contextWindow }),
    ...(maxTokens === undefined ? {} : { maxTokens }),
    editable: row !== undefined && info !== undefined,
    ...(row === undefined ? {} : { entryId: row.entry.options.id }),
    ...(row === undefined ? {} : { strategy: modelWindowStrategy(kind, config, selection.provider) }),
    ...(error === undefined ? {} : { error }),
  }
}

/** One model id with its provider route. */
interface ModelRef {
  provider: string
  model: string
}

/** Provider routes with a registered adapter, with display names. */
function listProviders(services: TuningHostServices): Array<{ id: string; name: string }> {
  try {
    return services.llm?.listProviders?.().map((provider) => ({ id: provider.id, name: provider.name })) ?? []
  } catch {
    return []
  }
}

/** Models one provider advertises; an unreachable catalog yields none. */
async function listProviderModels(services: TuningHostServices, provider: string): Promise<string[]> {
  if (services.llm?.listModels === undefined) return []
  try {
    const models = await services.llm.listModels(provider)
    return models.map((model) => model.id)
  } catch {
    return []
  }
}

/**
 * Every model the tab can target. The current default model is always
 * present, because catalog membership is advisory and the default may sit
 * outside a provider's advertised list.
 */
async function listModelRefs(services: TuningHostServices): Promise<ModelRef[]> {
  const refs: ModelRef[] = []
  const seen = new Set<string>()
  const add = (provider: string, model: string): void => {
    const key = `${provider}\n${model}`
    if (seen.has(key)) return
    seen.add(key)
    refs.push({ provider, model })
  }
  for (const provider of listProviders(services)) {
    for (const id of await listProviderModels(services, provider.id)) add(provider.id, id)
  }
  const current = services.agentDefaultModel?.currentSelection()
  if (current !== undefined) add(current.provider, current.model)
  return refs
}

/** Resolve metadata with a bounded fan-out so a long catalog stays quick. */
async function resolveInBatches<T, R>(items: readonly T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let index = 0; index < items.length; index += size) {
    out.push(...await Promise.all(items.slice(index, index + size).map(work)))
  }
  return out
}

/** Build the model list the target dropdown shows. */
async function buildModels(
  services: TuningHostServices,
  rows: readonly ConfigurationRow[],
): Promise<ModelEntryView[]> {
  const refs = await listModelRefs(services)
  const names = new Map(listProviders(services).map((provider) => [provider.id, provider.name]))
  const current = services.agentDefaultModel?.currentSelection()
  const views = await resolveInBatches(refs, 8, async (ref): Promise<ModelEntryView> => {
    const kind = routeKindForProvider(ref.provider)
    const row = findRouteRow(rows, kind, ref.provider)
    let info: Awaited<ReturnType<NonNullable<TuningHostServices['llm']>['resolveModelInfo']>> | undefined
    try {
      info = await services.llm?.resolveModelInfo(ref.provider, ref.model)
    } catch {
      info = undefined
    }
    const config = row === undefined ? {} : effectiveConfig(row)
    const maxTokens = info?.defaultMaxTokens ?? fallbackMaxTokens(kind, config, ref.provider, ref.model)
    const providerName = names.get(ref.provider)
    return {
      provider: ref.provider,
      ...(providerName === undefined ? {} : { providerName }),
      model: ref.model,
      ...(info?.name === undefined ? {} : { name: info.name }),
      ...(info?.context === undefined ? {} : { contextWindow: info.context.contextWindow }),
      ...(maxTokens === undefined ? {} : { maxTokens }),
      editable: row !== undefined,
      ...(current !== undefined && current.provider === ref.provider && current.model === ref.model ? { isCurrent: true } : {}),
      ...(row === undefined ? {} : { entryId: row.entry.options.id }),
      ...(row === undefined ? {} : { strategy: modelWindowStrategy(kind, config, ref.provider) }),
    }
  })
  return views
}

/**
 * Resolve the models a save writes to. Without a target the save keeps its
 * original meaning: the current default model.
 */
async function resolveTargets(
  services: TuningHostServices,
  rows: readonly ConfigurationRow[],
  target: ModelTarget | undefined,
): Promise<ModelRef[]> {
  if (target === undefined) {
    const selection = services.agentDefaultModel?.currentSelection()
    if (selection === undefined) throw new TuningHttpError(409, 'no-selection', '当前没有默认模型。')
    return [{ provider: selection.provider, model: selection.model }]
  }
  if (target.scope === 'model' && target.provider !== undefined && target.model !== undefined) {
    return [{ provider: target.provider, model: target.model }]
  }
  if (target.scope === 'provider' && target.provider !== undefined) {
    const ids = await listProviderModels(services, target.provider)
    const current = services.agentDefaultModel?.currentSelection()
    if (current !== undefined && current.provider === target.provider && !ids.includes(current.model)) ids.push(current.model)
    if (ids.length === 0) throw new TuningHttpError(409, 'no-models', `provider "${target.provider}" 没有可写入的模型。`)
    return ids.map((model) => ({ provider: target.provider as string, model }))
  }
  const all = await listModelRefs(services)
  const editable = all.filter((ref) => findRouteRow(rows, routeKindForProvider(ref.provider), ref.provider) !== undefined)
  if (editable.length === 0) throw new TuningHttpError(409, 'no-models', '没有可写入的模型。')
  return editable
}

/** One preset view derived from its editable profile row. */
function presetView(
  id: string,
  name: string | undefined,
  row: ConfigurationRow | undefined,
  route: ModelRouteView | null,
  broken: string | undefined,
  isDefault: boolean | undefined,
): PresetTuningView {
  const config = row === undefined ? {} : effectiveConfig(row)
  const plugins = config['plugins']
  const compaction = readCompactionValues(plugins)
  const editable = row !== undefined && hasCompactionRow(plugins)
  const view: PresetTuningView = {
    id,
    ...(name === undefined ? {} : { name }),
    ...(isDefault === true ? { isDefault: true } : {}),
    editable,
    compaction,
    ...(broken === undefined ? {} : { broken }),
  }
  if (!editable) {
    view.error = row === undefined
      ? '该 preset 不在当前 profile 的条目中，无法从这里编辑。'
      : '该 preset 没有挂载 compaction-basic。'
  } else if (route?.contextWindow === undefined || route.maxTokens === undefined) {
    view.error = '当前模型缺少上下文窗口或输出预留，无法计算压缩预算。'
  } else {
    try {
      view.computed = computeCompaction(route.contextWindow, route.maxTokens, compaction)
    } catch (cause) {
      view.error = messageOf(cause)
    }
  }
  return view
}

/** Build every preset's compaction section. */
async function buildPresets(
  services: TuningHostServices,
  rows: readonly ConfigurationRow[],
  route: ModelRouteView | null,
): Promise<PresetTuningView[]> {
  let declared: Array<{ id: string; name?: string; broken?: string; isDefault?: boolean }> = []
  if (services.agentPresets !== undefined) {
    try {
      declared = services.agentPresets.remoteExportList === undefined
        ? await services.agentPresets.list()
        : (await services.agentPresets.remoteExportList()).presets
    } catch {
      declared = await services.agentPresets.list().catch(() => [])
    }
  }
  if (declared.length > 0) {
    return declared.map((preset) => presetView(
      preset.id,
      preset.name,
      findPresetRow(rows, preset.id),
      route,
      preset.broken,
      preset.isDefault,
    ))
  }
  // Registry unavailable: fall back to the profile's own preset rows.
  return rows
    .filter((row) => row.entry.options.name === AGENT_PRESET_PLUGIN)
    .map((row) => {
      const config = effectiveConfig(row)
      const id = typeof config['id'] === 'string' ? config['id'] : row.entry.options.id
      const name = typeof config['name'] === 'string' ? config['name'] : undefined
      return presetView(id, name, row, route, undefined, undefined)
    })
}

/** Pick the preset the tab opens on. */
function defaultPreset(presets: readonly PresetTuningView[]): string | undefined {
  const marked = presets.find((preset) => preset.isDefault === true && preset.editable)
  const standard = presets.find((preset) => preset.id === 'standard' && preset.editable)
  return marked?.id ?? standard?.id ?? presets.find((preset) => preset.editable)?.id ?? presets[0]?.id
}

/**
 * Build the two tuning routes.
 * @param options - lazy service access plus the Connection fence.
 * @returns routes ready for `webServer.register`.
 */
export function createTuningRoutes(options: TuningRouteOptions): WebRoute[] {
  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      if (!isLoopbackAddress(req.socket.remoteAddress)) throw new TuningHttpError(403, 'forbidden')
      const rejection = options.reject(req)
      if (rejection !== undefined) throw new TuningHttpError(rejection, rejection === 401 ? 'unauthorized' : 'forbidden')
      if (req.headers[MARKER_HEADER] !== '1') throw new TuningHttpError(403, 'forbidden')
      if (req.method === 'GET') {
        sendJson(res, 200, await snapshot(options.services()))
        return
      }
      if (req.method !== 'POST') throw new TuningHttpError(405, 'method-not-allowed')
      const services = options.services()
      if (services.configEditor === undefined) throw new TuningHttpError(503, 'unavailable', '配置编辑器不可用。')
      const request = parseTuningSaveRequest(await readJson(req))
      // Reject a policy that cannot produce a budget before touching the
      // profile, so a save never leaves an invalid compaction row behind.
      if (request.compaction !== undefined) {
        let width = request.model?.contextWindow
        let reserve = request.model?.maxTokens
        if (width === undefined || reserve === undefined) {
          const route = await buildRoute(services, services.configEditor.configuration())
          width = route?.contextWindow
          reserve = route?.maxTokens
        }
        if (width !== undefined && reserve !== undefined) {
          try {
            computeCompaction(width, reserve, request.compaction)
          } catch (error) {
            throw new TuningError('invalid-budget', messageOf(error))
          }
        }
      }
      // Resolve every target before the first write so a missing preset or
      // route fails the save without leaving part of it applied.
      let targets: ModelRef[] = []
      if (request.model !== undefined) {
        targets = await resolveTargets(services, services.configEditor.configuration(), request.target)
        const rows = services.configEditor.configuration()
        const missing = targets.filter((ref) => findRouteRow(rows, routeKindForProvider(ref.provider), ref.provider) === undefined)
        // A single explicit model must be writable; a group skips read-only members.
        if (request.target === undefined || request.target.scope === 'model') {
          if (missing.length > 0) throw new TuningHttpError(409, 'route-not-editable', '所选模型路由不在可编辑的 profile 条目中。')
        } else {
          targets = targets.filter((ref) => !missing.includes(ref))
          if (targets.length === 0) throw new TuningHttpError(409, 'route-not-editable', '所选范围内没有可编辑的模型。')
        }
      }
      if (request.compaction !== undefined && request.presetId !== undefined) {
        const row = findPresetRow(services.configEditor.configuration(), request.presetId)
        if (row === undefined || !hasCompactionRow(effectiveConfig(row)['plugins'])) {
          throw new TuningHttpError(409, 'preset-not-editable', `找不到可编辑的 preset "${request.presetId}"。`)
        }
      }
      const applied: string[] = []
      let modelCount = 0
      if (request.model !== undefined && targets.length > 0) {
        // One edit per owning row, so a whole provider lands in a single write.
        const groups = new Map<string, ModelRef[]>()
        for (const ref of targets) {
          const row = findRouteRow(services.configEditor.configuration(), routeKindForProvider(ref.provider), ref.provider)
          if (row === undefined) continue
          const id = row.entry.options.id
          groups.set(id, [...(groups.get(id) ?? []), ref])
        }
        for (const [entryId, refs] of groups) {
          // Re-read the row: the previous write may have replaced its entry.
          const row = services.configEditor.configuration().find((candidate) => candidate.entry.options.id === entryId)
          if (row === undefined) throw new TuningHttpError(409, 'route-not-editable', '所选模型路由不在可编辑的 profile 条目中。')
          await services.configEditor.edit(row.entry, (current, inherited) => {
            let next: Record<string, unknown> = Object.keys(current).length > 0 ? current : inherited
            for (const ref of refs) {
              next = applyModelWindow(routeKindForProvider(ref.provider), next, ref.provider, ref.model, request.model!)
            }
            return next
          })
          modelCount += refs.length
        }
        applied.push('model')
      }
      if (request.compaction !== undefined && request.presetId !== undefined) {
        const row = findPresetRow(services.configEditor.configuration(), request.presetId)
        if (row === undefined) throw new TuningHttpError(409, 'preset-not-editable', `找不到可编辑的 preset "${request.presetId}"。`)
        await services.configEditor.edit(row.entry, (current, inherited) => {
          const base = Object.keys(current).length > 0 ? current : inherited
          return setPresetCompaction(base, request.compaction!)
        })
        applied.push('compaction')
      }
      sendJson(res, 200, { ok: true, applied, models: modelCount })
    } catch (error) {
      if (res.headersSent) {
        res.destroy()
        return
      }
      const status = error instanceof TuningHttpError
        ? error.status
        : error instanceof TuningError
          ? (error.code === 'invalid-input' ? 400 : 409)
          : 500
      const code = error instanceof TuningHttpError || error instanceof TuningError
        ? error.code
        : 'failed'
      sendJson(res, status, { error: code, message: messageOf(error) })
    }
  }

  return [{ kind: 'exact', path: TUNING_PATH, handler: handle }]
}

/** Read the full snapshot behind the tab. */
async function snapshot(services: TuningHostServices): Promise<TuningSnapshot> {
  if (services.configEditor === undefined) throw new TuningHttpError(503, 'unavailable', '配置编辑器不可用。')
  const rows = services.configEditor.configuration()
  const route = await buildRoute(services, rows)
  const presets = await buildPresets(services, rows, route)
  const models = await buildModels(services, rows)
  const selectedPreset = defaultPreset(presets)
  return {
    route,
    models,
    presets,
    ...(selectedPreset === undefined ? {} : { selectedPreset }),
    defaults: COMPACTION_DEFAULTS,
  }
}
