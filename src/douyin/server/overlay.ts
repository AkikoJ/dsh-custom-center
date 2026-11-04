import { mkdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DouyinConfig } from '../config.js'
import { within, type DouyinPaths } from './paths.js'
import { douyinResources } from './resources.js'
import type { PythonCommand } from './python-runtime.js'

const READ_TOOLS = ['douyin_feed', 'douyin_hot', 'douyin_hot_videos', 'douyin_search', 'douyin_video', 'douyin_comments', 'douyin_my_posts', 'douyin_watch', 'douyin_thumb', 'douyin_check_credential']
export function headlessTools(config: DouyinConfig, recipient = ''): ReadonlySet<string> {
  const tools = new Set(READ_TOOLS)
  if (recipient) { tools.add('douyin_chat_send'); tools.add('douyin_chat_sticker'); return tools }
  if (config.autoLike) tools.add('douyin_like')
  if (config.autoComment || config.autoCommentPlain || config.autoReply) tools.add('douyin_comment')
  if (config.autoPublish) tools.add('douyin_publish')
  if (config.msgAllowTo.trim()) for (const name of ['douyin_share_video', 'douyin_chat_send', 'douyin_chat_sticker', 'douyin_chat_batch']) tools.add(name)
  return tools
}
const scalar = (value: unknown) => JSON.stringify(String(value))
export function overlayText(options: { config: DouyinConfig; python: PythonCommand; script: string; env: NodeJS.ProcessEnv; proxy: { url: string; token: string }; tools: ReadonlySet<string> }): string {
  const { config, python, script, proxy, tools } = options
  const lines: string[] = []
  for (const id of ['credentials', 'authorization', 'deepseek-account']) lines.push('- id: ' + id, '  disabled: false', '')
  const forced = config.headlessModel.trim() || 'deepseek-account/deepseek-flash'
  const slash = forced.indexOf('/')
  if (slash > 0 && slash < forced.length - 1) lines.push('- id: agent-default-model', '  config:', '    provider: ' + scalar(forced.slice(0, slash)), '    model: ' + scalar(forced.slice(slash + 1)), '')
  lines.push('- id: tools', '  config:', '    mode: native', '', '- id: headless-runner', '  inject: [headlessStartup, douyinHeadlessGuard]', '')
  lines.push('- insert:', '    - id: douyin-headless-guard', '      name: ' + scalar(join(douyinResources().root, '../../lib/douyin-headless-guard.js')), '      config:', '        tools:', ...[...tools].map((tool) => '          - ' + scalar(tool)), '')
  lines.push('- insert:', '    - id: mcp-douyin-duty', "      name: '@deepseek-ai/dsh-mcp-client'", '      config:', '        serverName: douyin-duty', '        failOnStartupError: true', '        transport: stdio', '        command: ' + scalar(python.command), '        args:', ...[...python.args, script].map((arg) => '          - ' + scalar(arg)), '        env:')
  const env: NodeJS.ProcessEnv = { ...options.env, DOUYIN_ALLOW_WRITES: '1', DOUYIN_PROXY_URL: proxy.url, DOUYIN_PROXY_TOKEN: proxy.token, DOUYIN_MCP_TOOLS: [...tools].join(',') }
  // Do not serialize inherited credentials or arbitrary host environment into a file.
  const keys = ['DSH_CUSTOM_CENTER_DOUYIN_HOME', 'DSH_DOUYIN_HOME', 'DOUYIN_CACHE_HOME', 'DOUYIN_VIDEO_LAB', 'DOUYIN_PROFILE_PORT', 'DOUYIN_HEADLESS', 'DOUYIN_CDP_URL', 'DOUYIN_CHROME_PATH', 'TEMP', 'TMP', 'TMPDIR', 'UV_CACHE_DIR', 'UV_TOOL_DIR', 'UV_PYTHON_INSTALL_DIR', 'HF_HOME', 'HUGGINGFACE_HUB_CACHE', 'PYTHONDONTWRITEBYTECODE', 'PYTHONUTF8', 'PYTHONIOENCODING', 'PYTHONUNBUFFERED', 'DOUYIN_ALLOW_WRITES', 'DOUYIN_PROXY_URL', 'DOUYIN_PROXY_TOKEN', 'DOUYIN_MCP_TOOLS']
  for (const key of keys) if (env[key] !== undefined) lines.push('          ' + key + ': ' + scalar(env[key]))
  return lines.join('\n') + '\n'
}
export function writeOverlay(paths: DouyinPaths, runId: string, text: string): string {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(runId)) throw new Error('后台轮次标识无效')
  mkdirSync(paths.runtime, { recursive: true, mode: 0o700 })
  if (!within(realpathSync(paths.root), realpathSync(paths.runtime))) throw new Error('后台配置目录越过数据根')
  const file = join(paths.runtime, `headless-${runId}.yml`)
  writeFileSync(file, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  return file
}
export function removeOverlay(paths: DouyinPaths, runId: string, file: string): void {
  const expected = join(paths.runtime, `headless-${runId}.yml`)
  if (file !== expected || !within(realpathSync(paths.root), realpathSync(paths.runtime))) throw new Error('后台配置清理路径越界')
  unlinkSync(file)
}
