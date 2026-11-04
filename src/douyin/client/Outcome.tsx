import { useText } from './messages.js'
import { type ReactNode } from 'react'
import { record, rows, type Data } from './api.js'

/** Human-readable outcomes stay visible; the diagnostic disclosure remains available. */
export function Outcome({ value }: { value: Data | null }): ReactNode {
  const t = useText()
 if (!value) return null
  const fields: [string, unknown][] = [
    ['结果', typeof value.ok === 'boolean' ? value.ok ? '成功' : '未完成' : undefined], ['状态', value.status], ['提示', value.note || value.hint || value.message || value.skipped], ['错误', value.error],
    ['本次回复', value.sent ?? value.replied], ['本次选片', value.picked], ['目标条数', value.want], ['今日累计', value.today ?? value.usedToday],
    ['发送确认', typeof value.verified === 'boolean' ? value.verified ? '已确认' : '发送状态未知，请先核对' : undefined],
    ['本地版本', value.local], ['上游最新版本', value.latest], ['可用更新', typeof value.hasUpdate === 'boolean' ? value.hasUpdate ? '有更新，需手动升级' : '已是当前版本' : undefined],
    ['开始后台任务', typeof value.started === 'boolean' ? value.started ? '已启动' : '未启动' : undefined],
  ]
  const items = rows(value.items)
  return <section aria-live="polite"><dl>{fields.filter(([, item]) => item !== undefined && item !== '').map(([label, item]) => <div key={t(label)}><dt>{t(label)}</dt><dd>{String(item)}</dd></div>)}</dl>
    {items.length > 0 && <ul>{items.map((item, index) => <li key={String(item.cid || item.name || index)}><strong>{String(item.name || item.to || item.aweme_id || '')}</strong> · {item.ok === true || item.sent === true ? '成功' : item.ok === false || item.sent === false ? '未完成' : ''} {String(item.detail || item.comment || item.text || '')}{Boolean(item.reply) && <p>回复：{String(item.reply)}</p>}{Boolean(item.error) && <p role="alert">{String(item.error)}</p>}{Boolean(item.skipped) && <p>{String(item.skipped)}</p>}{Boolean(item.fix) && <p>修复建议：{String(item.fix)}</p>}</li>)}</ul>}
    {value.tail !== undefined && <pre>{String(value.tail || '日志为空')}</pre>}
    {Boolean(record(value.mcp).hint) && <p>{String(record(value.mcp).hint)}</p>}
  </section>
}
