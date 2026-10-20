/**
 * Shared logic for the context / compaction tab.
 *
 * The tab edits two independent pieces of profile configuration:
 *
 * - the model route's declared context window and output reserve, which DSH
 *   uses as the capacity `W` and reservation `O` when it decides when to
 *   compact; and
 * - the `compaction-basic` row inside each agent preset, whose ratios and
 *   headroom turn `W` / `O` into a concrete trigger threshold.
 *
 * All functions here are pure so the host routes, the browser form and the
 * tests agree about validation, defaults and the computed token budgets.
 */

/** Compaction defaults mirrored from `@deepseek-ai/dsh-compaction-basic`. */
export const COMPACTION_DEFAULTS = Object.freeze({
  auto: true,
  thresholdRatio: 0.8,
  headroomTokens: 65_536,
  retainRatio: 0.16,
})

/**
 * Values the tab applies for "restore recommended". They differ from
 * `COMPACTION_DEFAULTS` on purpose: the plugin default headroom (65 536)
 * leaves a 256k window compacting at about 62%, while 16 384 lets the 0.8
 * ratio decide, so compaction starts at 80% of the window.
 */
export const RECOMMENDED = Object.freeze({
  contextWindow: 256_000,
  maxTokens: 32_768,
  auto: true,
  thresholdRatio: 0.8,
  headroomTokens: 16_384,
  retainRatio: 0.16,
})

/** Budgets the compaction backend derives from a model capacity. */
export interface CompactionComputation {
  /** Token pressure at which the oldest balanced region is summarized. */
  thresholdTokens: number
  /** Tokens of recent history kept verbatim. */
  retainTokens: number
}

/** Failure of a tuning input or of a derived budget. */
export class TuningError extends Error {
  /**
   * @param code - stable machine-readable code.
   * @param message - human-readable detail.
   */
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'TuningError'
  }
}

/** Context window and output reserve of one model route. */
export interface ModelWindowValues {
  contextWindow: number
  maxTokens: number
}

/**
 * Editable compaction policy of one preset.
 *
 * Exactly one of `retainRatio` and `retainTokens` is present; DSH rejects a
 * row that carries both. `readCompactionValues` normalizes to that shape and
 * `writeCompactionValues` preserves it.
 */
export interface CompactionValues {
  auto: boolean
  thresholdRatio: number
  headroomTokens: number
  retainRatio?: number
  retainTokens?: number
}

/** Which models a window save applies to. */
export type ModelScope = 'model' | 'provider' | 'all'

/**
 * Model selection sent with a window save. The host enumerates the models of a
 * `provider` or `all` scope itself, so the browser never lists ids to write.
 */
export interface ModelTarget {
  scope: ModelScope
  provider?: string
  model?: string
}

/** One save request from the browser. */
export interface TuningSaveRequest {
  model?: ModelWindowValues
  /** Defaults to the current default model when omitted. */
  target?: ModelTarget
  presetId?: string
  compaction?: CompactionValues
}

/** Known model-route families whose capacity lives in different config fields. */
export type ModelRouteKind = 'deepseek-account' | 'deepseek-api-key' | 'pi-ai'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function positiveInteger(value: unknown): value is number {
  return finiteNumber(value) && Number.isInteger(value) && value > 0
}

function nonNegativeInteger(value: unknown): value is number {
  return finiteNumber(value) && Number.isInteger(value) && value >= 0
}

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

/** Validate an untrusted model window input. */
export function validateModelWindow(input: unknown): ModelWindowValues {
  if (!isRecord(input)) throw new TuningError('invalid-input', '模型设置必须是对象。')
  const { contextWindow, maxTokens } = input
  if (!positiveInteger(contextWindow)) throw new TuningError('invalid-input', '上下文窗口必须是正整数。')
  if (!positiveInteger(maxTokens)) throw new TuningError('invalid-input', '输出预留必须是正整数。')
  if (maxTokens >= contextWindow) {
    throw new TuningError('invalid-input', '输出预留必须小于上下文窗口，否则压缩没有可用的消息预算。')
  }
  return { contextWindow, maxTokens }
}

/** Validate an untrusted compaction policy input. */
export function validateCompactionValues(input: unknown): CompactionValues {
  if (!isRecord(input)) throw new TuningError('invalid-input', '压缩设置必须是对象。')
  const { auto, thresholdRatio, headroomTokens, retainRatio, retainTokens } = input
  if (typeof auto !== 'boolean') throw new TuningError('invalid-input', '自动压缩开关必须是布尔值。')
  if (!finiteNumber(thresholdRatio) || thresholdRatio <= 0 || thresholdRatio > 1) {
    throw new TuningError('invalid-input', '触发比例必须在 0 与 1 之间。')
  }
  if (!nonNegativeInteger(headroomTokens)) throw new TuningError('invalid-input', '压缩余量必须是非负整数。')
  const hasRatio = retainRatio !== undefined
  const hasTokens = retainTokens !== undefined
  if (hasRatio && hasTokens) throw new TuningError('invalid-input', '近期保留只能选择比例或 token 数其中一种。')
  if (hasRatio) {
    if (!finiteNumber(retainRatio) || retainRatio <= 0 || retainRatio >= thresholdRatio) {
      throw new TuningError('invalid-input', '保留比例必须大于 0 且小于触发比例。')
    }
    return { auto, thresholdRatio, headroomTokens, retainRatio }
  }
  if (hasTokens) {
    if (!positiveInteger(retainTokens)) throw new TuningError('invalid-input', '保留 token 数必须是正整数。')
    return { auto, thresholdRatio, headroomTokens, retainTokens }
  }
  return { auto, thresholdRatio, headroomTokens, retainRatio: COMPACTION_DEFAULTS.retainRatio }
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200
}

/** Validate an untrusted model target. */
export function validateModelTarget(input: unknown): ModelTarget {
  if (!isRecord(input)) throw new TuningError('invalid-input', '目标模型必须是对象。')
  const { scope, provider, model } = input
  if (scope === 'all') return { scope }
  if (scope === 'provider') {
    if (!identifier(provider)) throw new TuningError('invalid-input', '目标 provider 无效。')
    return { scope, provider }
  }
  if (scope === 'model') {
    if (!identifier(provider) || !identifier(model)) throw new TuningError('invalid-input', '目标模型无效。')
    return { scope, provider, model }
  }
  throw new TuningError('invalid-input', '目标范围必须是 model、provider 或 all。')
}

/** Validate one save request body. */
export function parseTuningSaveRequest(input: unknown): TuningSaveRequest {
  if (!isRecord(input)) throw new TuningError('invalid-input', '请求体必须是对象。')
  const request: TuningSaveRequest = {}
  if (input.model !== undefined) request.model = validateModelWindow(input.model)
  if (input.target !== undefined) {
    if (request.model === undefined) throw new TuningError('invalid-input', '选择目标模型时必须同时提供最大上下文设置。')
    request.target = validateModelTarget(input.target)
  }
  if (input.compaction !== undefined) {
    if (typeof input.presetId !== 'string' || input.presetId.length === 0) {
      throw new TuningError('invalid-input', '写入压缩设置时必须提供 presetId。')
    }
    request.presetId = input.presetId
    request.compaction = validateCompactionValues(input.compaction)
  }
  if (request.model === undefined && request.compaction === undefined) {
    throw new TuningError('invalid-input', '没有可写入的设置。')
  }
  return request
}

/**
 * Derive the trigger and retention budgets exactly as the backend does.
 *
 * `threshold = floor(min(W × thresholdRatio, W − O − headroom))`, and the
 * verbatim tail is `retainTokens`, or `floor((W − O) × retainRatio)`.
 */
export function computeCompaction(
  contextWindow: number,
  reservedCompletionTokens: number,
  values: CompactionValues,
): CompactionComputation {
  if (!positiveInteger(contextWindow)) throw new TuningError('invalid-input', '上下文窗口必须是正整数。')
  if (!nonNegativeInteger(reservedCompletionTokens)) throw new TuningError('invalid-input', '输出预留必须是非负整数。')
  const messageBudget = contextWindow - reservedCompletionTokens
  if (messageBudget <= 0) {
    throw new TuningError('no-message-budget', '输出预留占满了上下文窗口，消息预算为零。')
  }
  const pressureBudget = messageBudget - values.headroomTokens
  if (pressureBudget <= 0) {
    throw new TuningError('no-pressure-budget', '上下文窗口扣掉输出预留和压缩余量后没有压力预算。')
  }
  const thresholdTokens = Math.floor(Math.min(contextWindow * values.thresholdRatio, pressureBudget))
  const retainTokens = values.retainTokens ?? Math.floor(messageBudget * (values.retainRatio ?? COMPACTION_DEFAULTS.retainRatio))
  if (retainTokens >= thresholdTokens) {
    throw new TuningError('retain-too-large', '近期保留预算必须小于触发阈值。')
  }
  return { thresholdTokens, retainTokens }
}

/** One located plugin row inside a nested entry list. */
interface LocatedRow {
  row: JsonRecord
}

/** Locate the compaction row in a deep-cloned plugin tree. */
function locateCompactionRow(rows: unknown): LocatedRow | undefined {
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

/** Current route as the tab displays it. */
export interface ModelRouteView {
  provider: string
  model: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  /** Whether a profile row owning this route can be edited. */
  editable: boolean
  entryId?: string
  strategy?: 'modelOverrides' | 'models'
  error?: string
}

/** One model the tab can target. */
export interface ModelEntryView {
  provider: string
  providerName?: string
  model: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  /** Whether a profile row owns this route and the host can write it. */
  editable: boolean
  /** Whether this is the deployment's current default model. */
  isCurrent?: boolean
  entryId?: string
  strategy?: 'modelOverrides' | 'models'
}

/** One preset's compaction section in the tab. */
export interface PresetTuningView {
  id: string
  name?: string
  /** Whether this preset is the deployment default. */
  isDefault?: boolean
  /** Whether this preset has an editable profile row and a compaction row. */
  editable: boolean
  broken?: string
  compaction: CompactionValues
  /** Derived budgets for the current route, or a human-readable reason. */
  computed?: CompactionComputation
  error?: string
}

/** Snapshot the tuning tab renders. */
export interface TuningSnapshot {
  route: ModelRouteView | null
  /** Every model the host could list; may be absent from an older host. */
  models?: ModelEntryView[]
  presets: PresetTuningView[]
  selectedPreset?: string
  defaults: typeof COMPACTION_DEFAULTS
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
function upsertCatalogModel(catalog: unknown, model: string, values: ModelWindowValues): unknown[] {
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

/** Option value that targets every editable model. */
export const TARGET_ALL = 'all'

/** Option value of one exact model. */
export function targetKeyOfModel(provider: string, model: string): string {
  return `m:${provider}\n${model}`
}

/** Option value of every model of one provider. */
export function targetKeyOfProvider(provider: string): string {
  return `p:${provider}`
}

/** Decode an option value into the target the host expects. */
export function parseTargetKey(key: string): ModelTarget | undefined {
  if (key === TARGET_ALL) return { scope: 'all' }
  if (key.startsWith('p:') && key.length > 2) return { scope: 'provider', provider: key.slice(2) }
  if (key.startsWith('m:')) {
    const split = key.indexOf('\n')
    if (split > 2 && split < key.length - 1) {
      return { scope: 'model', provider: key.slice(2, split), model: key.slice(split + 1) }
    }
  }
  return undefined
}

/** Models a target key covers, in listing order. */
export function modelsInScope(models: readonly ModelEntryView[], key: string): ModelEntryView[] {
  const target = parseTargetKey(key)
  if (target === undefined) return []
  if (target.scope === 'all') return [...models]
  if (target.scope === 'provider') return models.filter((entry) => entry.provider === target.provider)
  return models.filter((entry) => entry.provider === target.provider && entry.model === target.model)
}

/** One entry of the target dropdown. */
export interface TargetOption {
  value: string
  /** Full label, shown on the closed control. */
  label: string
  /** Shorter label shown under its group heading in the open list. */
  menuLabel?: string
  /** Heading the option is listed under; consecutive options share one heading. */
  group?: string
  disabled?: boolean
}

/**
 * Build the target dropdown. "All models" comes first; after it every
 * provider forms one group that lists its own "all of this provider" entry
 * (only when it would cover several editable models) followed by its models.
 */
export function buildTargetOptions(models: readonly ModelEntryView[]): TargetOption[] {
  const options: TargetOption[] = []
  const editable = models.filter((entry) => entry.editable)
  if (editable.length > 1) {
    options.push({ value: TARGET_ALL, label: `全部模型（${editable.length} 个）` })
  }
  const providers: string[] = []
  for (const entry of models) if (!providers.includes(entry.provider)) providers.push(entry.provider)
  for (const provider of providers) {
    const members = models.filter((entry) => entry.provider === provider)
    const owner = members[0]?.providerName ?? provider
    const writable = members.filter((entry) => entry.editable)
    if (providers.length > 1 && writable.length > 1) {
      options.push({
        value: targetKeyOfProvider(provider),
        label: `${owner} 的全部模型（${writable.length} 个）`,
        menuLabel: `全部 ${writable.length} 个模型`,
        group: owner,
      })
    }
    for (const entry of members) {
      const name = `${entry.name ?? entry.model}${entry.isCurrent === true ? '（当前默认）' : ''}${entry.editable ? '' : '（只读）'}`
      options.push({
        value: targetKeyOfModel(entry.provider, entry.model),
        label: `${owner} / ${name}`,
        menuLabel: name,
        group: owner,
        disabled: !entry.editable,
      })
    }
  }
  return options
}

/** Models of a snapshot, falling back to the current route for an older host. */
export function snapshotModels(snapshot: TuningSnapshot): ModelEntryView[] {
  if (snapshot.models !== undefined && snapshot.models.length > 0) return snapshot.models
  const route = snapshot.route
  if (route === null) return []
  return [{
    provider: route.provider,
    model: route.model,
    ...(route.name === undefined ? {} : { name: route.name }),
    ...(route.contextWindow === undefined ? {} : { contextWindow: route.contextWindow }),
    ...(route.maxTokens === undefined ? {} : { maxTokens: route.maxTokens }),
    editable: route.editable,
    isCurrent: true,
    ...(route.entryId === undefined ? {} : { entryId: route.entryId }),
    ...(route.strategy === undefined ? {} : { strategy: route.strategy }),
  }]
}
