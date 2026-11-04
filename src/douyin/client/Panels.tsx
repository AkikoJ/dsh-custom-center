import { useId, useState } from 'react'
import { rows, type Data } from './api.js'
import { useResource, useActions } from './state.js'
import { Card, Feedback, Result } from './controls.js'
import { useText } from './messages.js'
export function Messages() {
 const t = useText(), state = useResource('/dm'), action = useActions(), [text, setText] = useState(''), id = useId()
 return <Card title="私信巡检状态"><p>{t('发送给主动私信名单首位联系人')}</p><label htmlFor={id}>{t('测试正文')}</label><textarea id={id} value={text} onChange={(event) => setText(event.target.value)} maxLength={100} />
 <div className="dy-toolbar"><button disabled={!!action.busy} onClick={() => void action.run('/dm/test', { text })}>{t('测试私信')}</button><button disabled={!!action.busy} onClick={async () => { if (await action.run('/dm/seen/clear', {})) state.refresh() }}>{t('清除已读索引')}</button><button onClick={state.refresh}>{t('刷新')}</button></div>
 <Feedback error={action.error || state.error} busy={action.busy} /><Result value={state.data} /><Result value={action.result} /></Card>
}
function Sticker({ item, file, save, disabled }: { item: Data; file: string; save(data: Data): Promise<Data | null>; disabled: boolean }) {
 const t = useText(), [tags, setTags] = useState(Array.isArray(item.tags) ? item.tags.join(', ') : ''), id = useId()
 return <div className="dy-field"><label htmlFor={id}>{String(item.key || item.index)}<small>{t('标签用逗号分隔')}</small></label><div><input id={id} value={tags} onChange={(event) => setTags(event.target.value)} /><button disabled={disabled} onClick={() => void save({ file, index: item.index, tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) })}>{t('保存标签')}</button></div></div>
}
export function Stickers() {
 const t = useText(), source = useResource('/stickers'), action = useActions(), [keyword, setKeyword] = useState(''), id = useId()
 return <Card title="收藏表情标签"><div className="dy-toolbar"><button onClick={source.refresh}>{t('刷新')}</button><label htmlFor={id}>{t('关键词')}</label><input id={id} value={keyword} onChange={(event) => setKeyword(event.target.value)} /><button disabled={!!action.busy} onClick={() => void action.run('/stickers/test', { keyword })}>{t('测试表情')}</button></div><p>{t('发送给主动私信名单首位联系人')}</p>
 <Feedback error={source.error || action.error} busy={action.busy} />{source.data && !rows(source.data.custom).length && !rows(source.data.emoji).length && <p>{t('暂无记录')}</p>}
 {(['custom', 'emoji'] as const).map((kind) => rows(source.data?.[kind]).map((item, index) => <Sticker key={kind + index + JSON.stringify(item.tags)} item={item} file={kind === 'custom' ? 'favorites2.json' : 'favorites.json'} disabled={!!action.busy} save={(data) => action.run('/stickers/tags', data)} />))}<Result value={action.result} /></Card>
}
export function Memory() {
 const t = useText(), source = useResource('/memory'), action = useActions(), [persona, setPersona] = useState<string | null>(null), id = useId()
 return <Card title="最近记忆"><Feedback error={source.error || action.error} busy={action.busy} /><button onClick={source.refresh}>{t('刷新')}</button><pre>{Array.isArray(source.data?.lines) ? source.data.lines.map(String).join('\n') : t('暂无记录')}</pre><label htmlFor={id}>{t('角色设定')}</label><textarea id={id} rows={8} value={persona ?? String(source.data?.persona || '')} onChange={(event) => setPersona(event.target.value)} /><div className="dy-toolbar"><button disabled={!!action.busy || !persona?.trim()} onClick={async () => { if (await action.run('/persona', { text: persona })) { setPersona(null); source.refresh() } }}>{t('保存角色设定')}</button></div></Card>
}
export function Advanced({ dirty }: { dirty: boolean }) {
 const t = useText(), action = useActions()
 return <Card title="高级"><div className="dy-toolbar">{[['/setup','安装运行环境'],['/selfcheck','环境自检'],['/chrome/open','连接 Chrome'],['/setup/log','查看安装日志'],['/log/tail','查看运行日志'],['/update/check','检查上游版本']].map(([path, label]) => <button key={path} disabled={!!action.busy || dirty} onClick={() => void action.run(path, ['/setup', '/selfcheck', '/chrome/open'].includes(path) ? {} : undefined)}>{t(label)}</button>)}<button disabled={!!action.busy} onClick={() => void action.run('/open', { what: 'home' })}>{t('打开数据目录')}</button><button disabled={!!action.busy || dirty} onClick={() => void action.run('/run', { mode: 'headless' })}>{t('后台轮次')}</button></div><Feedback busy={action.busy} error={action.error} /><Result value={action.result} /></Card>
}
