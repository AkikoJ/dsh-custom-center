import { createContext, useContext, useCallback } from 'react'
import { record, type Data } from './api.js'

export type MemoryRpc = (method: string, params?: Data) => Promise<unknown>
export const SharedMemoryRpc = createContext<MemoryRpc | undefined>(undefined)
export function memoryCall(rpc?: MemoryRpc) {
  return async (method: string, params: Data = {}): Promise<Data> => {
    if (!rpc) throw new Error('共享记忆服务未连接；本地记录和人设仍可使用')
    const response = await rpc('memory.' + method, params), raw = record(response)
    if (raw.ok === false) throw new Error(String(record(raw.error).message || raw.error || raw.message || '记忆服务返回失败'))
    const value = raw.value === undefined ? response : raw.value
    return Array.isArray(value) ? { items: value } : record(value)
  }
}
export function useMemoryCall() {
  const rpc = useContext(SharedMemoryRpc)
  return useCallback(memoryCall(rpc), [rpc])
}
