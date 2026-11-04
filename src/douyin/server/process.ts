import { spawn } from 'node:child_process'

export interface CommandOptions {
  cwd?: string
  env: NodeJS.ProcessEnv
  timeoutMs?: number
  onData?: (text: string) => void
  signal?: AbortSignal
}

/** Cancellation settles only after the owned process has closed. */
export function runCommand(command: string, args: string[], options: CommandOptions): Promise<{ code: number; output: string }> {
  if (options.signal?.aborted) return Promise.reject(new Error(`命令已取消：${command}`))
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { cwd: options.cwd, env: options.env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = '', failure: Error | undefined, escalation: ReturnType<typeof setTimeout> | undefined
    const terminate = (error: Error) => {
      if (failure) return
      failure = error
      proc.kill('SIGTERM')
      escalation = setTimeout(() => { proc.kill('SIGKILL') }, 1000)
    }
    const abort = () => terminate(new Error(`命令已取消：${command}`))
    const timer = setTimeout(() => terminate(new Error(`命令超时：${command}`)), options.timeoutMs ?? 30000)
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) abort()
    for (const stream of [proc.stdout, proc.stderr]) {
      stream.setEncoding('utf8')
      stream.on('data', (text: string) => {
        output = (output + text).slice(-10000)
        try { options.onData?.(text) } catch { /* Logging cannot block process cleanup. */ }
      })
    }
    proc.on('error', (error) => { failure ??= error })
    proc.on('close', (code) => {
      clearTimeout(timer); clearTimeout(escalation); options.signal?.removeEventListener('abort', abort)
      const error = failure ?? (code === 0 ? undefined : new Error(`${command} 退出码 ${code}：${output.slice(-1000)}`))
      if (error) reject(error); else resolve({ code: code ?? -1, output })
    })
  })
}
