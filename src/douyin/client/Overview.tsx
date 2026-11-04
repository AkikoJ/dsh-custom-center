import { useText } from './messages.js'
import { record } from './api.js'
import { useActions, useResource } from './state.js'
import { Feedback } from './controls.js'
import { Outcome } from './Outcome.js'

export function Overview() {
 const t = useText(), status = useResource('/status'), action = useActions(), data = status.data || {}, build = record(data.build), cdp = record(data.cdp), headless = record(data.headless)
 return <section aria-label={t('运行概览')}><div className="dy-toolbar"><span>已看 {String(data.watchedToday ?? '—')} / {String(data.perDay ?? '—')}</span><span>MCP：{t(data.mcpRunning ? '运行中' : '未运行')}</span><span>登录：{t(data.loggedIn ? '已登录' : '尚未登录')}</span><span>CDP：{t(cdp.ok ? '已连接' : '未连接')}</span><span>版本 {String(build.version || '—')}</span><span>后台：{String(headless.status || headless.reason || (headless.runId ? '运行中' : '空闲'))}</span><button onClick={status.refresh}>{t("刷新状态")}</button><button disabled={!!action.busy} onClick={() => void action.run('/update/check')}>{t("检查更新")}</button></div><Feedback error={status.error || action.error} busy={action.busy} /><Outcome value={action.result} /></section>
}
