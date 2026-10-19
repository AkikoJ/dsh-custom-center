/**
 * Host-half entry for the dsh-custom-center plugin.
 *
 * The host half runs in the DSH host process. The host auto-generates this
 * profile entry's settings page from the `Config` schema below, so `enabled`
 * is already a real, persisted switch before any UI exists.
 *
 * Intended home for future host-side behavior:
 * - loopback HTTP routes for reading and writing customization assets;
 * - a registry that reconciles skins, themes, backgrounds and presets;
 * - an optional agent announcement behind an `announceToAgent` switch.
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { DEFAULT_CUSTOM_CENTER_CONFIG } from './core/config.ts'

/** Stable Cordis plugin name; keep it equal to the patch row id. */
export const name = 'ui-custom-center'

/** Host-side configuration surface. */
export interface Config {
  /** Master switch for the customization center. */
  enabled?: boolean
}

/**
 * Schema-backed settings page. `volatile()` is required for a field to appear
 * as an editable form input under the current DSH settings subsystem.
 */
export const Config = z.object({
  enabled: z.boolean().default(DEFAULT_CUSTOM_CENTER_CONFIG.enabled).volatile(),
})

/**
 * Apply the host half. The scaffold intentionally registers no routes or
 * services yet; add them here as the center grows.
 * @param _ctx - host plugin context.
 */
export function apply(_ctx: Context): void {
  // TODO: mount the customization asset API once the client half exists.
}
