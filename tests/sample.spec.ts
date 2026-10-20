import { describe, expect, it } from 'vitest'
import { IMAGE_VEIL, VIDEO_VEIL, sampleSeeds } from '../src/core/sample.ts'
import { hexToHsl } from '../src/core/color.ts'

/** Build a `size x size` RGBA grid filled with one opaque colour. */
function solidGrid(size: number, r: number, g: number, b: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = 255
  }
  return data
}

describe('colour sampling', () => {
  it('falls back to the average for a near-grey (flat) frame', () => {
    const grid = solidGrid(8, 128, 128, 128)
    const result = sampleSeeds(grid, IMAGE_VEIL)
    expect(result.seeds.accent).toBe('#808080')
    expect(result.veil).toBe(IMAGE_VEIL.flat)
  })

  it('derives a saturated accent from a colour-bearing frame', () => {
    const grid = solidGrid(8, 0x4d, 0x6b, 0xfe)
    const result = sampleSeeds(grid, IMAGE_VEIL)
    const accentHsl = hexToHsl(result.seeds.accent)
    expect(accentHsl.s).toBeGreaterThan(40)
    // a blue accent lands in the blue hue range
    expect(accentHsl.h).toBeGreaterThan(200)
    expect(accentHsl.h).toBeLessThan(260)
  })

  it('chooses light text on a dark surface and dark text on a light one', () => {
    const dark = sampleSeeds(solidGrid(8, 0x20, 0x30, 0x80), IMAGE_VEIL)
    expect(dark.seeds.text).toBe('#f2f4f8')
    const light = sampleSeeds(solidGrid(8, 0xcf, 0xd8, 0xff), IMAGE_VEIL)
    expect(light.seeds.text).toBe('#16181d')
  })

  it('uses a heavier veil profile for video than for image', () => {
    const dark = solidGrid(8, 0x20, 0x30, 0x80)
    expect(sampleSeeds(dark, VIDEO_VEIL).veil).toBeGreaterThan(sampleSeeds(dark, IMAGE_VEIL).veil)
  })
})
