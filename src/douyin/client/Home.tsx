import { useEffect, useId, useRef, useState } from 'react'
import { pollLogin } from './login-poll.js'
import { record, type Data } from './api.js'
import { useResource, useActions } from './state.js'
import { Card, Feedback, Result } from './controls.js'
import { useText } from './messages.js'
import { AccountAvatar } from './AccountAvatar.js'
import { Environment } from './Environment.js'

export function Home({ dirty, onConfigure }: { dirty: boolean; onConfigure(): void }) {
 const t = useText(), status = useResource('/status'), account = useResource('/account'), action = useActions(), [phone, setPhone] = useState(''), [code, setCode] = useState(''), id = useId()
 const data = status.data || {}, savedAccount = record(data.account)
 const [qr, setQr] = useState(''), [loginStatus, setLoginStatus] = useState(''), [loginResult, setLoginResult] = useState<Data | null>(null), [loginBusy, setLoginBusy] = useState(false), polling = useRef<(() => void) | undefined>(undefined), alive = useRef(true)
 const online = typeof account.data?.loggedIn === 'boolean' ? account.data.loggedIn : Boolean(data.loggedIn)
 const nickname = String(account.data?.nickname || savedAccount.nickname || (online ? '抖音用户' : '未登录账号'))
 const hasAvatar = Boolean(account.data?.hasAvatar || savedAccount.hasAvatar), avatarVersion = String(account.data?.checkedAt || data.loginCheckedAt || '')
 useEffect(() => { alive.current = true; return () => { alive.current = false; polling.current?.() } }, [])
 const run = async (path: string, args: Record<string, unknown> = {}) => {
  if (path === '/login/qr') { polling.current?.(); setQr(''); setLoginStatus('正在获取二维码') }
  else if (path.startsWith('/login/')) { setQr(''); setLoginResult(null); setLoginStatus('正在处理登录') }
  if (path.startsWith('/login/')) setLoginBusy(true)
  const result = await action.run(path, args)
  if (!alive.current) return
  if (path.startsWith('/login/')) setLoginBusy(false)
  setLoginResult(result)
  if (path.startsWith('/login/') && !result?.ok && !result?.loggedIn && !result?.qr) setLoginStatus('登录操作失败，请检查下方信息后重试')
  if (path === '/login/qr' && result?.qr) { setQr(String(result.qr)); setLoginStatus('等待扫码确认'); polling.current = pollLogin(() => { setQr(''); status.refresh(); account.refresh() }, setLoginStatus) }
  if (result?.loggedIn === true) { polling.current?.(); setQr(''); setLoginStatus('登录成功') }
  account.refresh()
  status.refresh()
  return result
 }
   const logout = async () => {
   if (!window.confirm(t('确认退出抖音登录？'))) return
   await run('/login/logout')
   account.refresh()
   status.refresh()
  }
  const safeQr = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(qr)
 return <><Card title="账号与登录">
  <div className="dy-account-header">
   <AccountAvatar name={nickname} hasAvatar={hasAvatar} online={online} version={avatarVersion} />
   <div className="dy-account-identity"><strong title={nickname}>{nickname}</strong><span className="dy-account-presence" data-active={online}>{t(online ? '在线' : '离线')} · {t(online ? '已登录' : '尚未登录')}</span></div>
   <div className="dy-account-actions"><button onClick={account.refresh}>{t('刷新账号')}</button>{!online && <button className="dy-primary" disabled={!!action.busy} onClick={() => void run('/login/browser')}>{t('浏览器登录')}</button>}{online && <button onClick={() => void logout()}>{t('退出登录')}</button>}</div>
  </div>
  {!online && <details className="dy-details dy-login-details" open><summary>{t('登录方式与验证')}</summary><div className="dy-toolbar">{[['/login/browser','浏览器登录'],['/login/browser/close','关闭前台登录并切回后台'],['/login/qr','截图登录'],['/login/poll','我扫完了']].map(([path, label]) => <button key={path} disabled={!!action.busy} onClick={() => void run(path)}>{t(label)}</button>)}</div>
   <div className="dy-toolbar"><label htmlFor={id + 'phone'}>{t('手机号')}</label><input id={id + 'phone'} type="tel" autoComplete="tel" maxLength={11} value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))} /><button disabled={!!action.busy || !!phone && !/^\d{11}$/.test(phone)} onClick={() => void run('/login/sms', { phone })}>{t('收验证码')}</button></div>
   <div className="dy-toolbar"><label htmlFor={id + 'code'}>{t('验证码')}</label><input id={id + 'code'} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} /><button disabled={!!action.busy || !/^\d{4,6}$/.test(code)} onClick={async () => { const result = await run('/login/sms/submit', { code }); if (result && alive.current) setCode('') }}>{t('提交验证码')}</button></div>
  </details>}
  {!online && loginStatus && <p role="status">{t(loginStatus)}</p>}{!online && safeQr && <img src={qr} className="dy-qr" alt={t('登录二维码')} />}
  {!online && <Feedback busy={loginBusy ? action.busy : ''} error={status.error || account.error} />}{!online && <Result value={loginResult} />}
 </Card><Environment dirty={dirty} onConfigure={onConfigure} /></>
}
