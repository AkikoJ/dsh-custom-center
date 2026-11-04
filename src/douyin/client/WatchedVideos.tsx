import { useEffect, useState } from 'react'
import { imageUrl, platformUrl, rows, type Data } from './api.js'
import { useResource } from './state.js'
import { Feedback } from './controls.js'
import { useText } from './messages.js'
function Preview({ id }: { id: string }) {
 const t = useText(), [source, setSource] = useState('')
 useEffect(() => {
  const controller = new AbortController(); let owned = ''; setSource('')
  const load = async () => { for (const kind of ['thumb', 'cover'] as const) { try { const url = await imageUrl(id, kind, controller.signal); if (controller.signal.aborted) { URL.revokeObjectURL(url); return } owned = url; setSource(url); return } catch { if (controller.signal.aborted) return } } }
  void load(); return () => { controller.abort(); if (owned) URL.revokeObjectURL(owned) }
 }, [id])
 return source ? <img className="dy-preview" src={source} alt="" loading="lazy" onError={() => setSource('')} /> : <div className="dy-preview">{t('没有截图')}</div>
}
export function groupVideos(items: Data[]) {
 const groups = new Map<string, Data[]>()
 for (const item of items) { const day = String(item.day || ''); groups.set(day, [...(groups.get(day) || []), item]) }
 return [...groups].sort(([a], [b]) => b.localeCompare(a))
}
export function WatchedVideos() {
 const t = useText(), resource = useResource('/watched?days=14'), items = rows(resource.data?.items)
 return <section><div className="dy-toolbar"><h2>{t('最近刷过的视频')}</h2><button onClick={resource.refresh}>{t('刷新')}</button></div>
 <Feedback error={resource.error} busy={!resource.data && !resource.error ? 'load' : ''} />
 {resource.data && !items.length && <p>{t('暂无记录')}</p>}
 {groupVideos(items).map(([day, videos]) => <section key={day}><h3>{day || t('未知日期')} · {videos.length}</h3><div className="dy-videos">{videos.map((video, index) => {
  const id = String(video.aweme_id || ''), url = platformUrl(video.url, id)
  const content = <><Preview id={id} /><div className="dy-caption"><strong>{String(video.title || id)}</strong><p>{[video.tier, video.stat].filter(Boolean).map(String).join(' · ')}</p></div></>
  return url ? <a key={id + index} className="dy-video" href={url} target="_blank" rel="noreferrer">{content}</a> : <article key={id + index} className="dy-video">{content}</article>
 })}</div></section>)}
 </section>
}
