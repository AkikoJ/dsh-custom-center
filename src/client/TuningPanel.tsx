/**
 * The context / compaction tab.
 *
 * It reads the current model route and the compaction policy of every agent
 * preset from the host, then writes edits back through the profile
 * configuration editor. The token summary uses the exact formula the
 * compaction backend applies, so the preview matches what DSH will do.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  COMPACTION_DEFAULTS,
  RECOMMENDED,
  buildTargetOptions,
  computeCompaction,
  modelsInScope,
  parseTargetKey,
  snapshotModels,
  targetKeyOfModel,
  validateCompactionValues,
  type CompactionComputation,
  type CompactionValues,
  type ModelEntryView,
  type PresetTuningView,
  type TuningSnapshot,
} from '../core/tuning.ts'
import { Select } from './Select.tsx'
import { loadTuning, saveTuning, type TuningSaveBody } from './tuning.ts'

type ComputedView =
  | { ok: true; value: CompactionComputation }
  | { ok: false; error: string }

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function integer(value: string): number | undefined {
  if (value.trim().length === 0) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : undefined
}

function decimal(value: string): number | undefined {
  if (value.trim().length === 0) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

/** One settings row: label and description on the left, control on the right. */
function Row(props: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }): JSX.Element {
  return (
    <div className="dsh-cc-row">
      <div className="dsh-cc-row-text">
        {props.htmlFor === undefined ? (
          <span className="dsh-cc-row-label">{props.label}</span>
        ) : (
          <label className="dsh-cc-row-label" htmlFor={props.htmlFor}>{props.label}</label>
        )}
        {props.hint !== undefined && <span className="dsh-cc-row-hint">{props.hint}</span>}
      </div>
      <div className="dsh-cc-row-control">{props.children}</div>
    </div>
  )
}

/** Number input with an inline unit suffix. */
function NumberField(props: {
  id: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  unit?: string
}): JSX.Element {
  return (
    <span className={props.unit === undefined ? 'dsh-cc-input' : 'dsh-cc-input dsh-cc-input-unit'}>
      <input
        id={props.id}
        type="number"
        inputMode="decimal"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.unit !== undefined && <span className="dsh-cc-input-suffix" aria-hidden="true">{props.unit}</span>}
    </span>
  )
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

/** The settings-section page component for the tuning tab. */
export function TuningPanel(): JSX.Element {
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

  if (loading && snap === null) {
    return <p className="dsh-cc-hint">正在读取当前模型与压缩配置…</p>
  }

  if (loadError !== null) {
    return (
      <section className="dsh-cc-section">
        <h3 className="dsh-cc-section-title">无法读取配置</h3>
        <p className="dsh-cc-warn">{loadError}</p>
        <div className="dsh-cc-actions">
          <button type="button" className="dsh-cc-btn" onClick={() => void reload()}>重试</button>
        </div>
      </section>
    )
  }

  if (snap === null) return <p className="dsh-cc-hint">没有可显示的配置。</p>

  const statusText = saving
    ? '正在保存…'
    : notice.length > 0
      ? notice
      : dirty
        ? '有未保存的更改'
        : '已与 profile 同步'

  const windowWidth = integer(contextWindow)
  const thresholdShare =
    computed.ok && windowWidth !== undefined && windowWidth > 0
      ? Math.round((computed.value.thresholdTokens / windowWidth) * 100)
      : undefined
  const locked = preset?.editable !== true

  const reserveWidth = integer(maxTokens)
  const reserveShare =
    windowWidth !== undefined && windowWidth > 0 && reserveWidth !== undefined
      ? Math.min(100, Math.max(0, (reserveWidth / windowWidth) * 100))
      : undefined

  let scopeNote: ReactNode
  if (isGroup) {
    scopeNote = (
      <>
        将统一写入 {scopedEditable.length} 个模型
        {scoped.length > scopedEditable.length ? `，跳过 ${scoped.length - scopedEditable.length} 个只读模型` : ''}
        {mixedValues ? '。这些模型当前的值不一致，输入框显示的是其中一个模型的值' : ''}
      </>
    )
  } else if (sample !== undefined && sample.editable) {
    scopeNote = (
      <>
        保存到 <span className="dsh-cc-mono">{sample.entryId}</span>
        {sample.strategy === 'models' ? ' 的 models 列表' : ' 的 modelOverrides'}
      </>
    )
  }

  return (
    <div className="dsh-cc-tuning">
      <section className="dsh-cc-section">
        {models.length === 0 ? (
          <p className="dsh-cc-warn">当前没有可用的模型，无法读取最大上下文。</p>
        ) : (
          <div className="dsh-cc-rows">
            <Row label="应用范围" hint={scopeNote}>
              <Select ariaLabel="应用范围" value={targetKey} onChange={chooseTarget} options={targetOptions} />
            </Row>
            <Row label="最大上下文" hint={`模型一次可接收的内容量，推荐 ${RECOMMENDED.contextWindow}`} htmlFor="dsh-cc-window">
              <NumberField
                id="dsh-cc-window"
                unit="tokens"
                min={1}
                step={1000}
                value={contextWindow}
                disabled={!modelEditable}
                onChange={(value) => {
                  setContextWindow(value)
                  touch()
                }}
              />
            </Row>
            <Row label="输出预留" hint={`为模型回复预留的空间，推荐 ${RECOMMENDED.maxTokens}`} htmlFor="dsh-cc-reserve">
              <NumberField
                id="dsh-cc-reserve"
                unit="tokens"
                min={1}
                step={1000}
                value={maxTokens}
                disabled={!modelEditable}
                onChange={(value) => {
                  setMaxTokens(value)
                  touch()
                }}
              />
            </Row>
            {!modelEditable && (
              <p className="dsh-cc-warn">所选模型不在当前 profile 的可编辑条目中，最大上下文只读。</p>
            )}
          </div>
        )}
      </section>

      <section className="dsh-cc-section">
        <header className="dsh-cc-head">
          <h3 className="dsh-cc-section-title">自动压缩</h3>
          <p className="dsh-cc-hint">按 agent preset 独立配置，对之后新建的会话生效。</p>
        </header>
        <div className="dsh-cc-rows">
          <Row label="Agent preset">
            <Select
              ariaLabel="Agent preset"
              value={presetId}
              onChange={choosePreset}
              options={snap.presets.map((row) => ({
                value: row.id,
                label: `${row.name ?? row.id}${row.isDefault === true ? '（默认）' : ''}${row.editable ? '' : '（只读）'}`,
                disabled: !row.editable,
              }))}
            />
          </Row>
          <Row label="自动压缩与溢出恢复" hint="关闭后只能手动压缩" htmlFor="dsh-cc-auto">
            <span className="dsh-cc-switch">
              <input
                id="dsh-cc-auto"
                type="checkbox"
                role="switch"
                checked={auto}
                disabled={locked}
                onChange={(event) => {
                  setAuto(event.target.checked)
                  touch()
                }}
              />
            </span>
          </Row>
          {preset?.error !== undefined && <p className="dsh-cc-warn">{preset.error}</p>}
          {preset?.broken !== undefined && <p className="dsh-cc-warn">该 preset 激活失败：{preset.broken}</p>}
          <Row label="压缩阈值" hint={`用量达到最大上下文的该比例时压缩，推荐 ${RECOMMENDED.thresholdRatio}`} htmlFor="dsh-cc-ratio">
            <NumberField
              id="dsh-cc-ratio"
              min={0.05}
              max={1}
              step={0.01}
              value={thresholdRatio}
              disabled={locked}
              onChange={(value) => {
                setThresholdRatio(value)
                touch()
              }}
            />
          </Row>
          <Row label="压缩余量" hint={`距上限至少留出的空间，推荐 ${RECOMMENDED.headroomTokens}`} htmlFor="dsh-cc-headroom">
            <NumberField
              id="dsh-cc-headroom"
              unit="tokens"
              min={0}
              step={1024}
              value={headroom}
              disabled={locked}
              onChange={(value) => {
                setHeadroom(value)
                touch()
              }}
            />
          </Row>
          <Row label="近期保留方式" hint="压缩时逐字保留最近的这部分历史">
            <Select
              ariaLabel="近期保留方式"
              value={retentionMode}
              disabled={locked}
              onChange={(next) => {
                setRetentionMode(next === 'tokens' ? 'tokens' : 'ratio')
                touch()
              }}
              options={[
                { value: 'ratio', label: '按比例' },
                { value: 'tokens', label: '按固定 tokens' },
              ]}
            />
          </Row>
          {retentionMode === 'ratio' ? (
            <Row label="保留比例" hint={`占（最大上下文 − 输出预留）的比例，推荐 ${RECOMMENDED.retainRatio}`} htmlFor="dsh-cc-retain">
              <NumberField
                id="dsh-cc-retain"
                min={0.01}
                max={0.99}
                step={0.01}
                value={retainRatio}
                disabled={locked}
                onChange={(value) => {
                  setRetainRatio(value)
                  touch()
                }}
              />
            </Row>
          ) : (
            <Row label="保留数量" hint="固定保留的最近历史量" htmlFor="dsh-cc-retain">
              <NumberField
                id="dsh-cc-retain"
                unit="tokens"
                min={1}
                step={1024}
                value={retainTokens}
                disabled={locked}
                onChange={(value) => {
                  setRetainTokens(value)
                  touch()
                }}
              />
            </Row>
          )}
        </div>

        {computed.ok ? (
          <div className="dsh-cc-summary" role="status">
            <div className="dsh-cc-meter" aria-hidden="true">
              <span className="dsh-cc-meter-fill" style={{ width: `${thresholdShare ?? 0}%` }} />
              {reserveShare !== undefined && (
                <span className="dsh-cc-meter-reserve" style={{ width: `${reserveShare}%` }} />
              )}
            </div>
            <div className="dsh-cc-summary-items">
              <span className="dsh-cc-summary-item">
                <span className="dsh-cc-swatch dsh-cc-swatch-fill" aria-hidden="true" />
                压缩触发点
                <strong>{formatTokens(computed.value.thresholdTokens)}</strong>
                {thresholdShare !== undefined && <span className="dsh-cc-summary-dim">{thresholdShare}%</span>}
              </span>
              <span className="dsh-cc-summary-item">
                <span className="dsh-cc-swatch dsh-cc-swatch-reserve" aria-hidden="true" />
                输出预留
                <strong>{reserveWidth === undefined ? '-' : formatTokens(reserveWidth)}</strong>
              </span>
              <span className="dsh-cc-summary-item">
                逐字保留
                <strong>{formatTokens(computed.value.retainTokens)}</strong>
              </span>
            </div>
            <p className="dsh-cc-hint">触发点 = min(最大上下文 × 压缩阈值, 最大上下文 − 输出预留 − 压缩余量)</p>
          </div>
        ) : (
          <p className="dsh-cc-warn" role="status">{computed.error}</p>
        )}
      </section>

      <div className="dsh-cc-bar">
        <span className={`dsh-cc-status dsh-cc-status-${noticeTone}`} role="status">
          <span className="dsh-cc-dot" aria-hidden="true" />
          {statusText}
        </span>
        <div className="dsh-cc-actions">
          <button
            type="button"
            className="dsh-cc-btn"
            disabled={locked && !modelEditable}
            onClick={restoreRecommended}
          >
            恢复推荐值
          </button>
          <button
            type="button"
            className="dsh-cc-btn dsh-cc-btn-primary"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
