/**
 * Host-half entry for the dsh-custom-center plugin.
 *
 * The host half runs in the DSH host process. It owns the wallpaper library:
 * a folder under the DSH home (`background/images`, `background/videos`) and
 * the loopback-only routes the browser half uses to list, upload and read it.
 * The host auto-generates this profile entry's settings page from the `Config`
 * schema below, so `enabled` is a real, persisted switch.
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { DEFAULT_CUSTOM_CENTER_CONFIG } from './core/config.ts'
import type {
  AgentDefaultModelLike,
  AgentPresetsLike,
  ConfigEditorLike,
  HostServices,
  LlmServiceLike,
  TuningHostServices,
} from './host/env.ts'
import { createLibraryRoutes, defaultLibraryRoot } from './host/library.ts'
import { createTuningRoutes } from './host/tuning.ts'

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

/** Host services the library routes need. */
export const inject = ['webServer', 'connection']

/**
 * Apply the host half: mount the wallpaper library and tuning routes.
 * @param ctx - host plugin context carrying `webServer` and `connection`.
 * @param config - validated plugin configuration.
 */
export function apply(ctx: Context, config?: Config): void {
  if (config?.enabled === false) return
  const host = ctx as unknown as Context & HostServices
  // Services are resolved per request: HMR can replace any of them while the
  // process keeps running, and the tuning routes must see the current instance.
  const services = (): TuningHostServices => ({
    configEditor: ctx.get('configEditor') as ConfigEditorLike | undefined,
    llm: ctx.get('llm') as LlmServiceLike | undefined,
    agentDefaultModel: ctx.get('agentDefaultModel') as AgentDefaultModelLike | undefined,
    agentPresets: ctx.get('agentPresets') as AgentPresetsLike | undefined,
  })
  const routes = [
    ...createLibraryRoutes({
      root: defaultLibraryRoot(),
      reject: (req) => host.connection.requestRejection(req),
    }),
    ...createTuningRoutes({
      services,
      reject: (req) => host.connection.requestRejection(req),
    }),
  ]
  for (const route of routes) {
    ctx.effect(() => host.webServer.register(route), `dsh-custom-center: ${route.path}`)
  }
}
