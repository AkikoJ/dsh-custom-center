import { AsyncLocalStorage } from 'node:async_hooks'

export interface ExecutionContext {
  origin: 'tool' | 'http' | 'timer' | 'headless'
  runId?: string
  signal?: AbortSignal
  force?: boolean
  inbound?: { contact: string; messageId: string; peerId?: string; source?: 'watcher' }
  replyTarget?: { user: string; text: string }
  action?: 'streak'
  actionKey?: string
}
const execution = new AsyncLocalStorage<ExecutionContext>()
export function currentExecution(): ExecutionContext { return execution.getStore() ?? { origin: 'tool' } }
export function withExecution<T>(context: ExecutionContext, task: () => T): T {
  const parent = execution.getStore()?.signal, signal = parent && context.signal && parent !== context.signal ? AbortSignal.any([parent, context.signal]) : context.signal ?? parent
  return execution.run({ ...context, signal }, task)
}
