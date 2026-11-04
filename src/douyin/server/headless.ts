import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import type { DouyinConfig } from '../config.js'
import { withActionLock, confirmed } from './actions.js'
import { createActionProxy } from './action-proxy.js'
import { normalizeNickname, type ToolArgs } from './action-policy.js'
import { withExecution } from './execution-context.js'
import { headlessTools, overlayText, removeOverlay, writeOverlay } from './overlay.js'
import { resolveDsh, type CliCommand } from './cli.js'
import type { Invoke } from './action-executor.js'
import type { Ledger } from './ledger.js'
import { object } from './ledger-model.js'
import type { DouyinPaths } from './paths.js'
import type { PythonRuntime } from './python-runtime.js'
import type { RuntimeStateStore } from './state.js'
import type { TaskOptions, TaskOutcome, TaskStart } from './task-contract.js'
import { errorMessage } from './storage.js'

interface HeadlessDependencies {
  paths: DouyinPaths
  config(): DouyinConfig
  ledger: Ledger
  state: RuntimeStateStore
  runtime: Pick<PythonRuntime, 'env' | 'python' | 'script'>
  call: Invoke
  prompt(): string
  resolveCli?: () => CliCommand | { missing: true; hint: string }
  launch?: (command: string, args: string[], options: SpawnOptions) => ChildProcess
  timeoutMs?: number
  log?(message: string): void
}
interface Running {
  runId: string; abort: AbortController; child?: ChildProcess; overlay?: string; proxy?: Awaited<ReturnType<typeof createActionProxy>>
  timer?: ReturnType<typeof setTimeout>; killTimer?: ReturnType<typeof setTimeout>
  finishing?: Promise<void>; closed?: Promise<void>; outcome: TaskOutcome; options: TaskOptions; claimed?: boolean
}
function alive(pid: unknown): boolean {
  if (!Number.isSafeInteger(pid) || Number(pid) <= 0) return false
  try { process.kill(Number(pid), 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH' }
}
export function createHeadless(deps: HeadlessDependencies) {
  const { paths, ledger, state } = deps
  let active: Running | undefined, disposed = false
  const log = (text: string) => { try { deps.log?.(text) } catch { /* Diagnostics cannot break process cleanup. */ } }
  const finish = (run: Running, code: number, error = ''): Promise<void> => {
    if (run.finishing) return run.finishing
    run.outcome = { ...run.outcome, code, ...(error ? { error } : {}) }
    run.finishing = (async () => {
      clearTimeout(run.timer)
      run.abort.abort(new Error(error || '后台任务已结束'))
      // Revoke the proxy first and wait for in-flight guarded operations before accepting a receipt.
      await run.proxy?.close()
      if (run.overlay) {
        try { removeOverlay(paths, run.runId, run.overlay) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') log('清除临时 overlay 失败：' + errorMessage(error)) }
      }
      await run.closed
      try { await run.options.onFinish?.(run.outcome) } catch (callbackError) { log('后台任务回调失败：' + errorMessage(callbackError)) }
      if (run.claimed) await withActionLock(paths.root, async () => {
        const prior = state.read().headless
        if (!object(prior) || prior.runId !== run.runId) return
        const success = code === 0 && !error
        state.bump({ ...(success && run.options.countRound !== false ? { count: state.roundsToday() + 1, lastRunAt: ledger.now().toISOString(), lastWhy: 'headless' } : {}), headless: { runId: run.runId, status: success ? 'completed' : 'failed', code, error, finishedAt: ledger.now().toISOString() } })
      })
    })().catch((finishError) => log('后台任务收尾失败：' + errorMessage(finishError))).finally(() => { if (active === run) active = undefined })
    return run.finishing
  }
  const execute = (run: Running, name: string, args: ToolArgs) => withActionLock(paths.root, () => withExecution({ ...run.options.context, signal: run.options.context?.signal ? AbortSignal.any([run.abort.signal, run.options.context.signal]) : run.abort.signal, origin: 'headless', runId: run.runId, force: false }, async () => {
    if (run.finishing || disposed) return { ok: false, blocked: true, error: '后台任务已结束' }
    const recipient = run.options.recipient
    if (recipient && ['douyin_chat_send', 'douyin_chat_sticker'].includes(name)) {
      if (normalizeNickname(args.nickname) !== normalizeNickname(recipient)) return { ok: false, blocked: true, error: '后台私信任务只能回复指定联系人' }
      if (name === 'douyin_chat_send' && (run.outcome.lastReply || run.outcome.dmSendUnknown)) return { ok: false, blocked: true, error: '本轮已发送或发送状态未知，禁止重复发送' }
      if (name === 'douyin_chat_sticker' && !run.outcome.lastReply) return { ok: false, blocked: true, error: '先确认文字回复，再补表情包' }
    }
    const cfg = deps.config(), id = String(args.aweme_id || '').match(/\d{6,}/)?.[0] || '', key = ledger.day() + ':' + id
    if (name === 'douyin_watch' && run.options.countRound !== false) {
      const picks = ledger.read().picks
      if (!picks[key] && (ledger.picked() >= cfg.perDay || Object.values(picks).filter((pick) => pick.runId === run.runId && pick.watched).length >= cfg.pickPerRound)) return { ok: false, blocked: true, error: '本轮或今日看片额度已用完' }
    }
    let result: unknown
    try { result = await deps.call(name, args, { timeoutMs: name === 'douyin_watch' ? 900000 : 300000 }) }
    catch (error) { if (name === 'douyin_chat_send') run.outcome.dmSendUnknown = true; throw error }
    if (name === 'douyin_chat_send') {
      if (confirmed(result)) run.outcome.lastReply = { nickname: String(args.nickname || ''), text: String(args.text || '').slice(0, 300) }
      else if (object(result) && (result.ok || ['unknown', 'partial'].includes(String(result.status)))) run.outcome.dmSendUnknown = true
    }
    if (name === 'douyin_watch' && object(result) && result.ok && id && run.options.countRound !== false) {
      const data = ledger.read()
      data.picks[key] = { ...data.picks[key], day: ledger.day(), aweme_id: id, source: data.picks[key]?.source || 'headless-watch', runId: run.runId, watched: true, at: ledger.now().toISOString() }
      ledger.write(data)
    }
    return result
  }))
  const terminate = (run: Running) => {
    if (run.child && run.child.exitCode === null && run.child.signalCode === null) {
      run.child.kill()
      if (!run.killTimer) {
        run.killTimer = setTimeout(() => { if (run.child?.exitCode === null && run.child.signalCode === null) run.child.kill('SIGKILL') }, 5000)
        run.killTimer.unref()
      }
    }
  }
  const stop = async (error = '后台任务已取消') => {
    const run = active
    if (!run) return
    terminate(run)
    await finish(run, 1, error)
  }
  const run = async (reason = 'window', options: TaskOptions = {}): Promise<TaskStart> => {
    if (disposed) return { ok: false, started: false, error: '后台任务服务已卸载' }
    if (active) return { ok: false, started: false, runId: active.runId, error: '已有后台轮次在运行' }
    const task: Running = { runId: randomUUID(), abort: new AbortController(), options, outcome: { code: 1 } }
    active = task
    try {
      const cfg = deps.config()
      if (!cfg.overlayMcp) throw new Error('headless 必须开启 overlayMcp，接入宿主受控工具')
      const cli = deps.resolveCli?.() ?? resolveDsh(cfg.dshBin)
      if ('missing' in cli) throw new Error(cli.hint)
      await withActionLock(paths.root, async () => {
        if (disposed || task.finishing) throw new Error('后台任务已取消')
        const previous = state.read().headless
        if (object(previous) && ['starting', 'running'].includes(String(previous.status)) && (alive(previous.ownerPid) || alive(previous.pid))) throw new Error('另一后台进程仍在运行')
        state.bump({ headless: { runId: task.runId, status: 'starting', ownerPid: process.pid, startedAt: ledger.now().toISOString() } })
        task.claimed = true
      })
      if (disposed || task.finishing) throw new Error('后台任务已取消')
      const proxy = await createActionProxy({ allowed: () => headlessTools(deps.config(), options.recipient), execute: (name, args) => execute(task, name, args) })
      if (disposed || task.finishing) { await proxy.close(); throw new Error('后台任务已取消') }
      task.proxy = proxy
      const env = deps.runtime.env()
      task.overlay = writeOverlay(paths, task.runId, overlayText({ config: cfg, python: deps.runtime.python(), script: deps.runtime.script, env, proxy: task.proxy, tools: headlessTools(cfg, options.recipient) }))
      let cwd = paths.root
      if (cfg.workspace.trim() && existsSync(cfg.workspace) && statSync(cfg.workspace).isDirectory()) cwd = cfg.workspace
      const args = [...cli.args, '--profile', cfg.headlessProfile || 'headless', '--patch', task.overlay, options.prompt || deps.prompt()]
      const child = (deps.launch ?? spawn)(cli.command, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...env, DOUYIN_ALLOW_WRITES: '0', DOUYIN_PROXY_URL: '', DOUYIN_PROXY_TOKEN: '', ...cli.env } })
      task.child = child
      task.closed = new Promise<void>((resolve) => child.once('close', () => resolve()))
      for (const stream of [child.stdout, child.stderr]) { stream?.setEncoding('utf8'); stream?.on('data', (chunk: string) => log(chunk.slice(-10000))) }
      child.on('error', (error) => { void finish(task, 1, error.message) })
      child.on('close', (code) => { clearTimeout(task.killTimer); void finish(task, code ?? 1) })
      task.timer = setTimeout(() => { void stop('headless 超时') }, deps.timeoutMs ?? 30 * 60000)
      task.timer.unref()
      await withActionLock(paths.root, async () => { if (!task.finishing) state.bump({ headless: { runId: task.runId, status: 'running', ownerPid: process.pid, pid: child.pid, startedAt: ledger.now().toISOString(), reason } }) })
      log('后台任务已启动：' + reason + '，轮次 ' + task.runId)
      return { ok: true, started: true, runId: task.runId }
    } catch (error) {
      const message = errorMessage(error)
      terminate(task)
      await finish(task, 1, message)
      return { ok: false, started: false, runId: task.runId, error: message }
    }
  }
  return { run, busy: () => !!active, current: () => active ? { runId: active.runId, pid: active.child?.pid, finishing: !!active.finishing } : null, stop,
    dispose: async () => { disposed = true; await stop('插件卸载') } }
}
export type Headless = ReturnType<typeof createHeadless>
