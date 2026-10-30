import { RECOMMENDED } from "../rules.js";
import { Select } from "./Select.js";
import type { TuningForm } from "./useTuningForm.js";
import { integer } from "./useTuningForm.js";
import { Row, NumberField, formatTokens } from "./fields.js";

export function renderCompactionPanel(form: TuningForm, snap: NonNullable<TuningForm["snap"]>) {
  const {
    presetId, contextWindow, maxTokens, auto, thresholdRatio, headroom,
    retentionMode, retainRatio, retainTokens, setAuto, setThresholdRatio,
    setHeadroom, setRetentionMode, setRetainRatio, setRetainTokens,
    preset, computed, touch, choosePreset,
  } = form;
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

  return (
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
  );
}
