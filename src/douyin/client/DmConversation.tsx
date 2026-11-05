import { useCallback, useEffect, useMemo, useState } from 'react'
import { request, rows, type Data } from './api.js'

const css = `
.dy-chat { height:100%; min-height:0; display:flex; flex-direction:column; color:var(--dsw-alias-label-primary,#252525); background:var(--dsw-alias-background-primary,#fff); font:14px system-ui,sans-serif }
.dy-chat * { box-sizing:border-box }
.dy-chat-head { padding:20px 24px; border-bottom:1px solid var(--dsw-alias-separator,#ddd); display:flex; justify-content:space-between; align-items:center; gap:12px }
.dy-chat-head h1 { margin:0; font-size:19px; font-weight:650 }
.dy-chat button { font:inherit; cursor:pointer; color:inherit }
.dy-chat-refresh { border:1px solid var(--dsw-alias-separator,#ccc); background:transparent; border-radius:6px; padding:7px 12px }
.dy-chat-body { flex:1; min-height:0; display:grid; grid-template-columns:minmax(165px,240px) minmax(0,1fr) }
.dy-chat-contacts { overflow:auto; border-right:1px solid var(--dsw-alias-separator,#ddd) }
.dy-chat-contact { display:block; text-align:left; width:100%; padding:13px 16px; border:0; border-bottom:1px solid var(--dsw-alias-separator,#eee); background:transparent }
.dy-chat-contact[aria-current=true] { background:var(--dsw-alias-background-secondary,#f1f2f3); box-shadow:inset 3px 0 #408b75 }
.dy-chat-contact strong,.dy-chat-contact small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.dy-chat-contact small { margin-top:5px; opacity:.65 }
.dy-chat-thread { min-width:0; min-height:0; display:flex; flex-direction:column }
.dy-chat-title { padding:15px 22px; border-bottom:1px solid var(--dsw-alias-separator,#ddd); font-weight:600 }
.dy-chat-messages { overflow:auto; padding:20px 24px; flex:1 }
.dy-chat-message { margin:0 0 16px; max-width:min(80%,680px) }
.dy-chat-message.out { margin-left:auto }
.dy-chat-meta { font-size:12px; opacity:.65; margin:0 0 5px }
.dy-chat-message.out .dy-chat-meta { text-align:right }
.dy-chat-bubble { white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.5; padding:10px 13px; border-radius:6px; background:var(--dsw-alias-background-secondary,#f1f2f3) }
.dy-chat-message.out .dy-chat-bubble { background:#dbeee8; color:#1c3831 }
.dy-chat-details { margin:8px 0 0; font-size:12px; line-height:1.5; overflow-wrap:anywhere }
.dy-chat-details summary { cursor:pointer; opacity:.8 }
.dy-chat-details pre { white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; padding:10px; background:var(--dsw-alias-background-secondary,#f1f2f3); border-radius:4px; max-height:340px; overflow:auto }
.dy-chat-empty,.dy-chat-error { padding:24px; opacity:.75 }
.dy-chat-error { color:#b44438; opacity:1 }
@media(max-width:550px) { .dy-chat-body { grid-template-columns:minmax(110px,34%) minmax(0,1fr) } .dy-chat-head,.dy-chat-messages { padding:14px } .dy-chat-message { max-width:100% } }
`
const str = (value: unknown) => typeof value === 'string' ? value : ''
const time = (value: unknown) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? new Date(n).toLocaleString() : '' }
const status = (value: unknown) => ({ sent: '已确认发送', pending: '处理中', unknown: '发送状态未知', failed: '未发送成功' }[str(value)] || '历史记录')
function Details({ item }: { item: Data }) {
 const details = rows(item.details)
 return <details className="dy-chat-details"><summary>生成详情 · {status(item.status)}</summary>
 {!details.length ? <p>历史记录未保存提示词。</p> : details.map((detail, index) => <div key={index}>
 <p>{detail.mode === 'fast' ? `快速回复${detail.provider || detail.model ? ` · ${str(detail.provider)} / ${str(detail.model)}` : ''}` : detail.mode === 'headless' ? '普通回复 · 后台 Agent 初始任务（不含 Agent 系统上下文）' : '预设回复 · 未调用模型'}</p>
 {!!detail.system && <><strong>系统提示词</strong><pre>{str(detail.system)}</pre></>}
 {!!detail.user && <><strong>{detail.mode === 'headless' ? '初始任务提示词' : '用户消息'}</strong><pre>{str(detail.user)}</pre></>}
 {Number(detail.images) > 0 && <p>发送图片附件：{Number(detail.images)} 张</p>}
 {rows(detail.tools).length > 0 && <><strong>工具执行</strong><pre>{rows(detail.tools).map((tool) => `${str(tool.name)}：${str(tool.status)}`).join('\n')}</pre></>}
 </div>)}
 {!!item.error && <p>{str(item.error)}</p>}
 </details>
}
export function DmConversation() {
 const [items, setItems] = useState<Data[]>([]), [selected, setSelected] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true)
 const refresh = useCallback(async (signal?: AbortSignal) => { try { const data = await request('/dm/history', undefined, signal); if (!signal?.aborted) { setItems(rows(data.items)); setError('') } } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : String(e)) } finally { if (!signal?.aborted) setLoading(false) } }, [])
 useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort() }, [refresh])
 const contacts = useMemo(() => { const grouped = new Map<string, Data>(); for (const item of items) if (str(item.name)) grouped.set(str(item.name), item); return [...grouped].sort((a,b) => Number(b[1].at) - Number(a[1].at)) }, [items])
 const active = selected && contacts.some(([name]) => name === selected) ? selected : contacts[0]?.[0] || ''
 const thread = items.filter((item) => item.name === active).sort((a,b) => Number(a.at) - Number(b.at))
 return <div className="dy-chat"><style>{css}</style><header className="dy-chat-head"><h1>抖音私信</h1><button className="dy-chat-refresh" onClick={() => void refresh()} aria-label="刷新私信记录" title="刷新">刷新</button></header>
 {error && <div className="dy-chat-error" role="alert">{error}</div>}
 <div className="dy-chat-body"><nav className="dy-chat-contacts" aria-label="联系人">{contacts.map(([name, item]) => <button key={name} className="dy-chat-contact" aria-current={name === active} onClick={() => setSelected(name)}><strong>{name}</strong><small>{str(item.replyText) || str(item.text)}</small></button>)}</nav>
 <section className="dy-chat-thread">{active ? <><div className="dy-chat-title">{active}</div><div className="dy-chat-messages">{thread.map((item, index) => <div key={str(item.key) || index}>
 <div className="dy-chat-message"><div className="dy-chat-meta">{active} · {time(item.at)}</div><div className="dy-chat-bubble">{str(item.text) || '[消息]'}</div></div>
 <div className="dy-chat-message out"><div className="dy-chat-meta">{status(item.status)}{item.replyAt ? ` · ${time(item.replyAt)}` : ''}</div>{!!item.replyText && <div className="dy-chat-bubble">{str(item.replyText)}</div>}<Details item={item} /></div>
 </div>)}</div></> : <div className="dy-chat-empty">{loading ? '正在读取记录…' : '暂无本地私信记录'}</div>}</section></div></div>
}
