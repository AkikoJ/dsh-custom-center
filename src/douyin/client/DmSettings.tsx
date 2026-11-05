import { useEffect, useId, useState, type ReactNode } from 'react'
import { Switch, Select, DetailIcon, type SelectOption } from '../../shared/form-controls.js'
import { loadReplyModels, type ReplyModel, type ReplyModelCatalog } from './model-catalog.js'
import type { Data } from './api.js'
import { Card, Feedback } from './controls.js'
import { HINTS } from './configuration-layout.js'
import { useText } from './messages.js'

export function contactTags(value: string): string[] {
  const names = value.split(/[,，、\r\n]+/).map((name) => name.trim()).filter(Boolean)
  const normalize = (name: string) => name.replace(/[\s\u200B-\u200D\uFE0E\uFE0F]/g, '').toLowerCase()
  return names.filter((name, index) => names.findIndex((other) => normalize(name) === normalize(other)) === index)
}
export function ContactTags({ id, value, onChange }: { id: string; value: string; onChange(value: string): void }) {
  const t = useText(), [input, setInput] = useState(''), names = contactTags(value)
  const add = () => { if (input.trim()) { onChange(contactTags([...names, input].join('\n')).join('\n')); setInput('') } }
  return <div className="dy-tags"><div className="dy-tag-list">{names.map((name) => <span className="dy-tag" key={name}><span>{name}</span><button type="button" aria-label={t('删除联系人') + ' ' + name} onClick={() => onChange(names.filter((item) => item !== name).join('\n'))}>×</button></span>)}</div>
    <input id={id} value={input} maxLength={100} placeholder={t('输入昵称，回车添加')} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); add() } }} />
  </div>
}
function Row({ label, hint, children, wide = false }: { label: string; hint?: string; children(id: string): ReactNode; wide?: boolean }) {
  const id = useId(), t = useText()
  return <div className={'dy-dm-row' + (wide ? ' dy-dm-wide' : '')}><div className="dy-field-label"><label htmlFor={id}>{t(label)}</label>{hint && <DetailIcon label={t(label) + t('说明')}>{t(hint)}</DetailIcon>}</div><div className="dy-dm-control">{children(id)}</div></div>
}
function knownOptions(options: SelectOption[], value: string): SelectOption[] {
  return value && !options.some((option) => option.value === value) ? [...options, { value, label: value }] : options
}
export function DmSettings({ draft, set }: { draft: Data; set(key: string, value: unknown): void }) {
  const t = useText(), [models, setModels] = useState<ReplyModel[]>([]), [route, setRoute] = useState<ReplyModelCatalog['route']>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [version, setVersion] = useState(0)
  useEffect(() => { const controller = new AbortController(); let alive = true; setLoading(true); setError(''); loadReplyModels(controller.signal).then((snapshot) => { if (alive) { setModels(snapshot.models || []); setRoute(snapshot.route) } }, (error: Error) => { if (alive) setError(error.message) }).finally(() => { if (alive) setLoading(false) }); return () => { alive = false; controller.abort() } }, [version])
  const provider = String(draft.dmFastProvider || ''), model = String(draft.dmFastModel || ''), effectiveProvider = provider || route?.provider || ''
  const providers = knownOptions([{ value: '', label: t('跟随默认提供方') }, ...Array.from(new Set(models.map((item) => item.provider))).map((value) => ({ value, label: models.find((item) => item.provider === value)?.providerName || value }))], provider)
  const modelOptions = knownOptions([{ value: '', label: t('跟随默认模型') }, ...models.filter((item) => item.provider === effectiveProvider).map((item) => ({ value: item.model, label: item.name || item.model }))], model)
  const toggle = (key: string, label: string, hint: string) => <Row label={label} hint={hint}>{(id) => <Switch id={id} checked={Boolean(draft[key])} onChange={(value) => set(key, value)} />}</Row>
  const quota = (key: string, label: string) => {
    const unlimited = key + 'Unlimited', invalid = draft[key] === '' || !Number.isSafeInteger(Number(draft[key])) || Number(draft[key]) < 0
    return <Row label={label} hint="不受限时不检查此项额度；关闭后恢复原有数值。0 表示暂停回复。">{(id) => <><div className="dy-quota"><input id={id} type="number" min={0} step={1} disabled={Boolean(draft[unlimited])} value={String(draft[key] ?? 0)} aria-invalid={!draft[unlimited] && invalid || undefined} onChange={(event) => set(key, event.target.value === '' ? '' : Number(event.target.value))} /><label htmlFor={id + '-unlimited'}>{t('不受限')}</label><Switch id={id + '-unlimited'} checked={Boolean(draft[unlimited])} onChange={(value) => { set(unlimited, value); if (value && invalid) set(key, 0) }} /></div>{!draft[unlimited] && invalid && <small role="alert">{t('请输入非负整数')}</small>}</>}</Row>
  }
  return <div className="dy-dm-settings"><Card title="回复联系人"><Row label="私信回复联系人限制" hint={HINTS.dmReplyOnlyTo} wide>{(id) => <ContactTags id={id} value={String(draft.dmReplyOnlyTo || '')} onChange={(value) => set('dmReplyOnlyTo', value)} />}</Row></Card>
    <Card title="私信巡检"><div className="dy-dm-grid">
      {toggle('dmAutoReply', '后台私信巡检', '使用事件监听并每 120 秒补漏；仅处理回复联系人名单。')}
      {toggle('dmReply', '轮次内回复私信', '刷视频轮次内处理回复联系人名单的新消息。')}
      {quota('dmReplyPerContact', '每日每人回复上限')}{quota('dmReplyPerDay', '每日私信回复总量')}
    </div></Card>
    <Card title="快速回复模型" aside={<div className="dy-model-toggle"><DetailIcon label={t('快速回复模型') + t('说明')}>{t(HINTS.dmFastReply)}</DetailIcon><Switch aria-label={t('使用快速回复模型')} checked={Boolean(draft.dmFastReply)} onChange={(value) => set('dmFastReply', value)} /></div>}>
      {Boolean(draft.dmFastReply) && <><div className="dy-dm-grid">
        <Row label="快速回复提供方">{(id) => <Select id={id} value={provider} disabled={loading} options={providers} onChange={(value) => { set('dmFastProvider', value); set('dmFastModel', value ? models.find((item) => item.provider === value)?.model || '' : '') }} />}</Row>
        <Row label="快速回复模型">{(id) => <Select id={id} value={model} disabled={loading} options={modelOptions} onChange={(value) => set('dmFastModel', value)} />}</Row>
        <Row label="快速回复推理等级">{(id) => <Select id={id} value={String(draft.dmFastReasoning || 'off')} options={[{ value: 'off', label: t('关闭') }, { value: 'low', label: t('低') }, { value: 'medium', label: t('中') }, { value: 'high', label: t('高') }]} onChange={(value) => set('dmFastReasoning', value)} />}</Row>
      </div><Feedback error={error} />{error && <button type="button" onClick={() => setVersion((value) => value + 1)}>{t('重新加载模型')}</button>}{loading && <p role="status">{t('加载模型列表')}…</p>}</>}
    </Card>
  </div>
}
