import { describe, expect, it } from 'vitest'
import {
  adjustLightness,
  alphaOver,
  contrast,
  ensureContrast,
  hexToHsl,
  hexToRgb,
  hslToHex,
  luminance,
  mixHex,
  readableOn,
  rgba,
  rgbToHex,
  rgbToHsl,
} from '../src/core/color.ts'

describe('color conversions', () => {
  it('round-trips hex and rgb', () => {
    expect(hexToRgb('#4d6bfe')).toEqual({ r: 0x4d, g: 0x6b, b: 0xfe })
    expect(rgbToHex(0x4d, 0x6b, 0xfe)).toBe('#4d6bfe')
  })

  it('parses hex without the leading hash', () => {
    expect(hexToRgb('ffffff')).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('returns black for malformed hex', () => {
    expect(hexToRgb('not-a-color')).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('clamps out-of-range channels', () => {
    expect(rgbToHex(-20, 300, 128)).toBe('#00ff80')
  })

  it('round-trips through hsl within rounding tolerance', () => {
    const hsl = hexToHsl('#c8447e')
    const back = hexToRgb(hslToHex(hsl.h, hsl.s, hsl.l))
    const orig = hexToRgb('#c8447e')
    expect(Math.abs(back.r - orig.r)).toBeLessThanOrEqual(1)
    expect(Math.abs(back.g - orig.g)).toBeLessThanOrEqual(1)
    expect(Math.abs(back.b - orig.b)).toBeLessThanOrEqual(1)
  })

  it('reports zero saturation for greys', () => {
    expect(rgbToHsl(128, 128, 128).s).toBe(0)
  })
})

describe('color operations', () => {
  it('lightens and darkens', () => {
    expect(luminance(adjustLightness('#808080', 20))).toBeGreaterThan(luminance('#808080'))
    expect(luminance(adjustLightness('#808080', -20))).toBeLessThan(luminance('#808080'))
  })

  it('mixes toward the second color at t=1', () => {
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('alpha-composites toward the background as alpha drops', () => {
    expect(alphaOver('#ffffff', 1, '#000000')).toBe('#ffffff')
    expect(alphaOver('#ffffff', 0, '#000000')).toBe('#000000')
  })

  it('formats rgba strings', () => {
    expect(rgba('#4d6bfe', 0.5)).toBe('rgba(77, 107, 254, 0.5)')
  })
})

describe('contrast helpers', () => {
  it('computes the maximal contrast ratio for black on white', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  it('picks a readable foreground for a surface', () => {
    expect(readableOn('#ffffff')).toBe('#1a1a1a')
    expect(readableOn('#000000')).toBe('#f5f5f5')
  })

  it('leaves an already-contrasting color unchanged', () => {
    expect(ensureContrast('#000000', '#ffffff', 3)).toBe('#000000')
  })

  it('nudges a low-contrast color until it clears the ratio', () => {
    const bg = '#4d6bfe'
    const out = ensureContrast('#4d6bfe', bg, 3)
    expect(contrast(out, bg)).toBeGreaterThanOrEqual(3)
  })
})
