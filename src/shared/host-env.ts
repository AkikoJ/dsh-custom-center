/**
 * Minimal structural typings for the host services this plugin calls. The
 * installed SDK ships no host service types, so the narrow faces are declared
 * here; they mirror the live `webServer`, `connection` and configuration
 * services.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

/** One exact-path route on the Web carrier. */
export interface WebRoute {
  kind: 'exact'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** The host services the plugin injects. */
export interface HostServices {
  webServer: {
    /** Register a route; returns its disposer. */
    register(route: WebRoute): () => void
  }
  connection: {
    /** Host/Origin fence plus browser authentication; undefined means accepted. */
    requestRejection(request: { headers: IncomingMessage['headers'] }): 401 | 403 | undefined
  }
}

/** One active Loader entry as exposed by the configuration editor. */
export interface ConfigEntryLike {
  options: {
    id: string
    name: string
    config?: Record<string, unknown>
  }
}

/** One row of `configEditor.configuration()`. */
export interface ConfigurationRow {
  entry: ConfigEntryLike
  inherited: Record<string, unknown>
  override: Record<string, unknown>
}

/** The profile configuration editor service. */
export interface ConfigEditorLike {
  /** Read active entries together with their inherited and explicit values. */
  configuration(): ConfigurationRow[]
  /**
   * Validate, persist and reconcile one plugin's next config.
   * @param entry - current Loader entry.
   * @param change - derives the next raw config from current and inherited values.
   */
  edit(
    entry: ConfigEntryLike,
    change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void>
}

/** Resolved model metadata the tuning tab reads. */
export interface ResolvedModelInfoLike {
  id: string
  name?: string
  context?: { contextWindow: number }
  defaultMaxTokens?: number
}

/** The LLM route registry. */
export interface LlmServiceLike {
  /** Resolve the metadata of one exact provider/model route. */
  resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<ResolvedModelInfoLike>
  /** Provider routes with a registered adapter. */
  listProviders?(): ReadonlyArray<{ id: string; name: string }>
  /** Models one provider advertises. */
  listModels?(provider: string): Promise<ReadonlyArray<{ provider: string; id: string; name: string }>>
}

/** The default model selection service. */
export interface AgentDefaultModelLike {
  /** Current provider/model pair. */
  currentSelection(): { provider: string; model: string }
}

/** One agent preset row as reported by the registry. */
export interface AgentPresetRow {
  id: string
  name?: string
  description?: string
  order?: number
  broken?: string
}

/** The agent preset registry. */
export interface AgentPresetsLike {
  /** Every declared preset, including activation failures. */
  list(): Promise<AgentPresetRow[]>
  /** Roster with the deployment default marked; preferred when available. */
  remoteExportList?(): Promise<{ presets: Array<AgentPresetRow & { isDefault?: boolean }> }>
}

/** Services the tuning routes read lazily at request time. */
export interface TuningHostServices {
  configEditor?: ConfigEditorLike
  llm?: LlmServiceLike
  agentDefaultModel?: AgentDefaultModelLike
  agentPresets?: AgentPresetsLike
}
