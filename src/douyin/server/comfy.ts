import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { DouyinConfig } from '../config.js'
import { object } from './ledger-model.js'
import { currentExecution } from './execution-context.js'
import { within } from './paths.js'

export interface VideoFile { path: string; name: string; size: number; mtime: number; mtimeText: string }
interface ComfyDependencies {
  config(): DouyinConfig
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  log?: (text: string) => void
}
export function createComfy(deps: ComfyDependencies) {
  const request = deps.fetch ?? fetch, now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)))
  const base = () => deps.config().comfyUrl.trim().replace(/\/+$/, '')
  const list = (limit?: number) => {
    const config = deps.config(), root = config.comfyOutputDir.trim(), found: VideoFile[] = []
    const walk = (directory: string, depth: number) => {
      if (depth > 6 || found.length > 20000) return
      let entries
      try { entries = readdirSync(directory, { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue
        const path = join(directory, entry.name)
        if (entry.isDirectory()) { walk(path, depth + 1); continue }
        if (!entry.isFile() || !/\.mp4$/i.test(entry.name)) continue
        try { const stat = statSync(path); found.push({ path, name: entry.name, size: stat.size, mtime: stat.mtimeMs, mtimeText: stat.mtime.toISOString() }) } catch { /* Concurrent removal is harmless. */ }
      }
    }
    if (root) walk(resolve(root), 0)
    found.sort((a, b) => b.mtime - a.mtime)
    return { dir: root, exists: !!root && existsSync(root), total: found.length, items: found.slice(0, Math.max(1, Math.min(Number(limit) || config.comfyListLimit || 20, 200))) }
  }
  const json = async (path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<unknown> => {
    const inherited = currentExecution().signal
    inherited?.throwIfAborted()
    const response = await request(base() + path, { ...init, signal: inherited ? AbortSignal.any([inherited, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) })
    const text = await response.text()
    if (!response.ok) throw new Error(`ComfyUI ${path} → HTTP ${response.status} ${text.slice(0, 200)}`)
    try { return text ? JSON.parse(text) : null } catch { return text }
  }
  const runWorkflow = async () => {
    const config = deps.config(), raw = config.comfyWorkflow.trim()
    if (!raw) return { ok: false, skipped: true, hint: '没配 comfyWorkflow，直接取输出目录里最新的成片' }
    const source = !/^[[{]/.test(raw) && existsSync(raw) ? raw : 'inline'
    const workflow: unknown = JSON.parse(source === 'inline' ? raw : readFileSync(raw, 'utf8'))
    const prompt = object(workflow) && object(workflow.prompt) ? workflow.prompt : workflow
    const queued = await json('/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, client_id: 'dsh-custom-center-douyin' }) }, 20000)
    const id = object(queued) ? String(queued.prompt_id || queued.id || '') : ''
    if (!id) throw new Error('ComfyUI 没返回 prompt_id')
    deps.log?.(`ComfyUI 已排队（prompt_id=${id}），等出片`)
    const deadline = now() + Math.max(30, config.comfyWaitSeconds || 900) * 1000
    while (now() < deadline) {
      currentExecution().signal?.throwIfAborted()
      await sleep(2000)
      currentExecution().signal?.throwIfAborted()
      let history: unknown
      try { history = await json('/history/' + encodeURIComponent(id)) } catch { currentExecution().signal?.throwIfAborted(); continue }
      const entry = object(history) ? history[id] : null
      if (!object(entry)) continue
      const status = object(entry.status) ? entry.status : {}
      const messages = Array.isArray(status.messages) ? status.messages : []
      if (status.status_str === 'error' || messages.some((message) => Array.isArray(message) && message[0] === 'error')) throw new Error('ComfyUI 执行出错：' + JSON.stringify(status).slice(0, 300))
      if (status.completed !== true && status.status_str !== 'success') continue
      if (!config.comfyOutputDir.trim()) throw new Error('没有配置 ComfyUI 输出目录')
      const root = realpathSync(resolve(config.comfyOutputDir)), files: string[] = []
      for (const output of Object.values(object(entry.outputs) ? entry.outputs : {})) {
        if (!object(output)) continue
        for (const media of [...(Array.isArray(output.videos) ? output.videos : []), ...(Array.isArray(output.gifs) ? output.gifs : [])]) {
          if (!object(media) || media.type !== 'output' || !/\.mp4$/i.test(String(media.filename || ''))) continue
          const path = resolve(root, String(media.subfolder || ''), String(media.filename || ''))
          if (!within(root, path)) throw new Error('ComfyUI 输出路径越界')
          if (!existsSync(path)) continue
          const physical = realpathSync(path)
          if (!within(root, physical)) throw new Error('ComfyUI 输出符号链接越界')
          if (statSync(physical).isFile()) files.push(path)
        }
      }
      if (files.length !== 1) throw new Error(`当前工作流有 ${files.length} 个有效 MP4 输出，请显式指定 video_path`)
      return { ok: true, promptId: id, source, video: files[0] }
    }
    throw new Error(`等 ComfyUI 出片超时（${config.comfyWaitSeconds || 900}s）`)
  }
  return { base, list, runWorkflow }
}
export type Comfy = ReturnType<typeof createComfy>
