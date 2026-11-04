import { useId, useState } from 'react'
import { record } from './api.js'
import { useResource, useActions } from './state.js'
import { Card, Feedback, Result } from './controls.js'
import { useText } from './messages.js'

export function Daily({ dirty }: { dirty: boolean }) {
 const t = useText(), status = useResource('/status'), action = useActions(), id = useId()
 const [reportDate, setReportDate] = useState(''), [showReport, setShowReport] = useState(false), report = useResource('/report/latest' + (reportDate ? '?date=' + encodeURIComponent(reportDate) : ''))
 const data = status.data || {}, doing = record(data.doing)
 const run = async (path: string, args: Record<string, unknown> = {}) => {
  await action.run(path, path === '/update/check' ? undefined : args)
  status.refresh()
 }
 return <Card title="今日概况">
  <div className="dy-stats">{[['轮次', data.ranToday], ['已看视频', data.watchedToday], ['剩余额度', data.leftToday], ['今日回复', doing.todayReplies]].map(([label, value]) => <div key={String(label)}><span>{t(String(label))}</span><strong>{String(value ?? '—')}</strong></div>)}</div>
  <div className="dy-toolbar dy-daily-actions"><button disabled={dirty || !!action.busy} className="dy-primary" onClick={() => void run('/run')}>{t('立即刷一轮')}</button><button disabled={!!action.busy} onClick={() => { setShowReport((value) => !value); report.refresh() }}>{t(showReport ? '收起日报' : '查看日报')}</button><button disabled={!!action.busy} onClick={() => void action.run('/open', { what: 'out' })}>{t('打开报告目录')}</button></div>{dirty && <p className="dy-dirty-hint" role="status">{t('运行前请保存更改')}</p>}
  <details className="dy-details"><summary>{t('连接与运行详情')}</summary><dl>{[['MCP', data.mcpRunning ? '运行中' : '未运行'], ['Chrome / CDP', record(data.cdp).ok ? '已连接' : '未连接'], ['版本', record(data.build).version], ['上游版本', record(record(data.build).upstream).version], ['后台轮次', record(data.headless).status || record(data.headless).reason || '空闲'], ['下次谷时窗口', [record(data.nextWindow).label, record(data.nextWindow).at ? new Date(String(record(data.nextWindow).at)).toLocaleString() : ''].filter(Boolean).join(' · ') || t('未启用')]].map(([label, value]) => <div key={String(label)}><dt>{t(String(label))}</dt><dd>{String(value ?? '—')}</dd></div>)}</dl><div className="dy-toolbar"><button disabled={!!action.busy} onClick={() => void run('/update/check')}>{t('检查更新')}</button><button onClick={status.refresh}>{t('刷新')}</button></div></details>
  <Feedback busy={action.busy} error={action.error || status.error} />{Boolean(action.result?.report) && <pre>{String(record(action.result?.report).text || '')}</pre>}<Result value={action.result} />
  {showReport && <section aria-label={t('日报')}><label htmlFor={id + 'report'}>{t('历史日报日期')}</label><select id={id + 'report'} value={reportDate} onChange={(event) => setReportDate(event.target.value)}><option value="">{t('最近一份')}</option>{Array.isArray(report.data?.dates) && report.data.dates.map((date) => <option key={String(date)} value={String(date)}>{String(date)}</option>)}</select><Feedback error={report.error} busy={!report.data && !report.error ? 'load' : ''} />{record(report.data?.report).text ? <pre>{String(record(report.data?.report).text)}</pre> : report.data && <p>{t('还没有日报')}</p>}</section>}
 </Card>
}
