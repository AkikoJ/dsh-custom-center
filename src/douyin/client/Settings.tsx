import { useId, useState, type KeyboardEvent } from 'react'
import { TABS } from '../contracts.js'
import { useConfiguration, useActions } from './state.js'
import { ConfigFields, Card, Feedback, Result } from './controls.js'
import { Daily } from './Daily.js'
import { Home } from './Home.js'
import { Messages, Stickers, Persona, Advanced } from './Panels.js'
import { Publication } from './Publication.js'
import { WatchedVideos } from './WatchedVideos.js'
import { useText } from './messages.js'
import { CSS } from './styles.js'
import { FIELDS, type Tab } from './fields.js'
import { record } from './api.js'
export function Settings() {
 const t = useText(), [tab, setTab] = useState<Tab>('home'), config = useConfiguration(), action = useActions(), id = useId()
 const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
  const at = TABS.findIndex(([key]) => key === tab), next = event.key === 'ArrowRight' ? (at + 1) % TABS.length : event.key === 'ArrowLeft' ? (at + TABS.length - 1) % TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : -1
  if (next >= 0) { event.preventDefault(); setTab(TABS[next][0]); const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]'); buttons[next]?.focus() }
 }
 const invalid = FIELDS.some((field) => field.type === 'number' && config.draft[field.key] !== undefined && (config.draft[field.key] === '' || !Number.isSafeInteger(Number(config.draft[field.key])) || Number(config.draft[field.key]) < 0))
 return <div className="dy-page"><style>{CSS}</style><header className="dy-heading"><div><h1>{t('刷抖音')}</h1><p>{t(tab === 'home' ? '账号登录与运行环境' : '独立配置，自动操作受额度和授权控制')}</p></div>
 {config.data && tab !== 'home' && <div className="dy-save"><button className="dy-primary" disabled={!config.dirty || !!config.busy || invalid} onClick={() => void config.save()}>{t(config.busy ? '保存中' : '保存更改')}</button><span className="dy-save-status" role="status">{config.dirty ? t('有未保存的更改') : config.result ? t(record(config.result.host).ok === false ? '本地已保存，宿主同步失败' : '已保存') : ''}</span></div>}</header>
 <Feedback error={config.error} busy={config.busy || (!config.data && !config.error ? 'load' : '')} />
 {!config.data && config.error && <button onClick={config.refresh}>{t('重试')}</button>}
 {config.data && <>
 <div className="dy-tabs" role="tablist" aria-label={t('刷抖音')} onKeyDown={navigate}>{TABS.map(([key, label]) => <button key={key} id={id + key} role="tab" aria-selected={key === tab} aria-controls={id + 'panel'} tabIndex={key === tab ? 0 : -1} onClick={() => setTab(key)}>{t(label)}</button>)}</div>
 <section id={id + 'panel'} role="tabpanel" aria-labelledby={id + tab} tabIndex={0}>
 {tab === 'home' && <Home dirty={config.dirty} onConfigure={() => setTab('adv')} />}
  {tab === 'daily' && <Daily dirty={config.dirty} />}
 {tab !== 'home' && tab !== 'sticker' && <Card title={TABS.find(([key]) => key === tab)![1]}><ConfigFields tab={tab} draft={config.draft} set={config.set} /></Card>}
 {tab === 'daily' && <WatchedVideos collapsible />}{tab === 'dm' && <Messages dirty={config.dirty} />}{tab === 'sticker' && <Stickers dirty={config.dirty} />}{tab === 'persona' && <Persona />}{tab === 'adv' && <Advanced dirty={config.dirty} />}
 {tab === 'like' && <><Card title="互动"><button disabled={!!action.busy || invalid} onClick={() => void action.run('/reply/round', { count: config.draft.replyPerRun })}>{t('立即回复评论')}</button><Feedback error={action.error} busy={action.busy} /><Result value={action.result} /></Card><Publication draft={config.draft} dirty={config.dirty} /></>}
 </section></>}
 </div>
}
export function ConversationVideos() { return <div className="dy-page"><style>{CSS}</style><WatchedVideos /></div> }
