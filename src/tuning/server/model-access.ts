import { AGENT_PRESET_PLUGIN, modelWindowStrategy, routeKindForProvider, routePluginName } from "../config-mapping.js";
import { type ModelRouteKind, type ModelRouteView } from "../contracts.js";
import type { ConfigurationRow, TuningHostServices } from "./host-env.js";

/** Failure with an HTTP status and a stable machine-readable code. */
export class TuningHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code)
  }
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The effective config of a row, falling back to its inherited layer. */
export function effectiveConfig(row: ConfigurationRow): Record<string, unknown> {
  const current = record(row.entry.options.config)
  if (current !== undefined && Object.keys(current).length > 0) return current
  return record(row.inherited) ?? {}
}

/** Whether a route family's config actually serves this provider. */
export function routeMatches(kind: ModelRouteKind, config: Record<string, unknown>, provider: string): boolean {
  if (kind !== 'pi-ai') return true
  const providers = record(config['providers'])
  return providers !== undefined && record(providers[provider]) !== undefined
}

/** Locate the profile row that owns one model route. */
export function findRouteRow(
  rows: readonly ConfigurationRow[],
  kind: ModelRouteKind,
  provider: string,
): ConfigurationRow | undefined {
  const plugin = routePluginName(kind)
  return rows.find((row) => row.entry.options.name === plugin && routeMatches(kind, effectiveConfig(row), provider))
}

/** Locate the editable profile row of one preset. */
export function findPresetRow(rows: readonly ConfigurationRow[], presetId: string): ConfigurationRow | undefined {
  return rows.find((row) => {
    if (row.entry.options.name !== AGENT_PRESET_PLUGIN) return false
    const config = effectiveConfig(row)
    return config['id'] === presetId || (config['id'] === undefined && row.entry.options.id === presetId)
  })
}

/** First positive integer among the candidates. */
export function firstPositive(...values: unknown[]): number | undefined {
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
export function fallbackMaxTokens(
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
export async function buildRoute(services: TuningHostServices, rows: readonly ConfigurationRow[]): Promise<ModelRouteView | null> {
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
export interface ModelRef {
  provider: string
  model: string
}

/** Provider routes with a registered adapter, with display names. */
export function listProviders(services: TuningHostServices): Array<{ id: string; name: string }> {
  try {
    return services.llm?.listProviders?.().map((provider) => ({ id: provider.id, name: provider.name })) ?? []
  } catch {
    return []
  }
}

/** Models one provider advertises; an unreachable catalog yields none. */
export async function listProviderModels(services: TuningHostServices, provider: string): Promise<string[]> {
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
export async function listModelRefs(services: TuningHostServices): Promise<ModelRef[]> {
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
export async function resolveInBatches<T, R>(items: readonly T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let index = 0; index < items.length; index += size) {
    out.push(...await Promise.all(items.slice(index, index + size).map(work)))
  }
  return out
}
