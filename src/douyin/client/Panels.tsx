import { useId, useState } from 'react'
import { record, rows, type Data } from './api.js'
import { useResource, useActions } from './state.js'
import { Card, Feedback, Result } from './controls.js'
import { useText } from './messages.js'
export function Messages({ dirty = false }: { dirty?: boolean }) {
 const t = useText(), state = useResource('/dm'), action = useActions(), [text, setText] = useState(''), id = useId()
 return <Card title="私信巡检状态"><p>{t('发送给主动私信名单首位联系人')}</p><label htmlFor={id}>{t('测试正文')}</label><textarea id={id} value={text} onChange={(event) => setText(event.target.value)} maxLength={100} />
 <div className="dy-toolbar"><button disabled={!!action.busy || dirty} onClick={async () => { if (await action.run('/dm/test', { text })) state.refresh() }}>{t('测试私信')}</button><button disabled={!!action.busy} onClick={async () => { if (await action.run('/dm/seen/clear', {})) state.refresh() }}>{t('清除已读索引')}</button><button onClick={state.refresh}>{t('刷新')}</button></div>
 <Feedback error={action.error || state.error} busy={action.busy} /><p>{t('事件监听')}：{String(record(state.data?.watcher).error || (record(state.data?.watcher).connected ? t('已连接') : t('待连接或已关闭')))} · {t('每 120 秒补漏；旧秒数配置不控制监听频率')}</p><h3>{t('今天的聊天记录')}</h3>{rows(state.data?.log).length ? rows(state.data?.log).slice().reverse().map((item, index) => <article key={index}><strong>{String(item.name || '')}</strong> · {item.at ? new Date(Number(item.at)).toLocaleTimeString() : '—'}<p>{t('对方')}：{String(item.text || '')}</p><p>{t('我')}：{item.replied ? String(item.replyText || t('已确认回复，正文未记录')) : t('尚未确认回复')}</p></article>) : <p>{t('今天还没有私信记录')}</p>}<h3>{t('最近回过的')}</h3>{rows(state.data?.recent).map((item) => <p key={String(item.peer)}>{String(item.name || item.peer)} · {String(item.day || '')} · {String(item.count || 0)} {t('次')} · {String(item.lastReply || '')}</p>)}<p>{t('清除已读索引会重新扫描消息，永久发送去重仍保留。')}</p>{dirty && <p>{t('测试前请保存联系人配置')}</p>}<Result value={state.data} /><Result value={action.result} /></Card>
}
function Sticker({ item, file, save, disabled }: { item: Data; file: string; save(data: Data): Promise<Data | null>; disabled: boolean }) {
 const t = useText(), [tags, setTags] = useState(Array.isArray(item.tags) ? item.tags.join(', ') : ''), id = useId()
 return <div className="dy-field"><label htmlFor={id}>{String(item.key || item.index)}<small>{t('标签用逗号分隔')}</small></label><div><input id={id} value={tags} onChange={(event) => setTags(event.target.value)} /><button disabled={disabled} onClick={() => void save({ file, index: item.index, tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) })}>{t('保存标签')}</button></div></div>
}
export function Stickers({ dirty = false }: { dirty?: boolean }) {
 const t = useText(), source = useResource('/stickers'), action = useActions(), [keyword, setKeyword] = useState(''), id = useId()
 return <Card title="收藏表情标签"><div className="dy-toolbar"><button onClick={source.refresh}>{t('刷新')}</button><label htmlFor={id}>{t('关键词')}</label><input id={id} value={keyword} onChange={(event) => setKeyword(event.target.value)} /><button disabled={!!action.busy || dirty} onClick={() => void action.run('/stickers/test', { keyword })}>{t('测试表情')}</button></div><p>{t('发送给主动私信名单首位联系人')}</p>
 <p>{t('收藏表情')} {rows(source.data?.custom).length} · {t('通用表情')} {String(source.data?.emojiCount ?? rows(source.data?.emoji).length)} · {t('已逐张打标签，关键词命中后使用')}</p>{dirty && <p>{t('测试前请保存联系人配置')}</p>}<Feedback error={source.error || action.error} busy={action.busy} />{source.data && !rows(source.data.custom).length && !rows(source.data.emoji).length && <p>{t('暂无记录')}</p>}
 {(['custom', 'emoji'] as const).map((kind) => <section key={kind}><h3>{t(kind === 'custom' ? '收藏表情' : '通用表情')}</h3>{rows(source.data?.[kind]).map((item, index) => <Sticker key={kind + index + JSON.stringify(item.tags)} item={item} file={kind === 'custom' ? 'favorites2.json' : 'favorites.json'} disabled={!!action.busy} save={(data) => action.run('/stickers/tags', data)} />)}</section>)}<Result value={action.result} /></Card>
}
export { PersonaPanel as Persona } from './PersonaPanel.js'
export function Advanced({ dirty }: { dirty: boolean }) {
 const t = useText(), action = useActions()
 return <Card title="高级"><div className="dy-toolbar"><button disabled={!!action.busy} onClick={() => void action.run('/log/tail')}>{t('查看运行日志')}</button><button disabled={!!action.busy} onClick={() => void action.run('/update/check')}>{t('检查上游版本')}</button><button disabled={!!action.busy} onClick={() => void action.run('/open', { what: 'home' })}>{t('打开数据目录')}</button><button disabled={!!action.busy || dirty} onClick={() => void action.run('/run', { mode: 'headless' })}>{t('后台轮次')}</button></div><Feedback busy={action.busy} error={action.error} /><Result value={action.result} /></Card>
}
