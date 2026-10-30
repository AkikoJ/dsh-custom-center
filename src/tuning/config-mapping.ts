import type { ModelWindowValues, CompactionValues, ModelRouteKind, JsonRecord } from "./contracts.js";
import { COMPACTION_DEFAULTS, TuningError, isRecord, finiteNumber, positiveInteger, nonNegativeInteger } from "./rules.js";

/** Route family that owns a provider id. */
export function routeKindForProvider(provider: string): ModelRouteKind {
  if (provider === 'deepseek-account') return 'deepseek-account'
  if (provider === 'deepseek-official') return 'deepseek-api-key'
  return 'pi-ai'
}

/** Expected profile row plugin name for a route family. */
export function routePluginName(kind: ModelRouteKind): string {
  if (kind === 'deepseek-account') return '@deepseek-ai/dsh-llm-deepseek-account'
  if (kind === 'deepseek-api-key') return '@deepseek-ai/dsh-llm-deepseek-api-key'
  return '@deepseek-ai/dsh-llm-pi-ai'
}

/** Row plugin name of an editable agent preset. */
export const AGENT_PRESET_PLUGIN = '@deepseek-ai/dsh-agent-preset'

/** Row plugin name of the compaction backend. */
export const COMPACTION_PLUGIN = '@deepseek-ai/dsh-compaction-basic'

/** One located plugin row inside a nested entry list. */
export interface LocatedRow {
  row: JsonRecord
}

/** Locate the compaction row in a deep-cloned plugin tree. */
export function locateCompactionRow(rows: unknown): LocatedRow | undefined {
  if (!Array.isArray(rows)) return undefined
  for (const candidate of rows) {
    if (!isRecord(candidate)) continue
    if (candidate['id'] === 'compaction-basic' || candidate['name'] === COMPACTION_PLUGIN) {
      return { row: candidate }
    }
    const nested = locateCompactionRow(candidate['config'])
    if (nested !== undefined) return nested
  }
  return undefined
}

/** Read a preset's compaction policy, filling backend defaults. */
export function readCompactionValues(plugins: unknown): CompactionValues {
  const located = locateCompactionRow(plugins)
  const raw = isRecord(located?.row['config']) ? located.row['config'] : {}
  const auto = typeof raw['auto'] === 'boolean' ? raw['auto'] : COMPACTION_DEFAULTS.auto
  const thresholdRatio = finiteNumber(raw['thresholdRatio']) && raw['thresholdRatio'] > 0
    ? raw['thresholdRatio']
    : COMPACTION_DEFAULTS.thresholdRatio
  const headroomTokens = nonNegativeInteger(raw['headroomTokens'])
    ? raw['headroomTokens']
    : COMPACTION_DEFAULTS.headroomTokens
  if (positiveInteger(raw['retainTokens'])) {
    return { auto, thresholdRatio, headroomTokens, retainTokens: raw['retainTokens'] }
  }
  const retainRatio = finiteNumber(raw['retainRatio']) && raw['retainRatio'] > 0
    ? raw['retainRatio']
    : COMPACTION_DEFAULTS.retainRatio
  return { auto, thresholdRatio, headroomTokens, retainRatio }
}

/**
 * Write a preset's compaction policy into its plugin tree.
 * @returns a detached copy with only the compaction row's config replaced.
 */
export function writeCompactionValues(plugins: unknown, values: CompactionValues): unknown {
  if (!Array.isArray(plugins)) throw new TuningError('missing-row', 'preset 的 plugins 不是列表。')
  const cloned = structuredClone(plugins)
  const located = locateCompactionRow(cloned)
  if (located === undefined) {
    throw new TuningError('missing-row', '该 preset 没有挂载 compaction-basic。')
  }
  const next = structuredClone(values)
  const config = isRecord(located.row['config']) ? { ...located.row['config'] } : {}
  config['auto'] = next.auto
  config['thresholdRatio'] = next.thresholdRatio
  config['headroomTokens'] = next.headroomTokens
  delete config['retainRatio']
  delete config['retainTokens']
  if (next.retainTokens !== undefined) config['retainTokens'] = next.retainTokens
  else config['retainRatio'] = next.retainRatio ?? COMPACTION_DEFAULTS.retainRatio
  located.row['config'] = config
  return cloned
}

/** Clone a preset config and replace the compaction policy inside `plugins`. */
export function setPresetCompaction(config: unknown, values: CompactionValues): JsonRecord {
  if (!isRecord(config)) throw new TuningError('missing-row', 'preset 配置不是对象。')
  const next = structuredClone(config)
  if (!Array.isArray(next['plugins'])) throw new TuningError('missing-row', 'preset 没有 plugins 列表。')
  next['plugins'] = writeCompactionValues(next['plugins'], values)
  return next
}

/** Whether a preset plugin tree carries a compaction backend at all. */
export function hasCompactionRow(plugins: unknown): boolean {
  return locateCompactionRow(plugins) !== undefined
}

/**
 * Write a model window into the config that owns its route.
 *
 * The three shipped adapters keep capacity in different places:
 * `deepseek-account` only accepts `modelOverrides`; the API-key adapter and
 * pi-ai keep a `models` catalog (pi-ai falls back to `modelOverrides` when the
 * route has no explicit catalog).
 *
 * @param kind - route family.
 * @param config - the owning row's current config.
 * @param provider - provider route id.
 * @param model - model id.
 * @param values - window and output reserve.
 * @returns the next config, without mutating the input.
 */
export function applyModelWindow(
  kind: ModelRouteKind,
  config: unknown,
  provider: string,
  model: string,
  values: ModelWindowValues,
): JsonRecord {
  const next = isRecord(config) ? structuredClone(config) : {}
  if (kind === 'deepseek-account') {
    const overrides = isRecord(next['modelOverrides']) ? { ...next['modelOverrides'] } : {}
    const existing = isRecord(overrides[model]) ? { ...overrides[model] } : {}
    overrides[model] = { ...existing, contextWindow: values.contextWindow, maxTokens: values.maxTokens }
    next['modelOverrides'] = overrides
    return next
  }
  if (kind === 'deepseek-api-key') {
    next['models'] = upsertCatalogModel(next['models'], model, values)
    return next
  }
  const providers = isRecord(next['providers']) ? { ...next['providers'] } : {}
  const providerConfig = isRecord(providers[provider]) ? { ...providers[provider] } : undefined
  if (providerConfig === undefined) {
    throw new TuningError('unknown-provider', `llm-pi-ai 没有配置 provider "${provider}"。`)
  }
  if (Array.isArray(providerConfig['models']) && providerConfig['models'].length > 0) {
    providerConfig['models'] = upsertCatalogModel(providerConfig['models'], model, values)
  } else {
    const overrides = isRecord(providerConfig['modelOverrides']) ? { ...providerConfig['modelOverrides'] } : {}
    const existing = isRecord(overrides[model]) ? { ...overrides[model] } : {}
    overrides[model] = { ...existing, contextWindow: values.contextWindow, maxTokens: values.maxTokens }
    providerConfig['modelOverrides'] = overrides
  }
  providers[provider] = providerConfig
  next['providers'] = providers
  return next
}

/** Replace the matching catalog entry, or append one. */
export function upsertCatalogModel(catalog: unknown, model: string, values: ModelWindowValues): unknown[] {
  const models = Array.isArray(catalog) ? catalog.map((entry) => isRecord(entry) ? { ...entry } : entry) : []
  const index = models.findIndex((entry) => isRecord(entry) && entry['id'] === model)
  if (index >= 0) {
    models[index] = { ...(models[index] as JsonRecord), contextWindow: values.contextWindow, maxTokens: values.maxTokens }
  } else {
    models.push({ id: model, contextWindow: values.contextWindow, maxTokens: values.maxTokens })
  }
  return models
}

/** Where the model window of a route is stored, for display. */
export function modelWindowStrategy(kind: ModelRouteKind, config: unknown, provider: string): 'modelOverrides' | 'models' {
  if (kind === 'deepseek-account') return 'modelOverrides'
  if (kind === 'deepseek-api-key') return 'models'
  const providerConfig = isRecord(config) && isRecord(config['providers'])
    ? config['providers'][provider]
    : undefined
  return isRecord(providerConfig) && Array.isArray(providerConfig['models']) && providerConfig['models'].length > 0
    ? 'models'
    : 'modelOverrides'
}
