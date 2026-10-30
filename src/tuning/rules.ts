import type { CompactionComputation, ModelWindowValues, CompactionValues, ModelTarget, TuningSaveRequest, JsonRecord } from "./contracts.js";

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
 * leaves a 272k window compacting at about 64%, while 16 384 lets the 0.8
 * ratio decide, so compaction starts at 80% of the window (217 600 tokens).
 */
export const RECOMMENDED = Object.freeze({
  contextWindow: 272_000,
  maxTokens: 32_768,
  auto: true,
  thresholdRatio: 0.8,
  headroomTokens: 16_384,
  retainRatio: 0.16,
})

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

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function positiveInteger(value: unknown): value is number {
  return finiteNumber(value) && Number.isInteger(value) && value > 0
}

export function nonNegativeInteger(value: unknown): value is number {
  return finiteNumber(value) && Number.isInteger(value) && value >= 0
}

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

export function identifier(value: unknown): value is string {
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
