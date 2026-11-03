import { existsSync, realpathSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { DouyinConfig } from '../config.js'
import type { DouyinPaths } from './paths.js'
import { McpClient } from './mcp.js'
import { prepareRuntime, douyinResources, type DouyinResources } from './resources.js'

export interface PythonCommand { command: string; args: string[]; via: string }
export function venvPython(paths: DouyinPaths) {
  return join(paths.python, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
}
export function pythonCommand(paths: DouyinPaths, configured: string): PythonCommand {
  const raw = configured.trim()
  if (raw && raw !== 'python' && raw !== 'py') return /^uv$/i.test(raw) || /[\\/]uv(\.exe)?$/i.test(raw)
    ? { command: raw, args: ['run', '--no-project', 'python'], via: 'uv' } : { command: raw, args: [], via: 'config' }
  const executable = venvPython(paths)
  return existsSync(executable) ? { command: executable, args: [], via: 'venv' } : { command: 'python', args: [], via: 'path' }
}
export function createPythonRuntime(paths: DouyinPaths, config: () => DouyinConfig, log: (text: string) => void = () => {}, resources: DouyinResources = douyinResources()) {
  const runtime = prepareRuntime(paths, resources)
  const profilePort = 10000 + parseInt(createHash('sha256').update(realpathSync(paths.root)).digest('hex').slice(0, 6), 16) % 40000
  let client: McpClient | null = null, key = '', disposed = false
  const env = (): NodeJS.ProcessEnv => ({ ...runtime.env(), PYTHONIOENCODING: 'utf-8',
    DOUYIN_ALLOW_WRITES: '1', DOUYIN_PROXY_URL: '', DOUYIN_PROXY_TOKEN: '', DOUYIN_MCP_TOOLS: '', DOUYIN_HEADLESS: existsSync(paths.file('.need-captcha')) || existsSync(paths.file('.login-browser')) ? '0' : '1',
    DOUYIN_OPEN_LOGIN: existsSync(paths.file('.login-browser')) ? '1' : '0', DOUYIN_CDP_URL: config().cdpUrl,
    DOUYIN_CHROME_PATH: config().chromePath, DOUYIN_PROFILE_PORT: String(profilePort),
  })
  const python = () => pythonCommand(paths, config().pythonPath)
  const ensure = () => {
    if (disposed) throw new Error('抖音运行环境已卸载')
    const command = python(), environment = env()
    const nextKey = JSON.stringify([command, environment.DOUYIN_HEADLESS, environment.DOUYIN_OPEN_LOGIN, environment.DOUYIN_CDP_URL, environment.DOUYIN_CHROME_PATH, statSync(runtime.script).mtimeMs])
    if (!client || key !== nextKey) {
      client?.stop(); key = nextKey
      client = new McpClient({ command: command.command, args: [...command.args, runtime.script], cwd: paths.root, env: environment, log, identity: resources.identity })
    }
    return client
  }
  const stop = () => { client?.stop(); client = null; key = '' }
  const restart = async () => { stop(); await ensure().start() }
  return { env, python, profilePort, script: runtime.script, resources,
    invoke: (name: string, args: Record<string, unknown> = {}, options?: { timeoutMs?: number }) => ensure().call(name, args, options),
    restart, stop, running: () => !!client?.running,
    dispose: () => { disposed = true; stop() },
  }
}
export type PythonRuntime = ReturnType<typeof createPythonRuntime>
