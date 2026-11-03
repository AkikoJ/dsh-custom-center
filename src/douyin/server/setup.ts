import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DouyinPaths } from './paths.js'
import type { PythonRuntime, PythonCommand } from './python-runtime.js'
import { venvPython } from './python-runtime.js'
import { runCommand } from './process.js'
import { errorMessage, readJson, writeJson } from './storage.js'

interface SetupState { status: string; phase?: string; error?: string | null; startedAt?: string; finishedAt?: string }
export function createSetup(paths: DouyinPaths, runtime: PythonRuntime, persist: (patch: Record<string, unknown>) => Promise<unknown>, command = runCommand) {
  let task: Promise<void> | null = null, controller: AbortController | null = null
  const stateFile = paths.file('setup-state.json'), log = paths.file('setup.log')
  const state = () => readJson<SetupState>(stateFile, { status: 'idle' })
  const save = (patch: Partial<SetupState>) => writeJson(stateFile, { ...state(), ...patch })
  if (state().status === 'running') save({ status: 'interrupted', error: '上次安装进程已结束，请重试' })
  const dependencies = async (python: PythonCommand = runtime.python()) => {
    try {
      const result = await command(python.command, [...python.args, '-c', 'import sys,mcp,playwright,numpy,faster_whisper; print(sys.executable)'], { cwd: paths.root, env: runtime.env(), timeoutMs: 20000 })
      return { ok: true, detail: result.output.trim() }
    } catch (error) { return { ok: false, error: errorMessage(error) } }
  }
  const start = () => {
    if (task) return { ok: true, started: true, ...state() }
    mkdirSync(paths.logs, { recursive: true, mode: 0o700 })
    writeFileSync(log, new Date().toISOString() + '\n', { mode: 0o600 })
    save({ status: 'running', phase: 'venv', error: null, startedAt: new Date().toISOString() })
    const abort = new AbortController(); controller = abort
    task = (async () => {
      const options = { cwd: paths.root, env: runtime.env(), timeoutMs: 15 * 60000, signal: abort.signal, onData: (text: string) => appendFileSync(log, text, { encoding: 'utf8', mode: 0o600 }) }
      try {
        const executable = venvPython(paths), base = runtime.python()
        if (!existsSync(executable)) await command(base.command, [...base.args, '-m', 'venv', paths.python], options)
        save({ phase: 'dependencies' })
        await command(executable, ['-m', 'pip', 'install', '-r', runtime.resources.requirements], options)
        save({ phase: 'verify' })
        const probe = await dependencies({ command: executable, args: [], via: 'venv' })
        if (!probe.ok) throw new Error(probe.error)
        if (abort.signal.aborted) throw new Error('安装已取消')
        await persist({ pythonPath: executable })
        runtime.stop()
        save({ status: 'completed', phase: 'ready', finishedAt: new Date().toISOString() })
      } catch (error) {
        save({ status: abort.signal.aborted ? 'interrupted' : 'failed', error: errorMessage(error) })
        appendFileSync(log, '\n安装失败：' + errorMessage(error) + '\n', { encoding: 'utf8', mode: 0o600 })
      } finally { task = null; controller = null }
    })()
    return { ok: true, started: true, ...state(), hint: '后台安装中，请查看日志；ffmpeg 和模型需另行自检。' }
  }
  const status = async () => {
    const python = runtime.python(), probe = await dependencies(python)
    let tail = ''; try { tail = readFileSync(log, 'utf8').slice(-6000) } catch { /* No installation yet. */ }
    return { ok: true, ...state(), venvReady: probe.ok, python, missing: probe.ok ? [] : [probe.error], tail }
  }
  const dispose = async () => { controller?.abort(); await task }
  return { start, status, state, dependencies, dispose, running: () => !!task }
}
export type Setup = ReturnType<typeof createSetup>
