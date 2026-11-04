import { useId, type ReactNode } from 'react'
import { useText } from './messages.js'
import { FIELDS, type Tab } from './fields.js'
import type { Data } from './api.js'
export function Card({ title, children }: { title: string; children: ReactNode }) { const t = useText(); return <section className="dy-card"><h2>{t(title)}</h2>{children}</section> }
export function Feedback({ error, busy }: { error?: string; busy?: string }) { const t = useText(); return <>{busy && <p role="status">{t('执行中')}…</p>}{error && <p className="dy-feedback dy-error" role="alert">{error}</p>}</> }
export function ConfigFields({ tab, draft, set }: { tab: Tab; draft: Data; set(key: string, value: unknown): void }) {
 const t = useText(), prefix = useId()
 return <div>{FIELDS.filter((field) => field.tab === tab).map((field) => {
  const id = prefix + field.key, value = draft[field.key]
  return <div className="dy-field" key={field.key}><label htmlFor={id}>{t(field.label)}</label>{field.type === 'boolean'
   ? <input id={id} type="checkbox" checked={Boolean(value)} onChange={(event) => set(field.key, event.target.checked)} />
   : field.options ? <select id={id} value={String(value ?? '')} onChange={(event) => set(field.key, event.target.value)}>{field.options.map((option) => <option key={option}>{option}</option>)}</select>
   : field.type === 'textarea' ? <textarea id={id} value={String(value ?? '')} onChange={(event) => set(field.key, event.target.value)} />
   : <input id={id} type={field.type === 'number' ? 'number' : 'text'} min={field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? 1 : undefined} value={Array.isArray(value) ? value.join(', ') : String(value ?? '')} onChange={(event) => set(field.key, field.type === 'number' ? event.target.value === '' ? '' : Number(event.target.value) : field.type === 'list' ? event.target.value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean) : event.target.value)} />}</div>
 })}</div>
}
export function Result({ value }: { value: Data | null }) { const t = useText(); return value && <details className="dy-card"><summary>{t('诊断结果')}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details> }
