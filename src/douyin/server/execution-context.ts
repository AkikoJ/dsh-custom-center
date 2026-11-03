import { AsyncLocalStorage } from 'node:async_hooks'

export interface ExecutionContext {
  origin: 'tool' | 'http' | 'timer' | 'headless'
  runId?: string
  force?: boolean
  inbound?: { contact: string; messageId: string; peerId?: string }
  replyTarget?: { user: string; text: string }
  action?: 'streak'
  actionKey?: string
}
const execution = new AsyncLocalStorage<ExecutionContext>()
export function currentExecution(): ExecutionContext { return execution.getStore() ?? { origin: 'tool' } }
export function withExecution<T>(context: ExecutionContext, task: () => T): T { return execution.run(context, task) }
