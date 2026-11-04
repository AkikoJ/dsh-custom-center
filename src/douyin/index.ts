import type { Context } from '@deepseek-ai/cordis'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { AgentDefaultModelConfig } from '@deepseek-ai/dsh-agent-default-model'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-tools'
import { Config } from './config.js'
import { PLUGIN_ID } from './contracts.js'
import type { HostServices } from '../shared/host-env.js'
import { createDouyinRuntime } from './server/runtime.js'
import { createDouyinRoutes } from './server/routes.js'
import { registerTools } from './server/tools.js'
import type { ConfigurationDependencies } from './server/configuration.js'
import { object } from './server/ledger-model.js'

export { Config }
export const name = PLUGIN_ID
export const inject = ['tools', 'webServer', 'connection']
interface SettingsService {
  describe(): { ns: string; revision?: number; value?: unknown; user?: unknown }[]
  update(ns: string, patch: object, revision?: number): Promise<void>
  configure(options: { auto?: boolean }): () => void
}
/** Standalone host entry: all side effects belong to its Cordis fiber. */
export function apply(ctx: Context, config?: unknown): void {
  const host = ctx as Context & HostServices
  const settings = (): SettingsService | undefined => ctx.get('settings') as SettingsService | undefined
  const bridge: ConfigurationDependencies['settings'] = {
    describe: () => (settings()?.describe() ?? []).map((row) => ({ ...row, user: object(row.user) ? row.user : undefined })),
    update: async (ns, patch, revision) => { const service = settings(); if (!service) throw new Error('设置服务暂不可用'); await service.update(ns, patch, revision) },
  }
  const runtime = createDouyinRuntime({
    initial: config,
    settings: bridge,
    services: () => ({ llm: ctx.get('llm') as LlmRuntime | undefined, agentDefaultModel: ctx.get('agentDefaultModel') as AgentDefaultModelConfig | undefined }),
    attachments: () => ctx.get('attachments') as AttachmentStore | undefined,
    credentials: () => ctx.get('credentials') as CredentialProvider | undefined,
  })
  // Runtime cleanup is registered first so later route/tool effects leave first.
  ctx.effect(() => () => runtime.dispose(), `${PLUGIN_ID}: runtime`)
  const policy = settings()
  if (policy) ctx.effect(() => policy.configure({ auto: false }), `${PLUGIN_ID}: settings page policy`)
  ctx.effect(() => registerTools(ctx.tools, runtime), `${PLUGIN_ID}: 35 tools`)
  for (const route of createDouyinRoutes({ runtime, reject: (request) => host.connection.requestRejection(request) })) {
    ctx.effect(() => host.webServer.register(route), PLUGIN_ID + ': ' + route.path)
  }
  runtime.start()
}
