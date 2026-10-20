/**
 * Browser-half entry for dsh-custom-center.
 *
 * The DSH Web GUI loads this half through `window.__ModuleLoader__` from
 * `/plugins/ui-custom-center/client.js`. It registers a dedicated
 * `settings.section` page (its OWN entry in the Settings sidebar, NOT a row in
 * General), backed by the skin controller ported from dsh-client-ui-skins.
 *
 * The wallpaper library (list / upload / file) is served by the host half over
 * loopback-only routes; no source patch. Wallpapers never leave the machine
 * (the chosen image in localStorage, the chosen video in IndexedDB).
 */
import { createElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ClientCtx } from './dsh-env.ts'
import { ensureStyle } from './styles.ts'
import { createController } from './controller.ts'
import { CustomCenterPage } from './CustomCenterPage.tsx'

/** Browser services this plugin requires before activation. */
export const inject = ['slots', 'theme']

/** Settings-nav marker so bundled CSS could later reskin this row's icon. */
const NAV_MARKER = 'data-dsh-custom-center-nav'

/**
 * Keep {@link NAV_MARKER} on the settings-nav button whose visible text is this
 * plugin's nav label. DSH 0.1.x/0.2.x projects only id/order/label
 * from a `settings.section` registration and picks icons from a closed built-in
 * list, so the plugin can only mark its own row after the dialog mounts. The
 * marker owns no shell structure and is removed on disposal (HMR-safe).
 * @param label - nav label resolver.
 * @returns disposer that disconnects observation and clears owned markers.
 */
function registerNavMarker(label: () => string): () => void {
  let disposed = false
  let frame: number | null = null
  const sync = (): void => {
    if (disposed) return
    const current = label().trim()
    const buttons = document.querySelectorAll('[role="dialog"] nav button')
    for (const button of buttons) {
      if (current.length > 0 && button.textContent?.trim() === current) button.setAttribute(NAV_MARKER, '')
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

/**
 * Apply the browser half.
 * @param rawCtx - browser cordis context (narrowed to {@link ClientCtx}).
 */
export function apply(rawCtx: Context): void {
  const ctx = rawCtx as unknown as ClientCtx
  const theme = ctx.get('theme')

  ensureStyle()

  const controller = createController(theme, (handler) => ctx.on('theme/change', handler))

  // The plugin is Chinese-only, so the nav label is a constant.
  const navLabel = (): string => '个性化'

  ctx.effect(() => registerNavMarker(navLabel), 'dsh-custom-center: settings nav marker')
  ctx.effect(
    () =>
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'custom-center',
            order: 40,
            label: () => navLabel(),
          },
          (props) => createElement(CustomCenterPage, { ...props, controller }),
        ),
      ),
    'dsh-custom-center: settings section',
  )
  ctx.effect(() => () => controller.dispose(), 'dsh-custom-center: controller lifecycle')
}
