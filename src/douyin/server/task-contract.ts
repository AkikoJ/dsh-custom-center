import type { ExecutionContext } from './execution-context.js'

export interface TaskOutcome {
  code: number
  error?: string
  lastReply?: { nickname: string; text: string }
  dmSendUnknown?: boolean
  tools?: { name: string; status: string }[]
}
export interface TaskOptions {
  prompt?: string
  countRound?: boolean
  context?: ExecutionContext
  recipient?: string
  onFinish?: (outcome: TaskOutcome) => void | Promise<void>
}
export interface TaskStart { ok: boolean; started?: boolean; runId?: string; error?: string; pending?: boolean }
export type RunTask = (reason: string, options?: TaskOptions) => Promise<TaskStart>
