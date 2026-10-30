import { useTuningForm } from "./useTuningForm.js";
import { renderModelWindowPanel } from "./ModelWindowPanel.js";
import { renderCompactionPanel } from "./CompactionPanel.js";

export function TuningPanel(): JSX.Element {
  const form = useTuningForm();
  const {
    snap, loading, loadError, dirty, saving, notice, noticeTone,
    reload, preset, modelEditable, restoreRecommended, save,
  } = form;
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

  const locked = preset?.editable !== true

  return (
    <div className="dsh-cc-tuning">
      {renderModelWindowPanel(form)}
      {renderCompactionPanel(form, snap)}

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

/** The context / compaction settings page. */
export function TuningPage(): JSX.Element {
  return (
    <div className="dsh-cc-page">
      <header className="dsh-cc-header">
        <h2 className="dsh-cc-heading">上下文与压缩</h2>
        <p className="dsh-cc-intro">
          设置当前模型的最大上下文与每个 agent preset 的自动压缩阈值；保存后写入当前 profile，最大上下文下一次请求起生效，压缩设置对之后新建的会话生效。
        </p>
      </header>
      <TuningPanel />
    </div>
  )
}
