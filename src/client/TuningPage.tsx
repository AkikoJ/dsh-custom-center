/**
 * The Context and Compaction settings page.
 *
 * Its own `settings.section` nav entry, next to the appearance page. The form
 * itself lives in {@link TuningPanel}; this file only owns the page frame and
 * the copy that used to sit above the in-page tab bar.
 */
import { TuningPanel } from './TuningPanel.tsx'

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
