import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CUSTOM_CENTER_CONFIG,
  resolveCustomCenterConfig,
} from '../src/shared/config.ts'

describe('custom center configuration', () => {
  it('configuration defaults to enabled when no value is supplied', () => {
    expect(DEFAULT_CUSTOM_CENTER_CONFIG.enabled).toBe(true)
    expect(resolveCustomCenterConfig()).toEqual({ enabled: true, skills: true })
  })

  it('configuration keeps an explicit disable', () => {
    expect(resolveCustomCenterConfig({ enabled: false })).toEqual({ enabled: false, skills: true })
  })

  it('configuration falls back to the default for a non-boolean value', () => {
    const value = { enabled: 'no' as unknown as boolean }
    expect(resolveCustomCenterConfig(value)).toEqual({ enabled: true, skills: true })
  })
})
