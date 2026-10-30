import { AGENT_PRESET_PLUGIN, hasCompactionRow, modelWindowStrategy, readCompactionValues, routeKindForProvider } from "../config-mapping.js";
import { COMPACTION_DEFAULTS, computeCompaction } from "../rules.js";
import { type ModelEntryView, type ModelRouteView, type PresetTuningView, type TuningSnapshot } from "../contracts.js";
import type { ConfigurationRow, TuningHostServices } from "./host-env.js";

import { TuningHttpError, messageOf, effectiveConfig, findRouteRow, findPresetRow, fallbackMaxTokens, buildRoute, listProviders, listModelRefs, resolveInBatches } from "./model-access.js";

/** Build the model list the target dropdown shows. */
export async function buildModels(
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

/** One preset view derived from its editable profile row. */
export function presetView(
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
export async function buildPresets(
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
export function defaultPreset(presets: readonly PresetTuningView[]): string | undefined {
  const marked = presets.find((preset) => preset.isDefault === true && preset.editable)
  const standard = presets.find((preset) => preset.id === 'standard' && preset.editable)
  return marked?.id ?? standard?.id ?? presets.find((preset) => preset.editable)?.id ?? presets[0]?.id
}

/** Read the full snapshot behind the tab. */
export async function snapshot(services: TuningHostServices): Promise<TuningSnapshot> {
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
