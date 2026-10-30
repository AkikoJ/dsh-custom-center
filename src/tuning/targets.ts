import type { ModelTarget, ModelEntryView, TuningSnapshot, TargetOption } from "./contracts.js";

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
