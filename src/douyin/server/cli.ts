import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

export interface CliCommand { command: string; args: string[]; shell: false; env?: NodeJS.ProcessEnv; source: string }
export interface CliEnvironment {
  resourcesPath?: string
  execPath?: string
  pluginDir?: string
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  resolvePackage?: (name: string) => string
}
const isFile = (file: string) => { try { return statSync(file).isFile() } catch { return false } }
export function findDesktopCli(options: CliEnvironment = {}): CliCommand | null {
  const executable = options.execPath ?? process.execPath
  const env = options.env ?? process.env
  const resources = options.resourcesPath ?? (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  const roots = [resources, options.pluginDir && join(resolve(options.pluginDir, '../..'), 'resources'), env.DSH_HOME && join(env.DSH_HOME, 'resources'), join(dirname(executable), 'resources')].filter((item): item is string => !!item)
  for (const root of new Set(roots)) {
    const windowsExecutable = join(dirname(root), 'DeepSeek Harness.exe')
    const shim = join(root, 'runtime/cli/bin/dsh.cmd')
    if (isFile(windowsExecutable) && existsSync(join(root, 'app.asar')) && isFile(shim)) {
      const text = readFileSync(shim, 'utf8')
      if (text.includes('ELECTRON_RUN_AS_NODE=1') && text.includes('@deepseek-ai\\dsh-desktop-host\\lib\\cli.js') && text.includes('--expose-internals')) {
        return { command: windowsExecutable, args: ['--expose-internals', join(root, 'app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js')], shell: false, env: { ELECTRON_RUN_AS_NODE: '1' }, source: 'desktop-shim' }
      }
    }
    const desktopCli = join(root, 'app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js')
    if (isFile(executable) && isFile(desktopCli)) return { command: executable, args: ['--expose-internals', desktopCli], shell: false, env: { ELECTRON_RUN_AS_NODE: '1' }, source: 'desktop-package' }
  }
  return null
}
function scanForCli(directory: string, depth: number, budget: { count: number }): string {
  if (depth > 7 || budget.count > 4000) return ''
  let entries: import('node:fs').Dirent[]
  try { entries = readdirSync(directory, { withFileTypes: true, encoding: 'utf8' }) } catch { return '' }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    if (++budget.count > 4000) return ''
    const path = join(directory, entry.name)
    if (entry.name === 'dsh' && isFile(join(path, 'lib/bin.js'))) return join(path, 'lib/bin.js')
    const hit = scanForCli(path, depth + 1, budget)
    if (hit) return hit
  }
  return ''
}
export function resolveDsh(configured = '', options: CliEnvironment = {}): CliCommand | { missing: true; hint: string } {
  const execPath = options.execPath ?? process.execPath, env = options.env ?? process.env
  const scriptCommand = (file: string, source: string): CliCommand => ({ command: execPath, args: [file], shell: false, env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : undefined, source })
  const explicit = configured.trim()
  if (explicit) {
    if (!isFile(explicit)) return { missing: true, hint: 'dshBin 指向的文件不存在，请填写实际 CLI bin.js' }
    if (!/\.[cm]?js$/i.test(explicit)) return { missing: true, hint: 'dshBin 必须是实际 CLI JavaScript 文件，不执行 shell 启动器' }
    return scriptCommand(resolve(explicit), 'config')
  }
  const desktop = findDesktopCli(options)
  if (desktop) return desktop
  try {
    const file = (options.resolvePackage ?? createRequire(import.meta.url).resolve)('@deepseek-ai/dsh/lib/bin.js')
    if (isFile(file)) return scriptCommand(file, 'package')
  } catch { /* Continue through installed CLI locations. */ }
  const candidates = [env.APPDATA && join(env.APPDATA, 'npm/node_modules/@deepseek-ai/dsh/lib/bin.js'), env.ProgramFiles && join(env.ProgramFiles, 'nodejs/node_modules/@deepseek-ai/dsh/lib/bin.js'), '/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js', '/usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js']
  const resources = options.resourcesPath ?? (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resources) for (const base of ['app.asar', 'app.asar.unpacked', 'app']) candidates.push(join(resources, base, 'dsh/node_modules/@deepseek-ai/dsh/lib/bin.js'))
  for (const file of candidates) if (file && isFile(file)) return scriptCommand(file, 'installed')
  for (const root of new Set([resources, join(dirname(execPath), 'resources')].filter((item): item is string => !!item))) {
    const hit = scanForCli(root, 0, { count: 0 })
    if (hit) return scriptCommand(hit, 'application-scan')
  }
  return { missing: true, hint: '找不到当前安装的 dsh CLI；请将 dshBin 指向实际 CLI bin.js，不执行 PATH 中的 shell 启动器' }
}
