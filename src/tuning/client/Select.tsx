/**
 * A small themed dropdown that replaces the native `<select>`.
 *
 * It follows the WAI-ARIA select-only combobox pattern: a button that owns a
 * `listbox` popup, with arrow / Home / End / Enter / Escape keyboard support
 * and focus returning to the button after a choice. The popup flips upward
 * when there is not enough room below the button.
 */
import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

/** One selectable entry. */
export interface SelectOption {
  value: string
  /** Shown on the closed control and used as the tooltip. */
  label: string
  /** Shown in the open list instead of `label`, e.g. without a group prefix. */
  menuLabel?: string
  /** Heading drawn above the first option of each run that shares a group. */
  group?: string
  disabled?: boolean
}

export interface SelectProps {
  value: string
  options: readonly SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  /** Accessible name when no visible label is associated. */
  ariaLabel?: string
  /** Id of the element that labels the control. */
  ariaLabelledBy?: string
}

/** Approximate popup height used to decide whether to flip upward. */
const POPUP_ROOM = 240

function enabledIndexes(options: readonly SelectOption[]): number[] {
  const out: number[] = []
  options.forEach((option, index) => {
    if (option.disabled !== true) out.push(index)
  })
  return out
}

export function Select(props: SelectProps): JSX.Element {
  const { value, options, onChange, disabled = false, ariaLabel, ariaLabelledBy } = props
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [flip, setFlip] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const listId = useId()

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  function openList(): void {
    if (disabled) return
    const rect = buttonRef.current?.getBoundingClientRect()
    setFlip(rect !== undefined && window.innerHeight - rect.bottom < POPUP_ROOM && rect.top > POPUP_ROOM / 2)
    setActive(selectedIndex >= 0 && options[selectedIndex]?.disabled !== true ? selectedIndex : (enabledIndexes(options)[0] ?? -1))
    setOpen(true)
  }

  function closeList(refocus: boolean): void {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  function choose(index: number): void {
    const option = options[index]
    if (option === undefined || option.disabled === true) return
    closeList(true)
    if (option.value !== value) onChange(option.value)
  }

  function step(delta: 1 | -1): void {
    const indexes = enabledIndexes(options)
    if (indexes.length === 0) return
    const at = indexes.indexOf(active)
    const next = at < 0 ? (delta === 1 ? 0 : indexes.length - 1) : (at + delta + indexes.length) % indexes.length
    setActive(indexes[next] ?? -1)
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (disabled) return
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault()
        if (!open) openList()
        else step(event.key === 'ArrowDown' ? 1 : -1)
        break
      case 'Home':
      case 'End': {
        if (!open) break
        event.preventDefault()
        const indexes = enabledIndexes(options)
        setActive((event.key === 'Home' ? indexes[0] : indexes[indexes.length - 1]) ?? -1)
        break
      }
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (!open) openList()
        else choose(active)
        break
      case 'Escape':
        if (open) {
          event.preventDefault()
          event.stopPropagation()
          closeList(false)
        }
        break
      case 'Tab':
        if (open) setOpen(false)
        break
      default:
        break
    }
  }

  // Close on an outside press or when the control becomes disabled.
  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event: PointerEvent): void {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  return (
    <div className="dsh-cc-select" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="dsh-cc-select-btn"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={() => (open ? closeList(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="dsh-cc-select-value" title={selected?.label}>{selected?.label ?? ''}</span>
        <svg className="dsh-cc-select-caret" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className={`dsh-cc-select-list${flip ? ' dsh-cc-select-list-up' : ''}`}
          aria-labelledby={ariaLabelledBy}
          aria-label={ariaLabel}
        >
          {options.map((option, index) => (
            <Fragment key={option.value}>
              {option.group !== undefined && option.group !== options[index - 1]?.group && (
                <li role="presentation" className="dsh-cc-select-group">{option.group}</li>
              )}
              <li
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === selectedIndex}
                aria-disabled={option.disabled === true ? true : undefined}
                className={[
                  'dsh-cc-select-opt',
                  index === active ? 'dsh-cc-select-opt-active' : '',
                  option.disabled === true ? 'dsh-cc-select-opt-disabled' : '',
                ].filter(Boolean).join(' ')}
                onPointerEnter={() => {
                  if (option.disabled !== true) setActive(index)
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                <span className="dsh-cc-select-check" aria-hidden="true">{index === selectedIndex ? '\u2713' : ''}</span>
                <span className="dsh-cc-select-label" title={option.menuLabel ?? option.label}>{option.menuLabel ?? option.label}</span>
              </li>
            </Fragment>
          ))}
        </ul>
      )}
    </div>
  )
}
