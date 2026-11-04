import { useText } from './messages.js'
import { useEffect, useRef, useState } from 'react'
import { record, rows, type Data } from './api.js'
import { clearWorkspace } from './memory-operations.js'
import { useMemoryCall } from './shared-memory.js'
import { useActions, useResource } from './state.js'
import { Card, Feedback } from './controls.js'

export function MemoryPanel() {
  const t = useText(), call = useMemoryCall(), local = useResource('/memory'), action = useActions()
  const [tab, setTab] = useState('character'), [shared, setShared] = useState<Data>({}), [stats, setStats] = useState<Data>({}), [error, setError] = useState(''), [busy, setBusy] = useState(true), [version, setVersion] = useState(0)
  const [card, setCard] = useState<Data>({}), [persona, setPersona] = useState(''), [search, setSearch] = useState(''), [message, setMessage] = useState('')
  const generation = useRef(0)
  useEffect(() => { if (local.data) setPersona(String(local.data.persona || '')) }, [local.data])
  useEffect(() => {
    let alive = true; generation.current++
    setBusy(true); setError(''); setMessage(''); setShared({})
    const load = async () => {
      try {
        const counts = await call('stats').catch(() => ({})); if (!alive) return; setStats(counts)
        const value = await call(tab === 'character' ? 'character' : tab === 'timeline' ? 'recall' : tab === 'clean' ? 'workspaces' : 'stats', tab === 'character' ? { action: 'read' } : { limit: 80 })
        if (alive) { setShared(value); if (tab === 'character') setCard(record(value.character || value)) }
      } catch (error) { if (alive) setError(error instanceof Error ? error.message : String(error)) }
      finally { if (alive) setBusy(false) }
    }
    void load(); return () => { alive = false; generation.current++ }
  }, [tab, version, call])
  const identity = record(card.identity), preferences = record(card.preferences)
  const saveCard = async () => {
    const epoch = generation.current
    setBusy(true); setError(''); setMessage('')
    try {
      const updates = { identity, preferences, constraints: card.constraints || [] }
      await call('character', { action: 'update', updates })
      if (epoch !== generation.current) return
      const read = await call('character', { action: 'read' }), checked = record(read.character || read)
      if (epoch !== generation.current) return
      for (const [group, keys] of [['identity', ['name','timezone']], ['preferences', ['communication_style','response_length']]] as const) for (const key of keys) if (record(checked[group])[key] !== record(updates[group])[key]) throw new Error('回读与保存内容不一致：' + key)
      if (JSON.stringify(checked.constraints || []) !== JSON.stringify(updates.constraints)) throw new Error('约束回读与保存内容不一致')
      setCard(checked); setMessage('角色卡已保存，已回读核对')
    } catch (error) { if (epoch === generation.current) setError(error instanceof Error ? error.message : String(error)) } finally { if (epoch === generation.current) setBusy(false) }
  }
  const memories = rows(shared.items || shared.results), filtered = memories.filter((item) => [item.content, item.text, item.summary, item.type, item.kind].join(' ').toLowerCase().includes(search.toLowerCase()))
  return <Card title="记忆"><p>{t(error ? '共享服务不可用，保留本地记忆与人设' : 'memory-system · 共享记忆')}</p>
    <div className="dy-toolbar">{[['character','角色卡'],['timeline','时间线'],['clean','清理'],['raw','原始记录']].map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{t(label)}</button>)}<button disabled={busy} onClick={() => { setVersion((v) => v + 1); local.refresh() }}>{t("刷新")}</button></div>
    <Feedback busy={busy ? '记忆' : action.busy} error={error || local.error || action.error} />{message && <p role="status">{t(message)}</p>}
    {Object.keys(stats).length > 0 && <details><summary>{t("记忆统计")}</summary><dl>{Object.entries(stats).filter(([key]) => key !== 'ok').map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === 'object' ? <pre>{JSON.stringify(value, null, 2)}</pre> : String(value)}</dd></div>)}</dl></details>}
    {tab === 'character' && <><fieldset disabled={busy || !!error}><legend>{t("共享角色卡")}</legend>{[['name','称呼'],['timezone','时区']].map(([key,label]) => <label className="dy-field" key={key}>{t(label)}<input value={String(identity[key] || '')} onChange={(e) => setCard({ ...card, identity: { ...identity, [key]: e.target.value } })} /></label>)}{[['communication_style','沟通风格'],['response_length','回复长度']].map(([key,label]) => <label className="dy-field" key={key}>{t(label)}<input value={String(preferences[key] || '')} onChange={(e) => setCard({ ...card, preferences: { ...preferences, [key]: e.target.value } })} /></label>)}<label className="dy-field">{t("约束（一行一条）")}<textarea value={Array.isArray(card.constraints) ? card.constraints.join('\n') : ''} onChange={(e) => setCard({ ...card, constraints: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) })} /></label><button onClick={() => void saveCard()}>{t("保存角色卡")}</button></fieldset><p>角色卡更新时间：{String(card.updated_at || card._last_updated || '—')}</p><details><summary>{t("其它角色字段")}</summary><pre>{JSON.stringify(Object.fromEntries(Object.entries(card).filter(([key]) => !['identity','preferences','constraints'].includes(key))), null, 2)}</pre></details>
      <label className="dy-field">{t("本地人设（每天按观察更新）")}<textarea rows={12} value={persona} onChange={(e) => setPersona(e.target.value)} /></label><button disabled={!!action.busy || !persona.trim()} onClick={async () => { if (await action.run('/persona', { text: persona })) { setMessage('人设已保存，旧内容已备份'); local.refresh() } }}>{t("保存人设")}</button></>}
    {tab === 'timeline' && <><label className="dy-field">{t("搜索记忆内容 / 类型")}<input value={search} onChange={(e) => setSearch(e.target.value)} /></label><p>共 {memories.length} 条，显示 {filtered.length} 条</p>{filtered.length ? filtered.slice(0, 80).map((item, index) => <article className="dy-card" key={String(item.id || index)}><small>{String(item.kind || item.type || '记忆')} · {String(item.created_at || item.at || '')} · 重要度 {String(item.importance ?? '—')}</small><p>{String(item.text || item.summary || item.content || '')}</p></article>) : <p>{t(busy ? '读取中…' : search ? '没有匹配的记忆' : '还没有共享记忆条目')}</p>}</>}
    {tab === 'clean' && <Cleanup call={call} workspaces={rows(shared.workspaces || shared.results || shared.items)} onChanged={() => setVersion((v) => v + 1)} />}
    {tab === 'raw' && <><dl>{Object.entries(record(local.data?.metadata)).map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.join(' / ') : String(value)}</dd></div>)}</dl><p>{t("本地原始记录")}</p>{Array.isArray(local.data?.lines) && local.data.lines.length ? <pre>{local.data.lines.join('\n')}</pre> : <p>{t("还没有本地记录")}</p>}</>}
  </Card>
}
function Cleanup({ call, workspaces, onChanged }: { call: ReturnType<typeof useMemoryCall>; workspaces: Data[]; onChanged(): void }) {
  const t = useText()
  const [opened, setOpened] = useState(''), [items, setItems] = useState<Data[]>([]), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState('')
  const lifecycle = useRef(new AbortController())
  useEffect(() => { lifecycle.current = new AbortController(); return () => lifecycle.current.abort() }, [])
  const load = async (id: string) => { setBusy(true); setError(''); setItems([]); setOpened(id); try { const detail = await call('workspace_detail', { workspace_id: id, limit: 500 }); if (!lifecycle.current.signal.aborted) setItems(rows(detail.items)) } catch (error) { if (!lifecycle.current.signal.aborted) setError(String(error)) } finally { if (!lifecycle.current.signal.aborted) setBusy(false) } }
  const forget = async (all: boolean, id?: unknown) => {
    setBusy(true); setError(''); setMessage('')
    let deleted = 0
    try {
      if (all) {
        const result = await clearWorkspace(call, opened, (count) => { if (!lifecycle.current.signal.aborted) setMessage(`已处理 ${count} 条，正在回读核对…`) }, lifecycle.current.signal)
        if (lifecycle.current.signal.aborted) return
        setItems(result.remaining); setMessage(`已删除 ${result.deleted} 条；失败 ${result.failed} 条；仍可读到 ${result.remaining.length} 条`); setConfirm(''); onChanged(); return
      }
      await call('forget', { id }); deleted++
      lifecycle.current.signal.throwIfAborted()
      const remaining = rows((await call('workspace_detail', { workspace_id: opened, limit: 500 })).items)
      lifecycle.current.signal.throwIfAborted(); setItems(remaining)
      if (remaining.some((item) => item.id === id)) throw new Error('删除后回读仍存在该条目')
      setMessage(`已删除 ${deleted} 条，已回读核对`); setConfirm(''); onChanged()
    } catch (error) { if (!lifecycle.current.signal.aborted) setError(`清理未完成，其余保留：${String(error)}`) } finally { if (!lifecycle.current.signal.aborted) setBusy(false) }
  }
  return <><p>{t("按工作区删除共享记忆。永久回复去重与本地人设分别保存。")}</p><Feedback busy={busy ? '清理' : ''} error={error} />{message && <p role="status">{t(message)}</p>}{workspaces.length ? workspaces.map((workspace) => { const id = String(workspace.id || workspace.workspace_id || ''); return <section key={id} className="dy-card"><button disabled={busy} aria-expanded={opened === id} onClick={() => opened === id ? setOpened('') : void load(id)}>{String(workspace.label || workspace.name || workspace.path || id)} · {String(workspace.memory_count ?? workspace.count ?? workspace.total ?? '—')} 条</button>{opened === id && <><button disabled={busy || !items.length} onClick={() => setConfirm(id)}>{t("清空此工作区")}</button>{confirm === id && <p role="alert">{t("删除无法恢复。")}<button disabled={busy} onClick={() => void forget(true)}>{t("确认清空")}</button><button onClick={() => setConfirm('')}>{t("取消")}</button></p>}{items.length ? items.map((item) => <p key={String(item.id)}>{String(item.content || item.text || '')}<button disabled={busy} onClick={() => setConfirm(String(item.id))}>{t("删除")}</button>{confirm === String(item.id) && <><button disabled={busy} onClick={() => void forget(false, item.id)}>{t("确认删除")}</button><button onClick={() => setConfirm('')}>{t("取消")}</button></>}</p>) : <p>{t(busy ? '读取中…' : '此工作区没有记忆')}</p>}</>}</section> }) : <p>{t("没有可用工作区")}</p>}</>
}
