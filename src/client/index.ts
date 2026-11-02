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
import type { ClientCtx } from '../shared/browser-env.ts'
import { ensureStyle } from './styles.ts'
import { NAV_SECTIONS, registerNavMarker } from './settings-nav.ts'
import { createController } from '../appearance/client/controller.ts'
import { AppearancePage } from '../appearance/client/AppearancePage.tsx'
import { TuningPage } from '../tuning/client/TuningPanel.tsx'
import * as skills from '../skills/client.ts'

/** Browser services this plugin requires before activation. */
export const inject = ['slots', 'theme']

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
