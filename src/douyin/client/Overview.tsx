import { useText } from './messages.js'
import { record } from './api.js'
import { useActions, useResource } from './state.js'
import { Feedback } from './controls.js'
import { Outcome } from './Outcome.js'

export function Overview() {
 const t = useText(), status = useResource('/status'), action = useActions(), data = status.data || {}, build = record(data.build), cdp = record(data.cdp), headless = record(data.headless)
 return <section className="dy-overview" aria-label={t('运行概览')}>
  <div className="dy-status-line">
   <span><i className="dy-status-dot" data-active={Boolean(data.loggedIn)} aria-hidden="true" />{t(data.loggedIn ? '已登录' : '尚未登录')}</span>
   <span>{t('已看视频')} <strong>{String(data.watchedToday ?? '—')} / {String(data.perDay ?? '—')}</strong></span>
   <span>MCP <strong>{t(data.mcpRunning ? '运行中' : '未运行')}</strong></span>
   <span>CDP <strong>{t(cdp.ok ? '已连接' : '未连接')}</strong></span>
  </div>
  <div className="dy-overview-actions"><span>{t('版本')} {String(build.version || '—')} · {t('后台轮次')}：{String(headless.status || headless.reason || (headless.runId ? t('运行中') : t('空闲')))}</span><button onClick={status.refresh}>{t('刷新状态')}</button><button disabled={!!action.busy} onClick={() => void action.run('/update/check')}>{t('检查更新')}</button></div>
  <Feedback error={status.error || action.error} busy={action.busy} /><Outcome value={action.result} />
 </section>
}
