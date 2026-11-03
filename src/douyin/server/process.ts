import { spawn } from 'node:child_process'

export interface CommandOptions {
  cwd?: string
  env: NodeJS.ProcessEnv
  timeoutMs?: number
  onData?: (text: string) => void
  signal?: AbortSignal
}

/** No shell expansion; process output is bounded and every completion clears its timer. */
export function runCommand(command: string, args: string[], options: CommandOptions): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd, env: options.env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let finished = false
    let output = ''
    const finish = (error?: Error, code = 0) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
      if (error) reject(error); else resolve({ code, output })
    }
    const abort = () => { proc.kill(); finish(new Error(`命令已取消：${command}`)) }
    const timer = setTimeout(() => { proc.kill(); finish(new Error(`命令超时：${command}`)) }, options.timeoutMs ?? 30000)
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) abort()
    for (const stream of [proc.stdout, proc.stderr]) {
      stream.setEncoding('utf8')
      stream.on('data', (text: string) => {
        output = (output + text).slice(-10000)
        try { options.onData?.(text) } catch { /* Logging cannot block process cleanup. */ }
      })
    }
    proc.on('error', (error) => finish(error))
    proc.on('close', (code) => finish(code === 0 ? undefined : new Error(`${command} 退出码 ${code}：${output.slice(-1000)}`), code ?? -1))
  })
}
