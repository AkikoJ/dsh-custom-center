/**
 * Pure colour sampling from a downsampled RGBA pixel grid.
 *
 * Both the image sampler and the video first-frame sampler draw their source
 * onto a 64x64 canvas and hand the raw `Uint8ClampedArray` here. Keeping the
 * maths DOM-free lets the tests feed synthetic pixel buffers and assert the
 * derived seeds exactly.
 */
import { luminance, rgbToHex, rgbToHsl } from './color.ts'
import { toneHistogram } from './tone.ts'
import { type SkinSeeds, secondaryFromAccent } from './skins.ts'

/** Result of sampling a frame: derived seeds plus a background veil (0..1). */
export interface SampleResult {
  seeds: SkinSeeds
  veil: number
}

/** A colour-bearing pixel kept for the surface/accent estimate. */
interface Pixel {
  r: number
  g: number
  b: number
  h: number
  s: number
  l: number
}

/**
 * Derive skin seeds and a veil from a square RGBA grid.
 * @param data - RGBA bytes, length `4 * size * size`.
 * @param veilProfile - veil strengths for bright/mid/dark surfaces; the image
 *   and video samplers use slightly different washes.
 * @returns the derived seeds and veil.
 */
export function sampleSeeds(
  data: Uint8ClampedArray | number[],
  veilProfile: { bright: number; mid: number; dark: number; flat: number },
): SampleResult {
  const pixels: Pixel[] = []
  const saturated: Pixel[] = []
  // Lightness profile of every opaque pixel (greys and near-blacks included):
  // this is what text actually sits on, unlike `surface`, which only averages
  // the colourful pixels.
  const tones = toneHistogram(data)
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255
    if (a < 0.5) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const hsl = rgbToHsl(r, g, b)
    // Exclude near-grey text ink/shadows and near-grey sky/whites so captions
    // cannot dominate the surface estimate.
    if (hsl.s < 14) continue
    if (hsl.l < 12 || hsl.l > 88) continue
    const px: Pixel = { r, g, b, h: hsl.h, s: hsl.s, l: hsl.l }
    pixels.push(px)
    if (hsl.s >= 30) saturated.push(px)
  }

  if (pixels.length === 0) {
    // Degenerate (flat colour) image: fall back to the plain average.
    let fr = 0
    let fg = 0
    let fb = 0
    let n = 0
    for (let k = 0; k < data.length; k += 4) {
      if (data[k + 3] / 255 < 0.5) continue
      fr += data[k]
      fg += data[k + 1]
      fb += data[k + 2]
      n++
    }
    const avg = n > 0 ? rgbToHex(fr / n, fg / n, fb / n) : '#808080'
    return {
      seeds: {
        accent: avg,
        secondary: avg,
        surface: avg,
        text: luminance(avg) < 0.4 ? '#f2f4f8' : '#16181d',
        tones,
      },
      veil: veilProfile.flat,
    }
  }

  // Surface: average of the colour-bearing pixels.
  let sumR = 0
  let sumG = 0
  let sumB = 0
  for (const p of pixels) {
    sumR += p.r
    sumG += p.g
    sumB += p.b
  }
  const surface = rgbToHex(sumR / pixels.length, sumG / pixels.length, sumB / pixels.length)

  // Accent: dominant saturated hue bucket (24-degree buckets), averaged.
  const pool = saturated.length >= pixels.length * 0.05 ? saturated : pixels
  const buckets = new Map<number, Pixel[]>()
  for (const p of pool) {
    const key = Math.round(p.h / 24)
    const list = buckets.get(key)
    if (list) list.push(p)
    else buckets.set(key, [p])
  }
  let best: Pixel[] | null = null
  for (const list of buckets.values()) {
    if (!best || list.length > best.length) best = list
  }
  let accent = surface
  if (best && best.length >= pool.length * 0.04) {
    let ar = 0
    let ag = 0
    let ab = 0
    for (const p of best) {
      ar += p.r
      ag += p.g
      ab += p.b
    }
    accent = rgbToHex(ar / best.length, ag / best.length, ab / best.length)
  }

  const dark = luminance(surface) < 0.4
  const text = dark ? '#f2f4f8' : '#16181d'
  const secondary = secondaryFromAccent(accent)

  const baseLum = luminance(surface)
  const veil = baseLum > 0.55 ? veilProfile.bright : baseLum > 0.35 ? veilProfile.mid : veilProfile.dark

  return { seeds: { accent, secondary, surface, text, tones }, veil }
}

/** Veil profile for still images (lighter washes). */
export const IMAGE_VEIL = { bright: 0.16, mid: 0.22, dark: 0.32, flat: 0.55 }

/** Veil profile for video frames (slightly heavier washes). */
export const VIDEO_VEIL = { bright: 0.2, mid: 0.28, dark: 0.38, flat: 0.45 }
