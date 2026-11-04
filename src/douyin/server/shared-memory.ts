import type { Invoke } from './action-executor.js'
import { resultItems, resultObject } from './content.js'
import { errorMessage } from './storage.js'

/** The bundled MCP owns the shared database protocol; failures preserve local operation. */
export function createSharedMemory(call: Invoke, log: (message: string) => void = () => {}) {
  const recent = async (limit = 12) => {
    try {
      const result = resultObject(await call('memory_recent', { limit }, { timeoutMs: 30000 }))
      if (result.ok === false) throw new Error(String(result.error))
      return resultItems(result).map((item) => String(item.content || '').replace(/\s+/g, ' ').trim().slice(0, 120)).filter(Boolean).map((text) => '- ' + text).join('\n')
    } catch (error) { log('共享最近记忆读取失败：' + errorMessage(error)); return '' }
  }
  const context = async () => {
    try {
      const result = resultObject(await call('memory_context', { limit: 16 }, { timeoutMs: 30000 }))
      if (result.ok !== false && String(result.context || '').trim()) return String(result.context).trim().slice(0, 1800)
      log('共享角色上下文不可用：' + String(result.error || '内容为空'))
    } catch (error) { log('共享角色上下文读取失败：' + errorMessage(error)) }
    return recent(10)
  }
  const writeDm = async (name: string, incoming: string, reply: string) => {
    const clean = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 300)
    const entries = [{ content: `主人: ${clean(incoming)}（私信 · ${name}）`, tags: '私信,主人', importance: 0.7 }, ...(clean(reply) ? [{ content: `大肥鱼: ${clean(reply)}（私信 · ${name}）`, tags: '私信,大肥鱼', importance: 0.6 }] : [])]
    await Promise.all(entries.map(async (entry) => {
      try {
        const result = resultObject(await call('memory_write', { ...entry, type: 'fact', workspace_path: process.cwd() }, { timeoutMs: 30000 }))
        if (result.ok === false) throw new Error(String(result.error))
      } catch (error) { log('私信共享记忆写回失败：' + errorMessage(error)) }
    }))
  }
  return { recent, context, writeDm }
}
