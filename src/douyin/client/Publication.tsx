import { useId, useState } from 'react'
import { rows, type Data } from './api.js'
import { useResource, useActions } from './state.js'
import { Card, Feedback, Result } from './controls.js'
import { useText } from './messages.js'
export function Publication({ draft, dirty }: { draft: Data; dirty: boolean }) {
 const t = useText(), source = useResource('/comfy/list'), action = useActions(), id = useId()
 const [selected, setSelected] = useState<{ index: number; token: string; name: string } | null>(null)
 const [title, setTitle] = useState<string | null>(null), [tags, setTags] = useState<string | null>(null), [asDraft, setAsDraft] = useState<boolean | null>(null)
 const isDraft = asDraft ?? draft.publishDraft !== false
 return <Card title="ComfyUI 输出"><button onClick={() => { setSelected(null); source.refresh() }}>{t('刷新输出列表')}</button><Feedback error={source.error || action.error} busy={action.busy} />
 {source.data && !rows(source.data.items).length && <p>{t('暂无记录')}</p>}
 {rows(source.data?.items).map((file, index) => <div key={String(file.token)} className="dy-toolbar"><span>{String(file.name || file.path).split(/[\\/]/).at(-1)}</span><button disabled={dirty || !!action.busy} onClick={() => setSelected({ index, token: String(file.token), name: String(file.name || '').split(/[\\/]/).at(-1) || String(index + 1) })}>{t('准备投稿')}</button></div>)}
 {dirty && <p>{t('请先保存设置再投稿')}</p>}
 {selected && <section className="dy-publish" aria-label={t('准备投稿')}><h3>{selected.name}</h3><div className="dy-field"><label htmlFor={id + 'title'}>{t('标题')}</label><input id={id + 'title'} value={title ?? String(draft.publishTitle || '')} onChange={(event) => setTitle(event.target.value)} /></div><div className="dy-field"><label htmlFor={id + 'tags'}>{t('标签')}</label><input id={id + 'tags'} value={tags ?? String(draft.publishTags || '')} onChange={(event) => setTags(event.target.value)} /></div><div className="dy-field"><label htmlFor={id + 'draft'}>{t('存为草稿')}</label><input id={id + 'draft'} type="checkbox" checked={isDraft} onChange={(event) => setAsDraft(event.target.checked)} /></div><div className="dy-toolbar"><button className="dy-primary" disabled={dirty || !!action.busy} onClick={async () => { const result = await action.run('/publish', { index: selected.index, token: selected.token, title: title ?? draft.publishTitle, tags: tags ?? draft.publishTags, draft: isDraft }); if (result) setSelected(null) }}>{t(isDraft ? '确认存草稿' : '确认正式发布')}</button><button disabled={!!action.busy} onClick={() => setSelected(null)}>{t('取消')}</button></div></section>}
 <Result value={action.result} /></Card>
}
