import { accessSync, constants, existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { DouyinConfig } from '../config.js'
import type { Invoke } from './action-executor.js'
import type { Ledger } from './ledger.js'
import type { RuntimeStateStore } from './state.js'
import type { Reports } from './reports.js'
import type { Browser } from './browser.js'
import type { PythonRuntime } from './python-runtime.js'
import type { Setup } from './setup.js'
import { resultObject } from './content.js'
import { object } from './ledger-model.js'
import { WINDOWS, inWindow } from './scheduler.js'
import { errorMessage } from './storage.js'

export function nextWindowInfo(now: Date, config: DouyinConfig) {
  if (!config.peakValley || config.perDay <= 0) return null
  const candidates = (['noon', 'night'] as const).filter((name) => config[name]).map((name) => {
    const window = WINDOWS[name], opening = inWindow(now, window), at = new Date(now)
    if (!opening) { const [hours, minutes] = window.start.split(':').map(Number); at.setHours(hours!, minutes!, 0, 0); if (at < now) at.setDate(at.getDate() + 1) }
    return { name, label: window.label, at: at.toISOString(), opening }
  })
  return candidates.sort((left, right) => left.at.localeCompare(right.at))[0] ?? null
}
interface StatusDependencies {
  config(): DouyinConfig
  ledger: Ledger
  state: RuntimeStateStore
  reports: Reports
  runtime: PythonRuntime
  setup: Pick<Setup, 'dependencies'>
  browser: Browser
  call: Invoke
  replyState(): unknown
  dshCli(): string
}
export function createStatus(deps: StatusDependencies) {
  const { ledger, state, reports, runtime, browser } = deps, paths = ledger.paths
  const snapshot = async () => {
    const cfg = deps.config(), now = ledger.now(), previous = state.read(), python = runtime.python(), report = reports.file(now)
    let scriptHash = ''; try { scriptHash = createHash('sha256').update(readFileSync(runtime.script)).digest('hex') } catch { /* Missing deployment is reported separately. */ }
    return {
      ok: true, today: ledger.day(), build: { version: runtime.resources.identity.version, upstream: runtime.resources.upstream, scriptHash },
      headless: previous.headless || null, ranToday: state.roundsToday(), pickedToday: ledger.picked(), watchedToday: ledger.watched(), perDay: cfg.perDay,
      leftToday: Math.max(0, cfg.perDay - ledger.picked()),
      windows: Object.fromEntries(Object.entries(WINDOWS).map(([name, window]) => [name, { ...window, switchOn: cfg[name as 'noon' | 'night'], opening: inWindow(now, window) }])),
      nextWindow: nextWindowInfo(now, cfg), peakValley: cfg.peakValley,
      gates: { autoLike: cfg.autoLike, autoComment: cfg.autoComment, autoPublish: cfg.autoPublish, autoReply: cfg.autoReply, mentionName: cfg.mentionName },
      doing: { todayComments: ledger.count('comment'), commentPerDay: cfg.commentPerDay, todayPublished: ledger.count('publish'), publishPerDay: cfg.publishPerDay, lastPublished: ledger.lastPublished(), todayReplies: ledger.count('reply'), replyTimer: deps.replyState(), replyPerDay: cfg.replyPerDay, replyPerRun: cfg.replyPerRun, myVideos: Object.values(ledger.read().published).filter((record) => !record.draft && (record.awemeId || record.aweme_id)).length },
      loggedIn: state.hasLogin(), loginCheckedAt: String(previous.loginCheckedAt || ''), loginQr: existsSync(paths.file('login-qr.png')) ? paths.file('login-qr.png') : '',
      home: paths.root, report, reportExists: existsSync(report), python: { ...python, exists: python.via !== 'config' || existsSync(python.command) },
      mcpScript: runtime.script, mcpScriptReady: existsSync(runtime.script), mcpRunning: runtime.running(), dshCli: deps.dshCli(),
      comfy: { url: cfg.comfyUrl, outputDir: cfg.comfyOutputDir, outputDirExists: !!cfg.comfyOutputDir && existsSync(cfg.comfyOutputDir), workflow: !!cfg.comfyWorkflow.trim(), draftByDefault: cfg.publishDraft },
      cdp: { ...(await browser.probe(1200)), chrome: browser.chrome(), running: await browser.running() }, reportLevel: cfg.reportLevel,
    }
  }
  const selfcheck = async () => {
    const cfg = deps.config(), python = runtime.python(), imports = await deps.setup.dependencies(python)
    let writable = false; try { accessSync(paths.root, constants.W_OK); writable = true } catch { /* Access result is shown below. */ }
    const items = [
      { name: '家目录可写', ok: writable, detail: paths.root, fix: '检查数据根目录权限' },
      { name: 'Python 解释器及转写依赖', ok: imports.ok, detail: python.command, fix: '运行环境安装，或配置 Python 3.11+ 解释器' },
      { name: 'MCP 脚本', ok: existsSync(runtime.script), detail: runtime.script, fix: '检查安装包资源与运行时部署' },
      { name: 'ComfyUI 输出目录', ok: !!cfg.comfyOutputDir && existsSync(cfg.comfyOutputDir), detail: cfg.comfyOutputDir, fix: '配置 ComfyUI output 目录' },
      { name: '视频理解原型', ok: existsSync(join(runtime.resources.video, 'run.py')), detail: runtime.resources.video, fix: '检查安装包的视频理解资源' },
    ]
    let mcp: Record<string, unknown> = { ok: false, skipped: true, hint: 'Python 或脚本未就绪' }
    if (imports.ok && items[2]!.ok) try { mcp = resultObject(await deps.call('douyin_selfcheck', {}, { timeoutMs: 180000 })) } catch (error) { mcp = { ok: false, error: errorMessage(error) } }
    if (typeof mcp.loggedIn === 'boolean') browser.markLogin(mcp.loggedIn)
    const media = object(mcp.media) ? mcp.media : {}
    const mediaReady = !cfg.watchBeforeAct || media.ffmpegReady === true && media.dependenciesReady === true && media.modelCached === true
    const required = items.filter((item, index) => index !== 3 && index !== 4 || index === 3 && cfg.autoPublish || index === 4 && cfg.watchBeforeAct)
    const ok = required.every((item) => item.ok) && mcp.ok === true && mcp.loggedIn === true && mcp.searched === true && mediaReady
    return { ok, items, mcp, home: paths.root, hint: ok ? '浏览器、登录、搜索及当前配置所需转写环境检查通过；页面发送仍需单独验收。' : '按失败项目的 fix 修复后重新自检。' }
  }
  return { snapshot, selfcheck }
}
export type Status = ReturnType<typeof createStatus>
