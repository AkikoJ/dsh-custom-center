/** Settings-nav marker so bundled CSS could later reskin these rows' icons. */
const NAV_MARKER = 'data-dsh-custom-center-nav'

/** The pages this plugin contributes, in Settings-sidebar order. */
export const NAV_SECTIONS = [
  { id: 'custom-center-appearance', label: '外观', marker: 'appearance', order: 40 },
  { id: 'custom-center-tuning', label: '上下文与压缩', marker: 'tuning', order: 41 },
] as const

/**
 * Keep {@link NAV_MARKER} on the settings-nav buttons this plugin owns, keyed by
 * their visible label. DSH 0.1.x/0.2.x projects only id/order/label from a
 * `settings.section` registration and picks icons from a closed built-in list,
 * so the plugin can only mark its own rows after the dialog mounts. The marker
 * owns no shell structure and is removed on disposal (HMR-safe).
 * @returns disposer that disconnects observation and clears owned markers.
 */
export function registerNavMarker(): () => void {
  let disposed = false
  let frame: number | null = null
  const markers = new Map<string, string>(
    NAV_SECTIONS.map((section) => [section.label, section.marker]),
  )
  const sync = (): void => {
    if (disposed) return
    const buttons = document.querySelectorAll('[role="dialog"] nav button')
    for (const button of buttons) {
      const marker = markers.get(button.textContent?.trim() ?? '')
      if (marker !== undefined) button.setAttribute(NAV_MARKER, marker)
      else button.removeAttribute(NAV_MARKER)
    }
  }
  const schedule = (): void => {
    if (disposed || frame !== null) return
    frame = requestAnimationFrame(() => {
      frame = null
      sync()
    })
  }
  sync()
  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    disposed = true
    observer.disconnect()
    if (frame !== null) cancelAnimationFrame(frame)
    document.querySelectorAll(`[${NAV_MARKER}]`).forEach((el) => el.removeAttribute(NAV_MARKER))
  }
}
