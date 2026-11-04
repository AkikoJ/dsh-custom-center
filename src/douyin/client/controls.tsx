import { useId, type ReactNode } from 'react'
import { useText } from './messages.js'
import { FIELDS, type Tab } from './fields.js'
import { fieldVisible, GROUP_STARTS, HINTS } from './configuration-layout.js'
import { Outcome } from './Outcome.js'
import type { Data } from './api.js'
export function Card({ title, children }: { title: string; children: ReactNode }) { const t = useText(); return <section className="dy-card"><h2>{t(title)}</h2>{children}</section> }
export function Feedback({ error, busy }: { error?: string; busy?: string }) { const t = useText(); return <>{busy && <p role="status">{t('执行中')}…</p>}{error && <p className="dy-feedback dy-error" role="alert">{error}</p>}</> }
export function ConfigFields({ tab, draft, set }: { tab: Tab; draft: Data; set(key: string, value: unknown): void }) {
 const t = useText(), prefix = useId()
 return <div>{FIELDS.filter((field) => field.tab === tab && fieldVisible(field, draft)).map((field) => {
  const id = prefix + field.key, value = draft[field.key], hint = field.hint || HINTS[field.key]
  const invalid = field.type === 'number' && value !== undefined && (value === '' || !Number.isSafeInteger(Number(value)) || Number(value) < 0)
  const props = { id, 'aria-describedby': [hint ? id + '-hint' : '', invalid ? id + '-error' : ''].filter(Boolean).join(' ') || undefined, 'aria-invalid': invalid || undefined }
  return <section key={field.key}>{GROUP_STARTS[field.key] && <h3>{t(GROUP_STARTS[field.key])}</h3>}<div className="dy-field"><label htmlFor={id}>{t(field.label)}{hint && <small id={id + '-hint'}>{t(hint)}</small>}</label><div>{field.type === 'boolean'
   ? <input {...props} type="checkbox" checked={Boolean(value)} onChange={(event) => set(field.key, event.target.checked)} />
   : field.options ? <select {...props} value={String(value ?? '')} onChange={(event) => set(field.key, event.target.value)}>{field.options.map((option) => <option key={option}>{option}</option>)}</select>
   : field.type === 'textarea' ? <textarea {...props} value={String(value ?? '')} onChange={(event) => set(field.key, event.target.value)} />
   : <input {...props} type={field.type === 'number' ? 'number' : 'text'} min={field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? 1 : undefined} value={Array.isArray(value) ? value.join(', ') : String(value ?? '')} onChange={(event) => set(field.key, field.type === 'number' ? event.target.value === '' ? '' : Number(event.target.value) : field.type === 'list' ? event.target.value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean) : event.target.value)} />}{invalid && <small id={id + '-error'} role="alert">{t('请输入非负整数')}</small>}</div></div></section>
 })}</div>
}
export function Result({ value }: { value: Data | null }) { const t = useText(); return value && <><Outcome value={value} /><details className="dy-card"><summary>{t('诊断结果')}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details></> }
