import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { MARKER_HEADER } from '../src/shared/request.ts'
import type { ConfigEditorLike, ConfigurationRow, TuningHostServices } from "../src/tuning/server/host-env.js";
import { createTuningRoutes, TUNING_PATH } from "../src/tuning/server/routes.js";

function request(method: string, body?: unknown, marker = true): IncomingMessage {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return {
    method,
    headers: marker ? { [MARKER_HEADER]: '1' } : {},
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  } as unknown as IncomingMessage
}

function response(): { res: ServerResponse; read: () => { status: number; body: Record<string, unknown> } } {
  let status = 0
  let text = ''
  const res = {
    headersSent: false,
    writeHead(code: number) {
      status = code
      return res
    },
    end(value: string) {
      text = value
    },
    destroy() {
      // no-op
    },
  }
  return {
    res: res as unknown as ServerResponse,
    read: () => ({ status, body: JSON.parse(text) as Record<string, unknown> }),
  }
}

function setup(): {
  services: TuningHostServices
  rows: ConfigurationRow[]
} {
  const routeConfig: Record<string, unknown> = {
    providers: {
      openai: {
        apiKeyEnv: 'OPENAI_API_KEY',
        models: [{ id: 'gpt-5.6-luna', contextWindow: 272_000 }],
      },
    },
  }
  const presetConfig: Record<string, unknown> = {
    id: 'standard',
    plugins: [
      { id: 'persona', name: '@deepseek-ai/dsh-persona' },
      {
        id: 'compaction',
        name: 'cordis:group',
        group: true,
        config: [
          { id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' },
        ],
      },
    ],
  }
  const rows: ConfigurationRow[] = [
    {
      entry: { options: { id: 'llm-pi-ai', name: '@deepseek-ai/dsh-llm-pi-ai', config: routeConfig } },
      inherited: {},
      override: routeConfig,
    },
    {
      entry: { options: { id: 'preset-standard', name: '@deepseek-ai/dsh-agent-preset', config: presetConfig } },
      inherited: {},
      override: presetConfig,
    },
  ]
  const editor: ConfigEditorLike = {
    configuration: () => rows,
    async edit(entry, change) {
      const row = rows.find((candidate) => candidate.entry === entry)
      if (row === undefined) throw new Error('missing row')
      row.entry.options.config = change(
        structuredClone(row.entry.options.config ?? {}),
        structuredClone(row.inherited),
      )
    },
  }
  return {
    rows,
    services: {
      configEditor: editor,
      llm: {
        async resolveModelInfo() {
          return {
            id: 'gpt-5.6-luna',
            name: 'GPT-5.6 Luna',
            context: { contextWindow: 272_000 },
            defaultMaxTokens: 128_000,
          }
        },
      },
      agentDefaultModel: { currentSelection: () => ({ provider: 'openai', model: 'gpt-5.6-luna' }) },
      agentPresets: { list: async () => [{ id: 'standard', name: '标准' }] },
    },
  }
}

async function invoke(
  services: TuningHostServices,
  req: IncomingMessage,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const handler = createTuningRoutes({ services: () => services, reject: () => undefined })
    .find((route) => route.path === TUNING_PATH)?.handler
  if (handler === undefined) throw new Error('route missing')
  const out = response()
  await handler(req, out.res)
  return out.read()
}

describe('tuning routes', () => {
  it('reads the current route and the preset policy', async () => {
    const { services } = setup()
    const result = await invoke(services, request('GET'))
    expect(result.status).toBe(200)
    const route = result.body['route'] as Record<string, unknown>
    expect(route['editable']).toBe(true)
    expect(route['strategy']).toBe('models')
    expect(route['contextWindow']).toBe(272_000)
    expect(route['maxTokens']).toBe(128_000)
    const presets = result.body['presets'] as Array<Record<string, unknown>>
    expect(presets).toHaveLength(1)
    expect(presets[0]?.['editable']).toBe(true)
    expect(presets[0]?.['computed']).toEqual({ thresholdTokens: 78_464, retainTokens: 23_040 })
  })

  it('writes the model window and the preset policy', async () => {
    const { services, rows } = setup()
    const result = await invoke(services, request('POST', {
      model: { contextWindow: 200_000, maxTokens: 32_000 },
      presetId: 'standard',
      compaction: { auto: false, thresholdRatio: 0.7, headroomTokens: 4_096, retainRatio: 0.1 },
    }))
    expect(result.status).toBe(200)
    expect(result.body['applied']).toEqual(['model', 'compaction'])

    const routeConfig = rows[0]?.entry.options.config as {
      providers: { openai: { models: Array<Record<string, unknown>> } }
    }
    expect(routeConfig.providers.openai.models[0]).toEqual({
      id: 'gpt-5.6-luna',
      contextWindow: 200_000,
      maxTokens: 32_000,
    })

    const presetConfig = rows[1]?.entry.options.config as {
      plugins: Array<{ id: string; config?: Array<{ id: string; config?: Record<string, unknown> }> }>
    }
    const group = presetConfig.plugins.find((row) => row.id === 'compaction')
    expect(group?.config?.[0]?.config).toEqual({
      auto: false,
      thresholdRatio: 0.7,
      headroomTokens: 4_096,
      retainRatio: 0.1,
    })
  })

  it('rejects a request without the same-origin marker', async () => {
    const { services } = setup()
    const result = await invoke(services, request('GET', undefined, false))
    expect(result.status).toBe(403)
    expect(result.body['error']).toBe('forbidden')
  })

  it('rejects an input that would leave no pressure budget', async () => {
    const { services } = setup()
    const result = await invoke(services, request('POST', {
      model: { contextWindow: 40_000, maxTokens: 32_000 },
      presetId: 'standard',
      compaction: { auto: true, thresholdRatio: 0.8, headroomTokens: 65_536, retainRatio: 0.16 },
    }))
    expect(result.status).toBe(409)
    expect(result.body['error']).toBe('invalid-budget')
  })
})

function multiSetup(): ReturnType<typeof setup> {
  const base = setup()
  const routeConfig = base.rows[0]!.entry.options.config as {
    providers: Record<string, { models?: Array<Record<string, unknown>>; apiKeyEnv?: string }>
  }
  routeConfig.providers['openai']!.models = [
    { id: 'gpt-a', contextWindow: 272_000, maxTokens: 128_000 },
    { id: 'gpt-b', contextWindow: 272_000, maxTokens: 128_000 },
  ]
  routeConfig.providers['anthropic'] = {
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    models: [
      { id: 'claude-a', contextWindow: 1_000_000, maxTokens: 128_000 },
      { id: 'claude-b', contextWindow: 1_000_000, maxTokens: 128_000 },
    ],
  }
  const catalog: Record<string, string[]> = { openai: ['gpt-a', 'gpt-b'], anthropic: ['claude-a', 'claude-b'] }
  const windows: Record<string, number> = { 'gpt-a': 272_000, 'gpt-b': 272_000, 'claude-a': 1_000_000, 'claude-b': 1_000_000 }
  base.services.llm = {
    async resolveModelInfo(_provider, model) {
      return { id: model, name: model.toUpperCase(), context: { contextWindow: windows[model] ?? 0 }, defaultMaxTokens: 128_000 }
    },
    listProviders: () => [{ id: 'openai', name: 'OpenAI' }, { id: 'anthropic', name: 'Anthropic' }],
    async listModels(provider) {
      return (catalog[provider] ?? []).map((id) => ({ provider, id, name: id }))
    },
  }
  base.services.agentDefaultModel = { currentSelection: () => ({ provider: 'anthropic', model: 'claude-a' }) }
  return base
}

function modelsOf(rows: ConfigurationRow[], provider: string): Array<Record<string, unknown>> {
  const config = rows[0]!.entry.options.config as { providers: Record<string, { models: Array<Record<string, unknown>> }> }
  return config.providers[provider]!.models
}

describe('tuning model targets', () => {
  const window = { contextWindow: 256_000, maxTokens: 32_768 }

  it('lists every advertised model with its owner', async () => {
    const { services } = multiSetup()
    const result = await invoke(services, request('GET'))
    const models = result.body['models'] as Array<Record<string, unknown>>
    expect(models.map((entry) => entry['model'])).toEqual(['gpt-a', 'gpt-b', 'claude-a', 'claude-b'])
    expect(models.find((entry) => entry['model'] === 'claude-a')?.['isCurrent']).toBe(true)
    expect(models.every((entry) => entry['editable'] === true)).toBe(true)
  })

  it('writes one chosen model and leaves the rest alone', async () => {
    const { services, rows } = multiSetup()
    const result = await invoke(services, request('POST', {
      model: window,
      target: { scope: 'model', provider: 'openai', model: 'gpt-b' },
    }))
    expect(result.status).toBe(200)
    expect(result.body['models']).toBe(1)
    expect(modelsOf(rows, 'openai')[1]).toMatchObject(window)
    expect(modelsOf(rows, 'openai')[0]).toMatchObject({ contextWindow: 272_000 })
    expect(modelsOf(rows, 'anthropic')[0]).toMatchObject({ contextWindow: 1_000_000 })
  })

  it('writes every model of one provider', async () => {
    const { services, rows } = multiSetup()
    const result = await invoke(services, request('POST', {
      model: window,
      target: { scope: 'provider', provider: 'anthropic' },
    }))
    expect(result.status).toBe(200)
    expect(result.body['models']).toBe(2)
    expect(modelsOf(rows, 'anthropic').map((entry) => entry['contextWindow'])).toEqual([256_000, 256_000])
    expect(modelsOf(rows, 'openai').map((entry) => entry['contextWindow'])).toEqual([272_000, 272_000])
  })

  it('writes all models in one scope', async () => {
    const { services, rows } = multiSetup()
    const result = await invoke(services, request('POST', { model: window, target: { scope: 'all' } }))
    expect(result.status).toBe(200)
    expect(result.body['models']).toBe(4)
    for (const provider of ['openai', 'anthropic']) {
      expect(modelsOf(rows, provider).every((entry) => entry['contextWindow'] === 256_000 && entry['maxTokens'] === 32_768)).toBe(true)
    }
  })

  it('keeps writing the current model when no target is sent', async () => {
    const { services, rows } = multiSetup()
    const result = await invoke(services, request('POST', { model: window }))
    expect(result.status).toBe(200)
    expect(result.body['models']).toBe(1)
    expect(modelsOf(rows, 'anthropic')[0]).toMatchObject(window)
    expect(modelsOf(rows, 'anthropic')[1]).toMatchObject({ contextWindow: 1_000_000 })
  })

  it('rejects a target without a window and an unknown scope', async () => {
    const { services } = multiSetup()
    const noWindow = await invoke(services, request('POST', { target: { scope: 'all' }, presetId: 'standard', compaction: { auto: true, thresholdRatio: 0.8, headroomTokens: 1, retainRatio: 0.1 } }))
    expect(noWindow.status).toBe(400)
    const badScope = await invoke(services, request('POST', { model: window, target: { scope: 'everything' } }))
    expect(badScope.status).toBe(400)
  })
})
