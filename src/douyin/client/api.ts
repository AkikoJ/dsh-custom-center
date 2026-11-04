import { API_PREFIX } from '../contracts.js'
import { MARKER_HEADER } from '../../shared/request.js'

export type Data = Record<string, unknown>
export const record = (value: unknown): Data => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : {}
export const rows = (value: unknown): Data[] => Array.isArray(value) ? value.map(record) : []
export class RequestFailure extends Error { constructor(message: string, readonly result: Data) { super(message) } }
export async function request(path: string, data?: Data, signal?: AbortSignal): Promise<Data> {
  const response = await fetch(API_PREFIX + path, { method: data ? 'POST' : 'GET', credentials: 'same-origin',
    headers: { [MARKER_HEADER]: '1', ...(data ? { 'content-type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}), signal })
  const result = record(await response.json())
  if (!response.ok || result.ok === false) throw new RequestFailure(String(result.error || result.hint || response.statusText || 'Request failed'), result)
  return result
}
export function platformUrl(value: unknown, id: unknown): string | undefined {
  try { const url = new URL(String(value || `https://www.douyin.com/video/${id}`)); return url.protocol === 'https:' && url.hostname === 'www.douyin.com' && /^\/(video|note)\/\d+$/.test(url.pathname) && !url.username && !url.password ? url.href : undefined } catch { return undefined }
}
async function blobImage(path: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(API_PREFIX + path, { credentials: 'same-origin', headers: { [MARKER_HEADER]: '1' }, signal })
  if (!response.ok || !/^image\/(jpeg|png|webp|gif)$/.test(response.headers.get('content-type') || '')) throw new Error('No image')
  return URL.createObjectURL(await response.blob())
}
export async function imageUrl(id: string, kind: 'thumb' | 'cover', signal: AbortSignal): Promise<string> {
  if (!/^\d{6,24}$/.test(id)) throw new Error('Invalid video id')
  return blobImage(`/${kind}?id=${id}`, signal)
}
export function accountAvatar(signal: AbortSignal): Promise<string> {
  return blobImage('/account/avatar', signal)
}
