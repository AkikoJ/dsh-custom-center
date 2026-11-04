import { rows, type Data } from './api.js'
export type MemoryCall = (method: string, params?: Data) => Promise<Data>

export async function clearWorkspace(call: MemoryCall, workspaceId: string, onProgress: (deleted: number) => void, signal?: AbortSignal) {
  const failed = new Set<unknown>(), attempted = new Set<unknown>(), accepted = new Set<unknown>()
  const detail = async () => {
    signal?.throwIfAborted()
    const result = await call('workspace_detail', { workspace_id: workspaceId, limit: 500 })
    signal?.throwIfAborted()
    if (!Array.isArray(result.items)) throw new Error('共享记忆条目格式无效，无法核对清理结果')
    return rows(result.items)
  }
  for (let page = 0; page < 100; page++) {
    const items = await detail()
    for (const item of items) if (accepted.has(item.id)) { accepted.delete(item.id); failed.add(item.id) }
    const targets = items.filter((item) => !attempted.has(item.id))
    if (!targets.length) break
    for (const item of targets) {
      signal?.throwIfAborted()
      if (item.id === undefined || item.id === null || item.id === '') throw new Error('记忆条目缺少 ID，已停止清理')
      attempted.add(item.id)
      try { await call('forget', { id: item.id }); accepted.add(item.id); onProgress(accepted.size) }
      catch (error) { if (signal?.aborted) throw error; failed.add(item.id) }
    }
  }
  const remaining = await detail()
  for (const item of remaining) if (accepted.has(item.id)) { accepted.delete(item.id); failed.add(item.id) }
  return { deleted: accepted.size, failed: failed.size, remaining }
}
