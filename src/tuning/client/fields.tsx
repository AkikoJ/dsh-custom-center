import { type ReactNode } from "react";

export function formatTokens(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

/** One settings row: label and description on the left, control on the right. */
export function Row(props: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }): JSX.Element {
  return (
    <div className="dsh-cc-row">
      <div className="dsh-cc-row-text">
        {props.htmlFor === undefined ? (
          <span className="dsh-cc-row-label">{props.label}</span>
        ) : (
          <label className="dsh-cc-row-label" htmlFor={props.htmlFor}>{props.label}</label>
        )}
        {props.hint !== undefined && <span className="dsh-cc-row-hint">{props.hint}</span>}
      </div>
      <div className="dsh-cc-row-control">{props.children}</div>
    </div>
  )
}

/** Number input with an inline unit suffix. */
export function NumberField(props: {
  id: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  unit?: string
}): JSX.Element {
  return (
    <span className={props.unit === undefined ? 'dsh-cc-input' : 'dsh-cc-input dsh-cc-input-unit'}>
      <input
        id={props.id}
        type="number"
        inputMode="decimal"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.unit !== undefined && <span className="dsh-cc-input-suffix" aria-hidden="true">{props.unit}</span>}
    </span>
  )
}
