import { useEffect, useId, useRef, useState } from 'react'
import { pollLogin } from './login-poll.js'
import { record } from './api.js'
import { useResource, useActions } from './state.js'
import { Card, Feedback, Result } from './controls.js'
import { useText } from './messages.js'
export function Daily({ dirty }: { dirty: boolean }) {
 const t = useText(), status = useResource('/status'), action = useActions(), [phone, setPhone] = useState(''), [code, setCode] = useState(''), id = useId()
 const [reportDate, setReportDate] = useState(''), [showReport, setShowReport] = useState(false), report = useResource('/report/latest' + (reportDate ? '?date=' + encodeURIComponent(reportDate) : ''))
 const data = status.data || {}, doing = record(data.doing)
 const [qr, setQr] = useState(''), [loginStatus, setLoginStatus] = useState(''), polling = useRef<(() => void) | undefined>(undefined), alive = useRef(true)
 useEffect(() => { alive.current = true; return () => { alive.current = false; polling.current?.() } }, [])
 const run = async (path: string, args: Record<string, unknown> = {}) => {
  if (path === '/login/qr') { polling.current?.(); setQr(''); setLoginStatus('正在获取二维码') }
  const result = await action.run(path, path === '/update/check' ? undefined : args)
  if (!alive.current) return
   if (path === '/login/qr' && !result) setLoginStatus('二维码获取失败，请重试')
   if (path === '/login/qr' && result?.qr) { setQr(String(result.qr)); setLoginStatus('等待扫码确认'); polling.current = pollLogin(() => { setQr(''); status.refresh() }, setLoginStatus) }
  if (result?.loggedIn === true) { polling.current?.(); setQr(''); setLoginStatus('登录成功') }
  status.refresh()
 }
 const safeQr = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(qr)
 return <><Card title="账号与今日概况" aside={<span className="dy-account-state" data-active={Boolean(data.loggedIn)}><i className="dy-status-dot" data-active={Boolean(data.loggedIn)} aria-hidden="true" />{t(data.loggedIn ? '已登录' : '尚未登录')}</span>}><div className="dy-stats">{[['轮次', data.ranToday], ['已看视频', data.watchedToday], ['剩余额度', data.leftToday], ['今日回复', doing.todayReplies]].map(([label, value]) => <div key={String(label)}><span>{t(String(label))}</span><strong>{String(value ?? '—')}</strong></div>)}</div>
 <div className="dy-toolbar dy-daily-actions"><button disabled={dirty || !!action.busy} className="dy-primary" onClick={() => void run('/run')}>{t('立即刷一轮')}</button><button disabled={!!action.busy} onClick={() => { setShowReport((value) => !value); report.refresh() }}>{t(showReport ? '收起日报' : '查看日报')}</button><button disabled={!!action.busy} onClick={() => void action.run('/open', { what: 'out' })}>{t('打开报告目录')}</button><button disabled={!!action.busy} onClick={() => void run('/login/browser')}>{t('浏览器登录')}</button></div>{dirty && <p className="dy-dirty-hint" role="status">{t('运行前请保存更改')}</p>}
 <details className="dy-details"><summary>{t('更多登录方式与验证')}</summary><div className="dy-toolbar">{[['/login/browser/close','关闭登录窗口'],['/login/qr','截图登录'],['/login/poll','我扫完了']].map(([path, label]) => <button key={path} disabled={!!action.busy} onClick={() => void run(path)}>{t(label)}</button>)}</div>
 <div className="dy-toolbar"><label htmlFor={id + 'phone'}>{t('手机号')}</label><input id={id + 'phone'} type="tel" autoComplete="tel" maxLength={11} value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))} /><button disabled={!!action.busy || !!phone && !/^\d{11}$/.test(phone)} onClick={() => void run('/login/sms', { phone })}>{t('收验证码')}</button></div>
 <div className="dy-toolbar"><label htmlFor={id + 'code'}>{t('验证码')}</label><input id={id + 'code'} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} /><button disabled={!!action.busy || !/^\d{4,6}$/.test(code)} onClick={async () => { const result = await action.run('/login/sms/submit', { code }); if (result && alive.current) { setCode(''); if (result.loggedIn === true) { polling.current?.(); setQr(''); setLoginStatus('登录成功') } status.refresh() } }}>{t('提交验证码')}</button></div></details>
 {loginStatus && <p role="status">{t(loginStatus)}</p>}{safeQr && <img src={qr} className="dy-qr" alt={t('登录二维码')} />}
 <details className="dy-details"><summary>{t('连接与运行详情')}</summary><dl>{[['MCP', data.mcpRunning ? '运行中' : '未运行'], ['Chrome / CDP', record(data.cdp).ok ? '已连接' : '未连接'], ['版本', record(data.build).version], ['上游版本', record(record(data.build).upstream).version], ['后台轮次', record(data.headless).status || record(data.headless).reason || '空闲'], ['下次谷时窗口', [record(data.nextWindow).label, record(data.nextWindow).at ? new Date(String(record(data.nextWindow).at)).toLocaleString() : ''].filter(Boolean).join(' · ') || t('未启用')]].map(([label, value]) => <div key={String(label)}><dt>{t(String(label))}</dt><dd>{String(value ?? '—')}</dd></div>)}</dl><div className="dy-toolbar"><button disabled={!!action.busy} onClick={() => void run('/update/check')}>{t('检查更新')}</button><button onClick={status.refresh}>{t('刷新')}</button></div></details>
 <Feedback busy={action.busy} error={action.error || status.error} />{Boolean(action.result?.report) && <pre>{String(record(action.result?.report).text || '')}</pre>}<Result value={action.result} />
 {showReport && <section aria-label={t('日报')}><label htmlFor={id + 'report'}>{t('历史日报日期')}</label><select id={id + 'report'} value={reportDate} onChange={(event) => setReportDate(event.target.value)}><option value="">{t('最近一份')}</option>{Array.isArray(report.data?.dates) && report.data.dates.map((date) => <option key={String(date)} value={String(date)}>{String(date)}</option>)}</select><Feedback error={report.error} busy={!report.data && !report.error ? 'load' : ''} />{record(report.data?.report).text ? <pre>{String(record(report.data?.report).text)}</pre> : report.data && <p>{t('还没有日报')}</p>}</section>}
 </Card></>
}
