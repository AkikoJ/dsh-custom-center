import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { errorMessage } from './storage.js'

export interface McpOptions {
  command: string
  args?: string[]
  cwd?: string
  env: NodeJS.ProcessEnv
  log?: (message: string) => void
  initializeTimeoutMs?: number
  identity: { name: string; version: string }
}
interface Pending {
  resolve(value: unknown): void
  reject(error: Error): void
}
interface RpcMessage {
  id?: number
  error?: { message?: string }
  result?: unknown
}

/** One lifecycle owns one process and rejects every outstanding request on disposal. */
export class McpClient {
  private proc: ChildProcessWithoutNullStreams | null = null
  private buffer = ''
  private nextId = 1
  private pending = new Map<number, Pending>()
  private stderr = ''
  private starting: Promise<void> | null = null
  private ready = false
  private generation = 0
  constructor(private readonly options: McpOptions) {}
  get running(): boolean { return !!this.proc || !!this.starting }

  async start(): Promise<void> {
    if (this.starting) return this.starting
    if (this.ready && this.proc) return
    const generation = ++this.generation
    this.buffer = ''
    this.stderr = ''
    const initialize = async () => {
      const { command, args = [], cwd, env, log = () => {} } = this.options
      const proc = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
      this.proc = proc
      const fail = (error: Error) => {
        if (generation !== this.generation) return
        this.generation++
        this.starting = null
        this.ready = false
        this.rejectAll(error)
        this.proc = null
        if (proc.exitCode === null) proc.kill()
      }
      proc.stdout.setEncoding('utf8')
      proc.stdout.on('data', (chunk: string) => {
        if (generation === this.generation) this.onData(chunk)
      })
      proc.stderr.setEncoding('utf8')
      proc.stderr.on('data', (chunk: string) => {
        if (generation === this.generation) this.stderr = (this.stderr + chunk).slice(-4000)
      })
      proc.stdin.on('error', fail)
      proc.on('error', (error) => { log(`MCP 子进程启动失败：${error.message}`); fail(error) })
      proc.on('exit', (code) => {
        log(`MCP 子进程退出（code=${code}）`)
        fail(new Error(`MCP 子进程退出（code=${code}）：${this.stderr.slice(-300)}`))
      })
      await this.request('initialize', {
        protocolVersion: '2024-11-05', capabilities: {},
        clientInfo: this.options.identity,
      }, this.options.initializeTimeoutMs ?? 60000)
      if (generation !== this.generation) throw new Error('MCP 初始化期间已停止')
      this.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
      this.ready = true
      log('MCP 已就绪')
    }
    this.starting = initialize()
    try { await this.starting }
    catch (error) { if (generation === this.generation) this.stop(); throw error }
    finally { if (generation === this.generation) this.starting = null }
  }

  stop(): void {
    this.generation++
    this.ready = false
    this.starting = null
    this.rejectAll(new Error('MCP 已停止'))
    this.proc?.kill()
    this.proc = null
    this.buffer = ''
    this.stderr = ''
  }

  async call<T = unknown>(name: string, args: object = {}, { timeoutMs = 180000 } = {}): Promise<T> {
    await this.start()
    const result = await this.request('tools/call', { name, arguments: args }, timeoutMs) as {
      content?: { text?: string }[]; isError?: boolean
    }
    const text = (result?.content ?? []).map((item) => item?.text ?? '').join('\n').trim()
    if (result?.isError) throw new Error(text || `MCP 工具 ${name} 报错`)
    try { return (text ? JSON.parse(text) : {}) as T } catch { return text as T }
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
  private onData(chunk: string) {
    this.buffer += chunk
    // A corrupt peer cannot retain unlimited unterminated output.
    if (this.buffer.length > 16 * 1024 * 1024) { this.stop(); return }
    let index: number
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).trim()
      this.buffer = this.buffer.slice(index + 1)
      let message: RpcMessage
      try { message = JSON.parse(line) } catch { continue }
      if (!message || typeof message !== 'object' || typeof message.id !== 'number') continue
      const pending = this.pending.get(message.id)
      if (!pending) continue
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)))
      else pending.resolve(message.result)
    }
  }
  private send(message: object) {
    if (!this.proc?.stdin.writable) throw new Error('MCP 子进程不在运行')
    this.proc.stdin.write(JSON.stringify(message) + '\n')
  }
  private request(method: string, params: object, timeoutMs: number): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP ${method} 超时（${timeoutMs}ms）：${this.stderr.slice(-200)}`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value) },
        reject: (error) => { clearTimeout(timer); reject(error) },
      })
      try { this.send({ jsonrpc: '2.0', id, method, params }) }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(new Error(errorMessage(error))) }
    })
  }
}
