import { useEffect, useState } from 'react'
import { accountAvatar } from './api.js'
import { useText } from './messages.js'

export function AccountAvatar({ name, hasAvatar, online, version }: { name: string; hasAvatar: boolean; online: boolean; version: string }) {
 const t = useText(), [source, setSource] = useState('')
 useEffect(() => {
  setSource('')
  if (!hasAvatar || !online) return
  const controller = new AbortController()
  let objectUrl = ''
  accountAvatar(controller.signal).then((url) => {
   if (controller.signal.aborted) { URL.revokeObjectURL(url); return }
   objectUrl = url
   setSource(url)
  }).catch(() => {})
  return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
 }, [hasAvatar, online, version])
 return <span className="dy-account-avatar" data-online={online}>
  {source ? <img src={source} alt={t('账号头像')} /> : <svg viewBox="0 0 48 48" role="img" aria-label={name ? t('账号头像') : ''} aria-hidden={name ? undefined : true}><circle cx="24" cy="17" r="8" fill="currentColor" /><path d="M8 42c1.8-10 7.8-15 16-15s14.2 5 16 15" fill="currentColor" /></svg>}
  <i className="dy-status-dot" data-active={online} aria-hidden="true" />
 </span>
}
