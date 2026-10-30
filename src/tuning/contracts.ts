import { COMPACTION_DEFAULTS } from "./rules.js";

/** Budgets the compaction backend derives from a model capacity. */
export interface CompactionComputation {
  /** Token pressure at which the oldest balanced region is summarized. */
  thresholdTokens: number
  /** Tokens of recent history kept verbatim. */
  retainTokens: number
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

export type JsonRecord = Record<string, unknown>

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
