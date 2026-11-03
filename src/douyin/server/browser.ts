import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import type { DouyinConfig } from '../config.js'
import type { DouyinPaths } from './paths.js'
import type { RuntimeStateStore } from './state.js'
import type { Invoke } from './action-executor.js'
import { object } from './ledger-model.js'
import { errorMessage } from './storage.js'
import { runCommand } from './process.js'

export interface BrowserDependencies {
  paths: DouyinPaths
  config(): DouyinConfig
  persist(patch: Record<string, unknown>): Promise<unknown>
  invoke: Invoke
  restart(): Promise<void>
  env(): NodeJS.ProcessEnv
}
export function createBrowser(deps: BrowserDependencies, state: RuntimeStateStore) {
  const { paths } = deps
  const cdpBase = () => deps.config().cdpUrl.trim().replace(/\/+$/, '')
  const chrome = () => {
    const explicit = deps.config().chromePath.trim()
    if (explicit && existsSync(explicit)) return { path: explicit, via: 'config' }
    const env = deps.env()
    const candidates = process.platform === 'win32' ? [
      join(env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
      join(env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
      join(env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
      join(env.LOCALAPPDATA || '', 'Chromium/Application/chrome.exe'),
      join(env.ProgramFiles || 'C:/Program Files', 'Microsoft/Edge/Application/msedge.exe'),
    ] : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium']
    return { path: candidates.find((path) => existsSync(path)) || '', via: 'probe' }
  }
  const probe = async (timeoutMs = 1500): Promise<Record<string, unknown> & { ok: boolean }> => {
    const url = cdpBase()
    if (!url) return { ok: false, url, hint: 'cdpUrl 是空的，使用插件持久 profile；首次需要扫码' }
    try {
      const response = await fetch(url + '/json/version', { signal: AbortSignal.timeout(timeoutMs) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const info: unknown = await response.json()
      return { ok: true, url, browser: object(info) ? String(info.Browser || '') : '', ws: object(info) ? String(info.webSocketDebuggerUrl || '') : '' }
    } catch (error) { return { ok: false, url, error: errorMessage(error), hint: '先关闭 Chrome，再调用 dy_chrome_open' } }
  }
  const running = async () => {
    if (process.platform !== 'win32') return false
    try { return /chrome\.exe/i.test((await runCommand('tasklist', ['/FI', 'IMAGENAME eq chrome.exe', '/NH'], { env: deps.env(), timeoutMs: 5000 })).output) } catch { return false }
  }
  const open = async (requestedPort?: number) => {
    const port = Math.max(1024, Math.min(Number(requestedPort) || deps.config().cdpPort || 9222, 65535))
    if (!cdpBase()) await deps.persist({ cdpPort: port, cdpUrl: `http://127.0.0.1:${port}` })
    const before = await probe(1200)
    if (before.ok) return { ...before, already: true }
    const executable = chrome().path
    if (!executable) return { ok: false, error: '没找到 Chrome，请设置 chromePath' }
    if (await running()) return { ok: false, needClose: true, chrome: executable, hint: '先关闭所有 Chrome 窗口及后台进程，再打开调试端口' }
    const env = deps.env()
    const userDataDir = process.platform === 'win32' ? join(env.LOCALAPPDATA || '', 'Google/Chrome/User Data') : process.platform === 'darwin' ? join(homedir(), 'Library/Application Support/Google/Chrome') : join(homedir(), '.config/google-chrome')
    const args = [`--remote-debugging-port=${port}`, '--remote-allow-origins=*', '--no-first-run', '--no-default-browser-check']
    if (existsSync(userDataDir)) args.push(`--user-data-dir=${userDataDir}`)
    args.push('https://www.douyin.com/')
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, args, { detached: true, stdio: 'ignore', env, shell: false, windowsHide: false })
      child.once('error', reject); child.once('spawn', () => { child.unref(); resolve() })
    })
    const deadline = Date.now() + 20000
    while (Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 700))
      const result = await probe(1200)
      if (result.ok) return { ...result, started: true, chrome: executable, userDataDir }
    }
    return { ok: false, error: '20s 内 CDP 端口没起来', chrome: executable, url: cdpBase() }
  }
  const markLogin = (loggedIn: boolean) => state.bump({ loggedIn, loginCheckedAt: new Date().toISOString() })
  const result = async (name: string, args: Record<string, unknown> = {}) => {
    const value = await deps.invoke(name, args, { timeoutMs: 90000 })
    const data = object(value) ? value : { ok: false, error: '登录返回格式无效' }
    if (typeof data.loggedIn === 'boolean') markLogin(data.loggedIn)
    if (data.loggedIn && existsSync(paths.file('.login-browser'))) {
      rmSync(paths.file('.login-browser'), { force: true }); await deps.restart()
    }
    return data
  }
  const qr = async () => {
    const data = await result('douyin_login_qr')
    const png = paths.file('login-qr.png')
    const pngExists = existsSync(png)
    return { ...data, ok: data.ok !== false && pngExists, png, pngExists, qr: pngExists ? 'data:image/png;base64,' + readFileSync(png).toString('base64') : null }
  }
  const visible = async (show: boolean) => {
    const flag = paths.file('.login-browser')
    mkdirSync(join(paths.root, 'state'), { recursive: true, mode: 0o700 })
    if (show) writeFileSync(flag, String(Date.now()), { mode: 0o600 }); else rmSync(flag, { force: true })
    await deps.restart()
    return { ok: true, hint: show ? '浏览器窗口已打开，请在其中完成登录' : '已切回后台无头模式' }
  }
  return { cdpBase, chrome, probe, running, open, markLogin, qr, visible,
    whoami: () => result('douyin_whoami'), poll: () => result('douyin_login_poll'),
    sms: (phone: string) => result('douyin_login_sms', { phone }), submit: (code: string) => result('douyin_login_sms_submit', { code }),
  }
}
export type Browser = ReturnType<typeof createBrowser>
