import { describe, expect, it } from 'vitest'
import { contrast } from '../src/appearance/color.ts'
import { TOKEN_NAMES, deriveTokens } from '../src/appearance/skins.ts'

describe('token derivation', () => {
  const seeds = { accent: '#4d6bfe', secondary: '#6e8bff', surface: '#0e1420', text: '#e8edf7' }

  it('produces a flat string map covering every known token', () => {
    const tokens = deriveTokens(seeds)
    for (const name of TOKEN_NAMES) {
      expect(typeof tokens[name]).toBe('string')
      expect(tokens[name].length).toBeGreaterThan(0)
    }
  })

  it('maps the accent straight onto the brand primary token', () => {
    expect(deriveTokens(seeds)['--dsw-alias-brand-primary']).toBe('#4d6bfe')
  })

  it('keeps primary label text readable against the base surface', () => {
    const tokens = deriveTokens(seeds, { appearance: 'dark' })
    const ratio = contrast(tokens['--dsw-alias-label-primary'], seeds.surface)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  it('emits translucent washes for a custom photo skin', () => {
    const tokens = deriveTokens(seeds, { translucent: true, appearance: 'dark', backgroundAlpha: 0.5 })
    expect(tokens['--dsw-alias-bg-base']).toBe('rgba(14, 16, 22, 0.5)')
  })

  it('paints the sidebar with the centre wash until a separate left value is given', () => {
    for (const appearance of ['light', 'dark'] as const) {
      const tokens = deriveTokens(seeds, { translucent: true, appearance, backgroundAlpha: 0.96 })
      expect(tokens['--dsw-specific-sidebar-fill']).toBe(tokens['--dsw-alias-bg-base'])
    }
  })

  it('lets the left and right veil be set independently', () => {
    const tokens = deriveTokens(seeds, {
      translucent: true,
      appearance: 'dark',
      backgroundAlpha: 0.8,
      sidebarAlpha: 0.2,
    })
    expect(tokens['--dsw-alias-bg-base']).toBe('rgba(14, 16, 22, 0.8)')
    expect(tokens['--dsw-specific-sidebar-fill']).toBe('rgba(14, 16, 22, 0.2)')
  })

  it('keeps tooltip and toast fills dark because DSH draws their text in white', () => {
    for (const appearance of ['light', 'dark'] as const) {
      const tokens = deriveTokens(seeds, { translucent: true, appearance })
      for (const name of ['--dsw-alias-tooltip-bg', '--dsw-alias-toast-bg']) {
        const [r, g, b] = (tokens[name].match(/[\d.]+/g) ?? []).map(Number)
        expect(Math.max(r, g, b)).toBeLessThan(80)
      }
    }
  })

  it('honours the input-well alpha for custom skins', () => {
    const opaque = deriveTokens(seeds, { translucent: true, appearance: 'dark', inputAlpha: 1 })
    expect(opaque['--dsw-specific-input-major']).toBe('rgba(14, 16, 22, 1)')
    const clear = deriveTokens(seeds, { translucent: true, appearance: 'dark', inputAlpha: 0 })
    expect(clear['--dsw-specific-input-major']).toBe('rgba(14, 16, 22, 0)')
  })

  it('derives light and dark palettes that differ', () => {
    const light = deriveTokens(seeds, { appearance: 'light' })
    const dark = deriveTokens(seeds, { appearance: 'dark' })
    expect(light['--dsw-alias-bg-layer-1']).not.toBe(dark['--dsw-alias-bg-layer-1'])
  })
})
