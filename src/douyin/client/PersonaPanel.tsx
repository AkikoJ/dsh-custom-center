import { useEffect, useId, useState } from 'react'
import { useResource, useActions } from './state.js'
import { Card, Feedback } from './controls.js'
import { useText } from './messages.js'

export function PersonaPanel() {
 const t = useText(), source = useResource('/persona'), action = useActions(), [text, setText] = useState(''), id = useId()
 useEffect(() => { if (source.data) setText(String(source.data.persona || '')) }, [source.data])
 const dirty = !!source.data && text !== String(source.data.persona || '')
 return <Card title="角色设定"><label htmlFor={id}>{t('人设正文')}</label><textarea id={id} rows={14} value={text} disabled={!source.data || !!action.busy} onChange={(event) => setText(event.target.value)} />
 <p>{t('人设用于私信、评论和后台任务；手动保存后生效。')}</p>
 <div className="dy-toolbar"><button disabled={!dirty || !text.trim() || !!action.busy} onClick={async () => { if (await action.run('/persona', { text })) source.refresh() }}>{t('保存角色设定')}</button>{source.error && <button onClick={source.refresh}>{t('重试')}</button>}</div>
 <Feedback error={source.error || action.error} busy={action.busy || (!source.data && !source.error ? 'load' : '')} />
 {action.result && !action.error && <p role="status">{t('已保存')}</p>}
 </Card>
}
