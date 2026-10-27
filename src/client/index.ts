/**
 * Browser-half entry for dsh-custom-center.
 *
 * The DSH Web GUI loads this half through `window.__ModuleLoader__` from
 * `/plugins/ui-custom-center/client.js`. It registers TWO dedicated
 * `settings.section` pages, each its OWN entry in the Settings sidebar (NOT a
 * row in General): 外观 (wallpaper and skin, backed by the skin controller
 * ported from dsh-client-ui-skins) and 上下文与压缩 (backed by the tuning form).
 * A child plugin adds a third page, 技能, ported from dsh-skills-manager.
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
import { AppearancePage } from './AppearancePage.tsx'
import { TuningPage } from './TuningPage.tsx'
import * as skills from '../skills/client.ts'

/** Browser services this plugin requires before activation. */
export const inject = ['slots', 'theme']

/** Settings-nav marker so bundled CSS could later reskin these rows' icons. */
const NAV_MARKER = 'data-dsh-custom-center-nav'

/** The pages this plugin contributes, in Settings-sidebar order. */
const NAV_SECTIONS = [
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
function registerNavMarker(): () => void {
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

/**
 * Apply the browser half.
 * @param rawCtx - browser cordis context (narrowed to {@link ClientCtx}).
 */
export function apply(rawCtx: Context): void {
  const ctx = rawCtx as unknown as ClientCtx
  const theme = ctx.get('theme')

  ensureStyle()

  const controller = createController(theme, (handler) => ctx.on('theme/change', handler))

  // The plugin is Chinese-only, so the nav labels are constants.
  const [appearance, tuning] = NAV_SECTIONS

  ctx.effect(() => registerNavMarker(), 'dsh-custom-center: settings nav markers')
  ctx.effect(
    () =>
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: appearance.id,
            order: appearance.order,
            label: () => appearance.label,
          },
          (props) => createElement(AppearancePage, { ...props, controller }),
        ),
      ),
    'dsh-custom-center: appearance settings section',
  )
  ctx.effect(
    () =>
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: tuning.id,
            order: tuning.order,
            label: () => tuning.label,
          },
          () => createElement(TuningPage),
        ),
      ),
    'dsh-custom-center: tuning settings section',
  )
  ctx.effect(() => () => controller.dispose(), 'dsh-custom-center: controller lifecycle')

  // Skills management (ported from dsh-skills-manager) is its own fiber: it
  // needs `locale`, and a missing service must not block the pages above.
  rawCtx.plugin({ name: 'custom-center-skills', inject: skills.inject, apply: skills.apply as never })
}
