import { DetailIcon } from '../../shared/form-controls.js'
import { useId, useState } from 'react'
import { rows, type Data } from './api.js'
import { useResource, useActions } from './state.js'
import { Card, Feedback, Result } from './controls.js'
import { useText } from './messages.js'
export function MessageMaintenance({ dirty = false }: { dirty?: boolean }) {
 const t = useText(), action = useActions(), [text, setText] = useState(''), id = useId()
 return <details className="dy-details"><summary>{t('私信测试与维护')}</summary>
  <div className="dy-field-label"><label htmlFor={id}>{t('测试正文')}</label><DetailIcon label={t('测试私信') + t('说明')}>{t('发送给主动私信名单首位联系人')}</DetailIcon></div><input id={id} value={text} onChange={(event) => setText(event.target.value)} maxLength={100} />
  <div className="dy-toolbar"><button disabled={!!action.busy || dirty || !text.trim()} onClick={() => void action.run('/dm/test', { text })}>{t('测试私信')}</button><button disabled={!!action.busy} onClick={() => void action.run('/dm/seen/clear', {})}>{t('清除已读索引')}</button><DetailIcon label={t('清除已读索引') + t('说明')}>{t('清除已读索引会重新扫描消息，永久发送去重仍保留。')}</DetailIcon></div>{dirty && <p role="status">{t('测试前请保存联系人配置')}</p>}
  <Feedback error={action.error} busy={action.busy} /><Result value={action.result} />
 </details>
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
 return <Card title="高级"><div className="dy-toolbar"><button disabled={!!action.busy} onClick={() => void action.run('/log/tail')}>{t('查看运行日志')}</button><button disabled={!!action.busy} onClick={() => void action.run('/update/check')}>{t('检查上游版本')}</button><button disabled={!!action.busy} onClick={() => void action.run('/open', { what: 'home' })}>{t('打开数据目录')}</button><button disabled={!!action.busy || dirty} onClick={() => void action.run('/run', { mode: 'headless' })}>{t('后台轮次')}</button></div><Feedback busy={action.busy} error={action.error} /><Result value={action.result} /><MessageMaintenance dirty={dirty} /></Card>
}
