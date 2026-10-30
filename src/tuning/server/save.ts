import { buildRoute, findPresetRow, effectiveConfig, messageOf } from "./model-access.js";
import { applyModelWindow, hasCompactionRow, routeKindForProvider, setPresetCompaction } from "../config-mapping.js";
import { TuningError, computeCompaction } from "../rules.js";
import { type ModelTarget } from "../contracts.js";
import type { ConfigurationRow, TuningHostServices } from "./host-env.js";
import type { TuningSaveRequest } from "../contracts.js";

import { TuningHttpError, findRouteRow, listProviderModels, listModelRefs } from "./model-access.js";
import type { ModelRef } from "./model-access.js";

/**
 * Resolve the models a save writes to. Without a target the save keeps its
 * original meaning: the current default model.
 */
export async function resolveTargets(
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

export async function saveTuning(services: TuningHostServices, request: TuningSaveRequest) {
  // Reject a policy that cannot produce a budget before touching the
  // profile, so a save never leaves an invalid compaction row behind.
  if (request.compaction !== undefined) {
    let width = request.model?.contextWindow
    let reserve = request.model?.maxTokens
    if (width === undefined || reserve === undefined) {
      const route = await buildRoute(services, services.configEditor!.configuration())
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
    targets = await resolveTargets(services, services.configEditor!.configuration(), request.target)
    const rows = services.configEditor!.configuration()
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
    const row = findPresetRow(services.configEditor!.configuration(), request.presetId)
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
      const row = findRouteRow(services.configEditor!.configuration(), routeKindForProvider(ref.provider), ref.provider)
      if (row === undefined) continue
      const id = row.entry.options.id
      groups.set(id, [...(groups.get(id) ?? []), ref])
    }
    for (const [entryId, refs] of groups) {
      // Re-read the row: the previous write may have replaced its entry.
      const row = services.configEditor!.configuration().find((candidate) => candidate.entry.options.id === entryId)
      if (row === undefined) throw new TuningHttpError(409, 'route-not-editable', '所选模型路由不在可编辑的 profile 条目中。')
      await services.configEditor!.edit(row.entry, (current, inherited) => {
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
    const row = findPresetRow(services.configEditor!.configuration(), request.presetId)
    if (row === undefined) throw new TuningHttpError(409, 'preset-not-editable', `找不到可编辑的 preset "${request.presetId}"。`)
    await services.configEditor!.edit(row.entry, (current, inherited) => {
      const base = Object.keys(current).length > 0 ? current : inherited
      return setPresetCompaction(base, request.compaction!)
    })
    applied.push('compaction')
  }
  return { ok: true, applied, models: modelCount }
}
