import { MARKER_HEADER } from '../../shared/request.js'
import { record, rows } from './api.js'

export interface ReplyModel { provider: string; providerName?: string; model: string; name?: string }
export interface ReplyModelCatalog { models: ReplyModel[]; route: { provider: string; model: string } | null }

/** Read the existing same-origin model catalog through its HTTP contract. */
export async function loadReplyModels(signal: AbortSignal): Promise<ReplyModelCatalog> {
  const response = await fetch(new URL('custom-center/tuning', document.baseURI), { credentials: 'same-origin', headers: { [MARKER_HEADER]: '1' }, signal })
  const body = record(await response.json())
  if (!response.ok) throw new Error(String(body.message || body.error || response.statusText))
  const selected = record(body.route)
  return {
    models: rows(body.models).filter((item) => typeof item.provider === 'string' && typeof item.model === 'string').map((item) => ({ provider: String(item.provider), model: String(item.model), ...(typeof item.providerName === 'string' ? { providerName: item.providerName } : {}), ...(typeof item.name === 'string' ? { name: item.name } : {}) })),
    route: typeof selected.provider === 'string' && typeof selected.model === 'string' ? { provider: selected.provider, model: selected.model } : null,
  }
}
