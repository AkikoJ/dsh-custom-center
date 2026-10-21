import { describe, expect, it } from 'vitest'
import {
  COMPACTION_DEFAULTS,
  RECOMMENDED,
  buildTargetOptions,
  modelsInScope,
  parseTargetKey,
  targetKeyOfModel,
  targetKeyOfProvider,
  validateModelTarget,
  type ModelEntryView,
  TuningError,
  applyModelWindow,
  computeCompaction,
  hasCompactionRow,
  modelWindowStrategy,
  parseTuningSaveRequest,
  readCompactionValues,
  routeKindForProvider,
  setPresetCompaction,
  validateCompactionValues,
  validateModelWindow,
  writeCompactionValues,
  type CompactionValues,
} from '../src/core/tuning.ts'

const plugins = [
  { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'hi' } },
  {
    id: 'compaction',
    name: 'cordis:group',
    group: true,
    isolate: { compaction: true },
    config: [
      { id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' },
      { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
    ],
  },
]

const policy: CompactionValues = {
  auto: true,
  thresholdRatio: 0.75,
  headroomTokens: 32_000,
  retainRatio: 0.1,
}

describe('compaction budget', () => {
  it('derives the same threshold and retention as the backend', () => {
    const result = computeCompaction(1_000_000, 256_000, {
      auto: true,
      thresholdRatio: 0.8,
      headroomTokens: 65_536,
      retainRatio: 0.16,
    })
    expect(result.thresholdTokens).toBe(678_464)
    expect(result.retainTokens).toBe(119_040)
  })

  it('honours an absolute retention budget', () => {
    const result = computeCompaction(200_000, 32_000, {
      auto: true,
      thresholdRatio: 0.8,
      headroomTokens: 8_000,
      retainTokens: 4_096,
    })
    expect(result.thresholdTokens).toBe(160_000)
    expect(result.retainTokens).toBe(4_096)
  })

  it('refuses a window with no pressure budget', () => {
    expect(() => computeCompaction(100_000, 20_000, {
      auto: true,
      thresholdRatio: 0.8,
      headroomTokens: 90_000,
      retainRatio: 0.1,
    })).toThrow(TuningError)
  })

  it('refuses retention that does not fit below the threshold', () => {
    expect(() => computeCompaction(100_000, 20_000, {
      auto: true,
      thresholdRatio: 0.5,
      headroomTokens: 1_000,
      retainTokens: 60_000,
    })).toThrow(TuningError)
  })
})

describe('tuning validation', () => {
  it('validates a model window', () => {
    expect(validateModelWindow({ contextWindow: 400_000, maxTokens: 65_536 }))
      .toEqual({ contextWindow: 400_000, maxTokens: 65_536 })
    expect(() => validateModelWindow({ contextWindow: 65_536, maxTokens: 65_536 })).toThrow(TuningError)
    expect(() => validateModelWindow({ contextWindow: 0, maxTokens: 1 })).toThrow(TuningError)
    expect(() => validateModelWindow({ contextWindow: 10, maxTokens: 1.5 })).toThrow(TuningError)
  })

  it('rejects both retention forms at once', () => {
    expect(() => validateCompactionValues({
      auto: true,
      thresholdRatio: 0.8,
      headroomTokens: 1_000,
      retainRatio: 0.1,
      retainTokens: 2_000,
    })).toThrow(TuningError)
  })

  it('rejects a retention ratio not below the threshold ratio', () => {
    expect(() => validateCompactionValues({
      auto: true,
      thresholdRatio: 0.5,
      headroomTokens: 1_000,
      retainRatio: 0.5,
    })).toThrow(TuningError)
  })

  it('parses a save body and requires a preset id with compaction', () => {
    expect(parseTuningSaveRequest({ model: { contextWindow: 200_000, maxTokens: 32_000 } }))
      .toEqual({ model: { contextWindow: 200_000, maxTokens: 32_000 } })
    expect(() => parseTuningSaveRequest({ compaction: policy })).toThrow(TuningError)
    expect(parseTuningSaveRequest({ presetId: 'standard', compaction: policy }))
      .toEqual({ presetId: 'standard', compaction: policy })
    expect(() => parseTuningSaveRequest({})).toThrow(TuningError)
  })
})

describe('preset compaction rows', () => {
  it('reads defaults when no compaction row exists', () => {
    expect(hasCompactionRow([{ id: 'persona' }])).toBe(false)
    expect(readCompactionValues([{ id: 'persona' }])).toEqual({
      auto: COMPACTION_DEFAULTS.auto,
      thresholdRatio: COMPACTION_DEFAULTS.thresholdRatio,
      headroomTokens: COMPACTION_DEFAULTS.headroomTokens,
      retainRatio: COMPACTION_DEFAULTS.retainRatio,
    })
  })

  it('reads a nested policy', () => {
    const rows = structuredClone(plugins)
    const group = rows[1] as { config: { id: string; config?: Record<string, unknown> }[] }
    group.config[0]!.config = { auto: false, thresholdRatio: 0.7, headroomTokens: 4_096, retainTokens: 8_192 }
    expect(readCompactionValues(rows)).toEqual({
      auto: false,
      thresholdRatio: 0.7,
      headroomTokens: 4_096,
      retainTokens: 8_192,
    })
  })

  it('writes only the compaction row and switches retention form', () => {
    const before = structuredClone(plugins)
    const next = writeCompactionValues(plugins, policy) as Array<Record<string, unknown>>
    expect(plugins).toEqual(before)
    expect(next[0]).toEqual(before[0])
    const group = next[1] as { isolate: { compaction: boolean }; config: { config?: Record<string, unknown> }[] }
    expect(group.isolate).toEqual({ compaction: true })
    expect(group.config[0]?.config).toEqual({
      auto: true,
      thresholdRatio: 0.75,
      headroomTokens: 32_000,
      retainRatio: 0.1,
    })
    expect(group.config[1]).toEqual({ id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' })
  })

  it('replaces a preset config without touching siblings or the input', () => {
    const config = { id: 'standard', plugins, persona: { name: 'x' } }
    const next = setPresetCompaction(config, policy)
    expect(config).toEqual({ id: 'standard', plugins, persona: { name: 'x' } })
    expect(next['id']).toBe('standard')
    expect(next['persona']).toEqual({ name: 'x' })
    expect(hasCompactionRow(next['plugins'])).toBe(true)
  })
})

describe('model route config', () => {
  it('maps providers to route families', () => {
    expect(routeKindForProvider('deepseek-account')).toBe('deepseek-account')
    expect(routeKindForProvider('deepseek-official')).toBe('deepseek-api-key')
    expect(routeKindForProvider('openai')).toBe('pi-ai')
  })

  it('writes deepseek-account model overrides and preserves existing fields', () => {
    const config = {
      modelOverrides: {
        'deepseek-flash': { imagePixelBudget: 4_000 },
      },
      reasoningEffort: 'high',
    }
    const next = applyModelWindow('deepseek-account', config, 'deepseek-account', 'deepseek-flash', {
      contextWindow: 400_000,
      maxTokens: 65_536,
    })
    expect(next['reasoningEffort']).toBe('high')
    expect(next['modelOverrides']).toEqual({
      'deepseek-flash': { imagePixelBudget: 4_000, contextWindow: 400_000, maxTokens: 65_536 },
    })
    expect(config['modelOverrides']['deepseek-flash']).toEqual({ imagePixelBudget: 4_000 })
  })

  it('updates the API-key catalog and appends an unknown model', () => {
    const config = { models: [{ id: 'deepseek-flash', contextWindow: 1_000_000 }] }
    const next = applyModelWindow('deepseek-api-key', config, 'deepseek-official', 'deepseek-flash', {
      contextWindow: 500_000,
      maxTokens: 32_000,
    }) as { models: Array<Record<string, unknown>> }
    expect(next.models).toEqual([{ id: 'deepseek-flash', contextWindow: 500_000, maxTokens: 32_000 }])
    const appended = applyModelWindow('deepseek-api-key', config, 'deepseek-official', 'deepseek-v4-pro', {
      contextWindow: 300_000,
      maxTokens: 16_000,
    }) as { models: Array<Record<string, unknown>> }
    expect(appended.models).toHaveLength(2)
    expect(appended.models[1]).toEqual({ id: 'deepseek-v4-pro', contextWindow: 300_000, maxTokens: 16_000 })
  })

  it('edits a pi-ai catalog when present, otherwise model overrides', () => {
    const catalog = {
      providers: {
        openai: {
          apiKeyEnv: 'OPENAI_API_KEY',
          models: [{ id: 'gpt-5.6-luna', contextWindow: 272_000 }],
        },
        local: { apiKeyEnv: 'LOCAL_KEY' },
      },
    }
    const fromCatalog = applyModelWindow('pi-ai', catalog, 'openai', 'gpt-5.6-luna', {
      contextWindow: 200_000,
      maxTokens: 32_000,
    }) as { providers: Record<string, Record<string, unknown>> }
    expect(fromCatalog.providers['openai']?.['models']).toEqual([
      { id: 'gpt-5.6-luna', contextWindow: 200_000, maxTokens: 32_000 },
    ])
    const fromOverrides = applyModelWindow('pi-ai', catalog, 'local', 'tiny', {
      contextWindow: 32_000,
      maxTokens: 4_000,
    }) as { providers: Record<string, Record<string, unknown>> }
    expect(fromOverrides.providers['local']?.['modelOverrides']).toEqual({
      tiny: { contextWindow: 32_000, maxTokens: 4_000 },
    })
  })

  it('reports the storage strategy', () => {
    expect(modelWindowStrategy('deepseek-account', {}, 'deepseek-account')).toBe('modelOverrides')
    expect(modelWindowStrategy('deepseek-api-key', {}, 'deepseek-official')).toBe('models')
    expect(modelWindowStrategy('pi-ai', { providers: { x: { models: [{ id: 'm' }] } } }, 'x')).toBe('models')
    expect(modelWindowStrategy('pi-ai', { providers: { x: {} } }, 'x')).toBe('modelOverrides')
  })

  it('refuses an unknown pi-ai provider', () => {
    expect(() => applyModelWindow('pi-ai', { providers: {} }, 'missing', 'm', {
      contextWindow: 1_000,
      maxTokens: 100,
    })).toThrow(TuningError)
  })
})

describe('recommended values', () => {
  it('compact at the ratio on a 272k window and leave a message budget', () => {
    const result = computeCompaction(RECOMMENDED.contextWindow, RECOMMENDED.maxTokens, {
      auto: RECOMMENDED.auto,
      thresholdRatio: RECOMMENDED.thresholdRatio,
      headroomTokens: RECOMMENDED.headroomTokens,
      retainRatio: RECOMMENDED.retainRatio,
    })
    expect(result.thresholdTokens).toBe(217_600)
    expect(result.retainTokens).toBe(38_277)
  })
})

describe('model targets', () => {
  const models: ModelEntryView[] = [
    { provider: 'openai', providerName: 'OpenAI', model: 'a', editable: true },
    { provider: 'openai', providerName: 'OpenAI', model: 'b', editable: true },
    { provider: 'anthropic', model: 'c', editable: true, isCurrent: true },
    { provider: 'deepseek-account', model: 'd', editable: false },
  ]

  it('round-trips keys, including model ids that contain a colon', () => {
    expect(parseTargetKey(targetKeyOfModel('openai', 'a:b'))).toEqual({ scope: 'model', provider: 'openai', model: 'a:b' })
    expect(parseTargetKey(targetKeyOfProvider('openai'))).toEqual({ scope: 'provider', provider: 'openai' })
    expect(parseTargetKey('all')).toEqual({ scope: 'all' })
    expect(parseTargetKey('garbage')).toBeUndefined()
  })

  it('selects the models a key covers', () => {
    expect(modelsInScope(models, 'all')).toHaveLength(4)
    expect(modelsInScope(models, targetKeyOfProvider('openai')).map((entry) => entry.model)).toEqual(['a', 'b'])
    expect(modelsInScope(models, targetKeyOfModel('anthropic', 'c'))).toHaveLength(1)
  })

  it('offers group entries only where they cover several editable models', () => {
    const options = buildTargetOptions(models)
    expect(options[0]).toMatchObject({ value: 'all', label: '全部模型（3 个）' })
    expect(options.filter((option) => option.value.startsWith('p:')).map((option) => option.value)).toEqual(['p:openai'])
    const readOnly = options.find((option) => option.value === targetKeyOfModel('deepseek-account', 'd'))
    expect(readOnly?.disabled).toBe(true)
    expect(options.find((option) => option.value === targetKeyOfModel('anthropic', 'c'))?.label).toContain('当前默认')
  })

  it('lists each provider as one group with its own all-models entry first', () => {
    const options = buildTargetOptions(models)
    expect(options.map((option) => option.group)).toEqual([undefined, 'OpenAI', 'OpenAI', 'OpenAI', 'anthropic', 'deepseek-account'])
    const [, groupAll, first] = options
    expect(groupAll).toMatchObject({ value: 'p:openai', menuLabel: '全部 2 个模型', group: 'OpenAI' })
    expect(first).toMatchObject({ menuLabel: 'a', label: 'OpenAI / a' })
    const runs = options.map((option) => option.group).filter((group, index, all) => index === 0 || group !== all[index - 1])
    expect(runs).toEqual([undefined, 'OpenAI', 'anthropic', 'deepseek-account'])
  })

  it('validates untrusted targets', () => {
    expect(validateModelTarget({ scope: 'all' })).toEqual({ scope: 'all' })
    expect(() => validateModelTarget({ scope: 'model', provider: 'x' })).toThrow(TuningError)
    expect(() => validateModelTarget({ scope: 'provider' })).toThrow(TuningError)
    expect(() => validateModelTarget('all')).toThrow(TuningError)
  })
})
