import { useEffect, useMemo, useState } from "react";
import { COMPACTION_DEFAULTS, RECOMMENDED, computeCompaction, validateCompactionValues } from "../rules.js";
import { buildTargetOptions, modelsInScope, parseTargetKey, snapshotModels, targetKeyOfModel } from "../targets.js";
import { type CompactionComputation, type CompactionValues, type ModelEntryView, type PresetTuningView, type TuningSnapshot } from "../contracts.js";
import { loadTuning, saveTuning, type TuningSaveBody } from "./api-client.js";

type ComputedView =
  | { ok: true; value: CompactionComputation }
  | { ok: false; error: string }

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function integer(value: string): number | undefined {
  if (value.trim().length === 0) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : undefined
}

function decimal(value: string): number | undefined {
  if (value.trim().length === 0) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Target the tab opens on: the current default model, else the first editable one. */
function initialTarget(models: readonly ModelEntryView[]): string {
  const pick = models.find((entry) => entry.isCurrent === true && entry.editable)
    ?? models.find((entry) => entry.editable)
    ?? models[0]
  return pick === undefined ? '' : targetKeyOfModel(pick.provider, pick.model)
}

/** The model whose values the form shows for a target. */
function sampleModel(models: readonly ModelEntryView[], key: string): ModelEntryView | undefined {
  const scoped = modelsInScope(models, key).filter((entry) => entry.editable)
  return scoped.find((entry) => entry.isCurrent === true) ?? scoped[0] ?? modelsInScope(models, key)[0]
}

export function useTuningForm() {
  const [snap, setSnap] = useState<TuningSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [presetId, setPresetId] = useState('')
  const [targetKey, setTargetKey] = useState('')
  const [contextWindow, setContextWindow] = useState('')
  const [maxTokens, setMaxTokens] = useState('')
  const [auto, setAuto] = useState<boolean>(COMPACTION_DEFAULTS.auto)
  const [thresholdRatio, setThresholdRatio] = useState(String(COMPACTION_DEFAULTS.thresholdRatio))
  const [headroom, setHeadroom] = useState(String(COMPACTION_DEFAULTS.headroomTokens))
  const [retentionMode, setRetentionMode] = useState<'ratio' | 'tokens'>('ratio')
  const [retainRatio, setRetainRatio] = useState(String(COMPACTION_DEFAULTS.retainRatio))
  const [retainTokens, setRetainTokens] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [noticeTone, setNoticeTone] = useState<'clean' | 'dirty' | 'preview'>('clean')

  function applyPreset(id: string, source: TuningSnapshot): void {
    const preset = source.presets.find((row) => row.id === id)
    if (preset === undefined) return
    const policy = preset.compaction
    setAuto(policy.auto)
    setThresholdRatio(String(policy.thresholdRatio))
    setHeadroom(String(policy.headroomTokens))
    if (policy.retainTokens === undefined) {
      setRetentionMode('ratio')
      setRetainRatio(String(policy.retainRatio ?? COMPACTION_DEFAULTS.retainRatio))
      setRetainTokens('')
    } else {
      setRetentionMode('tokens')
      setRetainTokens(String(policy.retainTokens))
      setRetainRatio(String(COMPACTION_DEFAULTS.retainRatio))
    }
  }

  function applyTarget(models: readonly ModelEntryView[], key: string): void {
    const sample = sampleModel(models, key)
    setContextWindow(sample?.contextWindow === undefined ? '' : String(sample.contextWindow))
    setMaxTokens(sample?.maxTokens === undefined ? '' : String(sample.maxTokens))
  }

  function applySnapshot(next: TuningSnapshot, preferred?: string, preferredTarget?: string): void {
    setSnap(next)
    const models = snapshotModels(next)
    const key = preferredTarget !== undefined && modelsInScope(models, preferredTarget).length > 0
      ? preferredTarget
      : initialTarget(models)
    setTargetKey(key)
    applyTarget(models, key)
    const chosen = preferred !== undefined && next.presets.some((row) => row.id === preferred)
      ? preferred
      : next.selectedPreset ?? next.presets[0]?.id ?? ''
    setPresetId(chosen)
    applyPreset(chosen, next)
    setDirty(false)
  }

  async function reload(preferred?: string, preferredTarget?: string): Promise<void> {
    setLoading(true)
    setLoadError(null)
    try {
      applySnapshot(await loadTuning(), preferred, preferredTarget)
    } catch (error) {
      setLoadError(messageOf(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // Mount-only: the tab reloads explicitly after every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const preset: PresetTuningView | undefined = snap?.presets.find((row) => row.id === presetId)
  const models = useMemo(() => (snap === null ? [] : snapshotModels(snap)), [snap])
  const targetOptions = useMemo(() => buildTargetOptions(models), [models])
  const scoped = useMemo(() => modelsInScope(models, targetKey), [models, targetKey])
  const scopedEditable = useMemo(() => scoped.filter((entry) => entry.editable), [scoped])
  const target = parseTargetKey(targetKey)
  const isGroup = target !== undefined && target.scope !== 'model'
  const modelEditable = scopedEditable.length > 0
  const mixedValues = isGroup && scopedEditable.some((entry) =>
    entry.contextWindow !== scopedEditable[0]?.contextWindow || entry.maxTokens !== scopedEditable[0]?.maxTokens)
  const sample = scoped.length === 1 ? scoped[0] : undefined

  const draft = useMemo<CompactionValues>(() => {
    const values: CompactionValues = {
      auto,
      thresholdRatio: decimal(thresholdRatio) ?? Number.NaN,
      headroomTokens: integer(headroom) ?? Number.NaN,
    }
    if (retentionMode === 'tokens') values.retainTokens = integer(retainTokens) ?? Number.NaN
    else values.retainRatio = decimal(retainRatio) ?? Number.NaN
    return values
  }, [auto, thresholdRatio, headroom, retentionMode, retainRatio, retainTokens])

  const computed = useMemo<ComputedView>(() => {
    const width = integer(contextWindow)
    const reserve = integer(maxTokens)
    if (width === undefined || reserve === undefined) {
      return { ok: false, error: '最大上下文和输出预留都必须是整数。' }
    }
    try {
      return { ok: true, value: computeCompaction(width, reserve, validateCompactionValues(draft)) }
    } catch (error) {
      return { ok: false, error: messageOf(error) }
    }
  }, [contextWindow, maxTokens, draft])

  function touch(): void {
    setDirty(true)
    setNotice('')
    setNoticeTone('dirty')
  }

  function choosePreset(id: string): void {
    setPresetId(id)
    if (snap !== null) applyPreset(id, snap)
    // Loading another preset's values is not itself an edit; keep any model
    // draft that is still unsaved.
    setNotice('')
  }

  function chooseTarget(key: string): void {
    setTargetKey(key)
    const next = parseTargetKey(key)
    if (next !== undefined && next.scope !== 'model') {
      // A group applies the numbers already typed; selecting one is an edit.
      touch()
      return
    }
    applyTarget(models, key)
    setNotice('')
  }

  function restoreRecommended(): void {
    if (modelEditable) {
      setContextWindow(String(RECOMMENDED.contextWindow))
      setMaxTokens(String(RECOMMENDED.maxTokens))
    }
    if (preset?.editable === true) {
      setAuto(RECOMMENDED.auto)
      setThresholdRatio(String(RECOMMENDED.thresholdRatio))
      setHeadroom(String(RECOMMENDED.headroomTokens))
      setRetentionMode('ratio')
      setRetainRatio(String(RECOMMENDED.retainRatio))
      setRetainTokens('')
    }
    touch()
  }

  async function save(): Promise<void> {
    if (preset === undefined) return
    const body: TuningSaveBody = {}
    if (modelEditable) {
      const width = integer(contextWindow)
      const reserve = integer(maxTokens)
      if (width === undefined || reserve === undefined) {
        setNotice('最大上下文和输出预留都必须是整数。')
        setNoticeTone('preview')
        return
      }
      if (reserve >= width) {
        setNotice('输出预留必须小于最大上下文。')
        setNoticeTone('preview')
        return
      }
      body.model = { contextWindow: width, maxTokens: reserve }
      if (target !== undefined) body.target = target
    }
    if (preset.editable) {
      if (!computed.ok) {
        setNotice(computed.error)
        setNoticeTone('preview')
        return
      }
      body.presetId = preset.id
      body.compaction = draft
    }
    if (body.model === undefined && body.compaction === undefined) {
      setNotice('没有可保存的设置。')
      setNoticeTone('preview')
      return
    }
    setSaving(true)
    try {
      const result = await saveTuning(body)
      await reload(preset.id, targetKey)
      setNotice(
        result.models > 1
          ? `已保存，最大上下文写入 ${result.models} 个模型。下一次请求起生效；压缩设置对之后新建的会话生效。`
          : '已保存。最大上下文下一次请求起生效；压缩设置对之后新建的会话生效。',
      )
      setNoticeTone('clean')
    } catch (error) {
      setNotice(`保存失败：${messageOf(error)}`)
      setNoticeTone('preview')
    } finally {
      setSaving(false)
    }
  }

  return {
    snap, loading, loadError, presetId, targetKey, contextWindow, maxTokens,
    auto, thresholdRatio, headroom, retentionMode, retainRatio, retainTokens,
    dirty, saving, notice, noticeTone, setContextWindow, setMaxTokens,
    setAuto, setThresholdRatio, setHeadroom, setRetentionMode,
    setRetainRatio, setRetainTokens, reload, preset, models, targetOptions,
    scoped, scopedEditable, mixedValues, modelEditable, isGroup, sample,
    computed, touch, choosePreset, chooseTarget, restoreRecommended, save,
  };
}
export type TuningForm = ReturnType<typeof useTuningForm>;
