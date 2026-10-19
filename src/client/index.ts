/**
 * Browser-half entry for the dsh-custom-center plugin.
 *
 * The DSH Web GUI loads this half through `window.__ModuleLoader__` from
 * `/plugins/ui-custom-center/client.js`. A future implementation should:
 * - inject `slots`, `locale` and any host data service it needs;
 * - register a first-level `settings.section` (or a sidebar entry) for the
 *   customization center;
 * - keep all writes on the host side, behind same-origin loopback routes.
 *
 * The file is deliberately side-effect free today: the built `lib/client.js`
 * loads cleanly and mounts nothing.
 */
import type { Context } from '@deepseek-ai/cordis'

/**
 * Apply the browser half.
 * @param _ctx - browser plugin context.
 */
export function apply(_ctx: Context): void {
  // TODO: register the customization center's settings section or sidebar seat.
}
