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
      account: { nickname: String(previous.nickname || ''), hasAvatar: Boolean(previous.avatarUrl) },
      home: paths.root, report, reportExists: existsSync(report), python: { ...python, exists: python.via !== 'config' || existsSync(python.command) },
      mcpScript: runtime.script, mcpScriptReady: existsSync(runtime.script), mcpRunning: runtime.running(), dshCli: deps.dshCli(),
      comfy: { url: cfg.comfyUrl, outputDir: cfg.comfyOutputDir, outputDirExists: !!cfg.comfyOutputDir && existsSync(cfg.comfyOutputDir), workflow: !!cfg.comfyWorkflow.trim(), draftByDefault: cfg.publishDraft },
      cdp: { ...(await browser.probe(1200)), chrome: browser.chrome(), running: await browser.running() }, reportLevel: cfg.reportLevel,
    }
  }
  let cached: { at: number; result: Record<string, unknown> } | undefined
  let pending: Promise<Record<string, unknown>> | undefined
  const selfcheck = () => {
    if (pending) return pending
    pending = (async (): Promise<Record<string, unknown>> => {
      const cfg = deps.config(), python = runtime.python(), imports = await deps.setup.dependencies(python)
      let writable = false; try { accessSync(paths.root, constants.W_OK); writable = true } catch { /* Access result is shown below. */ }
      const items = [
        { id: 'home', name: '家目录可写', ok: writable, detail: paths.root, fix: '检查数据根目录权限', required: true },
        { id: 'python', name: 'Python 解释器及转写依赖', ok: imports.ok, detail: python.command, fix: '下载并安装运行环境，或配置 Python 3.11+ 解释器', required: true, action: 'setup', download: { label: '下载 Python', url: 'https://www.python.org/downloads/' } },
        { id: 'mcp-script', name: 'MCP 脚本', ok: existsSync(runtime.script), detail: runtime.script, fix: '重新安装运行环境，或检查安装包资源与运行时部署', required: true, action: 'setup' },
        { id: 'comfy-output', name: 'ComfyUI 输出目录', ok: !!cfg.comfyOutputDir && existsSync(cfg.comfyOutputDir), detail: cfg.comfyOutputDir, fix: '安装 ComfyUI 并在高级设置中配置 output 目录', required: cfg.autoPublish, action: 'configure', download: { label: '下载 ComfyUI', url: 'https://www.comfy.org/download' } },
        { id: 'video-prototype', name: '视频理解原型', ok: existsSync(join(runtime.resources.video, 'run.py')), detail: runtime.resources.video, fix: '重新安装运行环境，或检查安装包的视频理解资源', required: cfg.watchBeforeAct, action: 'setup' },
      ]
      let mcp: Record<string, unknown> = { ok: false, skipped: true, hint: 'Python 或脚本未就绪' }
      if (imports.ok && items[2]!.ok) try { mcp = resultObject(await deps.call('douyin_selfcheck', {}, { timeoutMs: 180000 })) } catch (error) { mcp = { ok: false, error: errorMessage(error) } }
      if (typeof mcp.loggedIn === 'boolean') browser.markLogin(mcp.loggedIn, mcp)
      const media = object(mcp.media) ? mcp.media : {}
      const mediaReady = !cfg.watchBeforeAct || media.ffmpegReady === true && media.dependenciesReady === true && media.modelCached === true
      const required = items.filter((item) => item.required)
      const ok = required.every((item) => item.ok) && mcp.ok === true && mcp.loggedIn === true && mcp.searched === true && mediaReady
      const issues: Record<string, unknown>[] = items.filter((item) => item.required && !item.ok).map((item) => ({ ...item }))
      if (mcp.ok !== true && imports.ok && items[2]!.ok) issues.push({ id: 'chrome', name: 'Chrome 浏览器与 MCP 连接', detail: String(mcp.error || mcp.hint || '浏览器连接失败'), fix: '下载 Chrome，或启动中心版专用 Chrome 后重新自检', action: 'chrome', download: { label: '下载 Chrome', url: 'https://www.google.com/chrome/' } })
      if (mcp.ok === true && mcp.loggedIn === true && mcp.searched !== true) issues.push({ id: 'search', name: '搜索连通性', detail: Array.isArray(mcp.notes) ? mcp.notes.join('\n') : String(mcp.error || '搜索自检未通过'), fix: '检查网络或平台访问状态后重新自检', action: 'selfcheck' })
      if (cfg.watchBeforeAct && Object.keys(media).length) {
        if (media.ffmpegReady !== true) issues.push({ id: 'ffmpeg', name: 'FFmpeg', detail: String(media.ffmpeg || '未找到 FFmpeg'), fix: '安装 FFmpeg 并确保它位于 PATH 中', download: { label: '下载 FFmpeg', url: 'https://ffmpeg.org/download.html' } })
        if (media.dependenciesReady !== true) issues.push({ id: 'media-dependencies', name: '视频转写依赖', detail: '转写依赖未就绪', fix: '下载并安装运行环境后重新自检', action: 'setup' })
        if (media.modelCached !== true) issues.push({ id: 'transcribe-model', name: '本地转写模型', detail: String(media.modelCache || '模型尚未缓存'), fix: '下载转写模型到缓存目录，或运行一次视频理解', download: { label: '下载转写模型', url: 'https://huggingface.co/Systran/faster-whisper-base' } })
      }
      return { ok, items, issues, mcp, home: paths.root, checkedAt: new Date().toISOString(), hint: ok ? '浏览器、登录、搜索及当前配置所需转写环境检查通过；页面发送仍需单独验收。' : '按失败项目的 fix 修复后重新自检。' }
    })().then((result) => { cached = { at: Date.now(), result }; return result }).finally(() => { pending = undefined })
    return pending
  }
  const environment = async () => cached && Date.now() - cached.at < 5 * 60 * 1000 ? { ...cached.result, cached: true } : selfcheck()
  const invalidateEnvironment = () => { cached = undefined }
  return { snapshot, selfcheck, environment, invalidateEnvironment }
}
export type Status = ReturnType<typeof createStatus>
