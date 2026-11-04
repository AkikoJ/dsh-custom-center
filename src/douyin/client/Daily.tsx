import { useId, useState } from 'react'
import { record } from './api.js'
import { useResource, useActions } from './state.js'
import { Card, Feedback, Result } from './controls.js'
import { useText } from './messages.js'
export function Daily({ dirty }: { dirty: boolean }) {
 const t = useText(), status = useResource('/status'), action = useActions(), [phone, setPhone] = useState(''), [code, setCode] = useState(''), id = useId()
 const data = status.data || {}, doing = record(data.doing)
 const run = async (path: string, args: Record<string, unknown> = {}) => { await action.run(path, args); status.refresh() }
 const qr = String(action.result?.qr || ''), safeQr = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(qr)
 return <><Card title="账号与今日概况"><p>{t(data.loggedIn ? '已登录' : '尚未登录')}</p><div className="dy-stats">{[['轮次', data.ranToday], ['已看视频', data.watchedToday], ['剩余额度', data.leftToday], ['今日回复', doing.todayReplies]].map(([label, value]) => <div key={String(label)}>{t(String(label))}<strong>{String(value ?? '—')}</strong></div>)}</div>
 <div className="dy-toolbar">{[['/login/browser','浏览器登录'],['/login/browser/close','关闭登录窗口'],['/login/qr','截图登录'],['/login/poll','我扫完了']].map(([path, label]) => <button key={path} disabled={!!action.busy} onClick={() => void run(path)}>{t(label)}</button>)}<button onClick={status.refresh}>{t('刷新')}</button></div>
 {safeQr && <img src={qr} className="dy-qr" alt={t('登录二维码')} />}
 <div className="dy-toolbar"><label htmlFor={id + 'phone'}>{t('手机号')}</label><input id={id + 'phone'} type="tel" autoComplete="tel" maxLength={11} value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))} /><button disabled={!!action.busy || !!phone && !/^\d{11}$/.test(phone)} onClick={() => void run('/login/sms', { phone })}>{t('收验证码')}</button></div>
 <div className="dy-toolbar"><label htmlFor={id + 'code'}>{t('验证码')}</label><input id={id + 'code'} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} /><button disabled={!!action.busy || !/^\d{4,6}$/.test(code)} onClick={() => { void run('/login/sms/submit', { code }); setCode('') }}>{t('提交验证码')}</button></div>
 <div className="dy-toolbar"><button disabled={dirty || !!action.busy} className="dy-primary" onClick={() => void run('/run')}>{t('立即刷一轮')}</button><button disabled={!!action.busy} onClick={() => void action.run('/report/latest')}>{t('查看日报')}</button><button disabled={!!action.busy} onClick={() => void action.run('/open', { what: 'out' })}>{t('打开报告目录')}</button></div>{dirty && <p>{t('运行前请保存更改')}</p>}
 <Feedback busy={action.busy} error={action.error || status.error} />{Boolean(action.result?.report) && <pre>{String(record(action.result?.report).text || '')}</pre>}<Result value={action.result} />
 </Card></>
}
