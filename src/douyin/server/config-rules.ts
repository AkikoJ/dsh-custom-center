import { DEFAULTS, type DouyinConfig } from '../config.js'

type ConfigValue = DouyinConfig[keyof DouyinConfig]
const bounds: Record<string, [number, number, number]> = {
  perDay: [0, 50, 0], commentPerRound: [0, 20, 0], comfyWaitSeconds: [30, 7200, 900],
  comfyListLimit: [1, 200, 20], commentPerDay: [0, 50, 0], replyPerRun: [0, 20, 0],
  replyPerDay: [0, 1000, 0], replyIntervalMin: [5, 1440, 30], replyWorksDays: [1, 90, 1],
  sharePerDay: [0, 50, 0], pickPerRound: [1, 5, 1], watchSeconds: [15, 600, 90],
  watchFrames: [3, 48, 10], skipOverMin: [1, 600, 60], skimOverMin: [1, 120, 5],
  plainCommentPerDay: [0, 30, 0], dmAutoIntervalSec: [5, 120, 15],
  dmReplyPerContact: [1, 10, 1], dmReplyPerDay: [0, 100, 0], streakPerDay: [0, 20, 0],
  publishPerDay: [0, 20, 0], cdpPort: [1024, 65535, 9223],
}
const lengths: Record<string, number> = {
  personaPrompt: 4000, comfyWorkflow: 400000, myNickname: 40, shareNote: 80,
  msgAllowTo: 200, dmReplyOnlyTo: 120, dmFastProvider: 40, dmFastModel: 120,
  dmFastReasoning: 20, shareToNick: 40, streakNick: 40, publishTitle: 120,
  publishTags: 200, headlessModel: 80,
}
const trimmed = ['comfyOutputDir', 'chromePath', 'dshBin', 'workspace']

export function normalizeConfig(source: unknown, base: DouyinConfig = DEFAULTS): DouyinConfig {
  const input = source && typeof source === 'object' ? source as Record<string, unknown> : {}
  const out: Record<string, ConfigValue> = { ...base, keywords: [...base.keywords] }
  for (const [key, initial] of Object.entries(base)) {
    const value = input[key]
    if (value == null) continue
    if (Array.isArray(initial)) {
      if (Array.isArray(value)) out[key] = value.filter((item): item is string => typeof item === 'string')
    } else if (typeof initial === 'number') {
      const number = Number(value)
      if (Number.isInteger(number) && number >= 0) out[key] = number
    } else if (typeof value === typeof initial) out[key] = value as ConfigValue
  }
  return out as DouyinConfig
}

/** Shared validation for file loads, tools, settings and HTTP. */
export function clampPatch(input: unknown): Partial<DouyinConfig> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('配置必须是对象')
  const patch = { ...input } as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(DEFAULTS, key)) throw new Error(`未知配置字段：${key}`)
    const initial = DEFAULTS[key as keyof DouyinConfig]
    if (typeof initial === 'boolean' && typeof value !== 'boolean') throw new Error(`${key} 必须是布尔值`)
    if (typeof initial === 'number' && (typeof value !== 'number' || !Number.isInteger(value) || value < 0)) throw new Error(`${key} 必须是非负整数`)
    if (typeof initial === 'string' && typeof value !== 'string') throw new Error(`${key} 必须是字符串`)
    if (Array.isArray(initial) && (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))) throw new Error(`${key} 必须是字符串数组`)
    if (bounds[key]) {
      const [minimum, maximum, fallback] = bounds[key]
      patch[key] = Math.max(minimum, Math.min(Number(value) || fallback, maximum))
    }
    if (lengths[key]) patch[key] = String(value || '').slice(0, lengths[key])
    if (trimmed.includes(key)) patch[key] = String(value || '').trim()
  }
  if ('reportLevel' in patch) patch.reportLevel = ['full', 'brief', 'off'].includes(String(patch.reportLevel)) ? patch.reportLevel : 'full'
  if ('mentionName' in patch) patch.mentionName = String(patch.mentionName || '').trim().slice(0, 60)
  if ('keywords' in patch) patch.keywords = (patch.keywords as string[]).filter((word) => word.trim()).slice(0, 30)
  for (const key of ['comfyUrl', 'cdpUrl']) if (key in patch) patch[key] = String(patch[key] || '').trim().replace(/\/+$/, '')
  if ('pythonPath' in patch) patch.pythonPath = String(patch.pythonPath || 'python').trim()
  if ('replyVideoIds' in patch) patch.replyVideoIds = String(patch.replyVideoIds || '').replace(/[^0-9,\s]/g, '').slice(0, 400)
  if ('streakSticker' in patch) patch.streakSticker = String(patch.streakSticker || '大肥鱼').slice(0, 20)
  if ('headlessProfile' in patch) patch.headlessProfile = String(patch.headlessProfile || 'headless').trim()
  return patch as Partial<DouyinConfig>
}
