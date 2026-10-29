/**
 * Wallpaper lightness profile and the legibility check built on it.
 *
 * The sampled `surface` seed averages only colourful pixels, so a mostly black
 * wallpaper with a few bright highlights still reports a mid-tone surface. What
 * decides whether text is readable is the lightness of *every* pixel the text
 * can land on, so the sampler also keeps a coarse histogram of it. This module
 * is pure (no DOM) so the browser half and the tests agree.
 */
import { alphaOver, contrast, rgbToHex } from './color.ts'

/** Number of lightness bins in a tone histogram. */
export const TONE_BINS = 16

/** Text and wash colours of each translucent appearance (mirrors `deriveTokens`). */
const POLES = {
  light: { text: '#1a1d24', wash: '#fafafc' },
  dark: { text: '#eef1f6', wash: '#0e1016' },
} as const

/** sRGB channel (0..255) to linear light (0..1). */
function toLinear(channel: number): number {
  const v = channel / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** CIE L* (0..100) of a linear luminance. */
function lightnessOf(y: number): number {
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y
}

/** Grey channel (0..255) at the centre of a lightness bin. */
function binGrey(bin: number): number {
  const l = ((bin + 0.5) / TONE_BINS) * 100
  const y = l > 8 ? ((l + 16) / 116) ** 3 : l / (24389 / 27)
  const v = y <= 0.0031308 ? y * 12.92 : 1.055 * y ** (1 / 2.4) - 0.055
  return Math.round(Math.max(0, Math.min(1, v)) * 255)
}

/**
 * Histogram of pixel lightness (CIE L*, {@link TONE_BINS} equal bins from black
 * to white) over the opaque pixels of an RGBA grid.
 * @param data - RGBA bytes.
 * @returns the fraction of pixels per bin (sums to ~1), or `[]` for an empty grid.
 */
export function toneHistogram(data: Uint8ClampedArray | number[]): number[] {
  const counts = new Array<number>(TONE_BINS).fill(0)
  let total = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] / 255 < 0.5) continue
    const y = 0.2126 * toLinear(data[i]) + 0.7152 * toLinear(data[i + 1]) + 0.0722 * toLinear(data[i + 2])
    const bin = Math.min(TONE_BINS - 1, Math.floor((lightnessOf(y) / 100) * TONE_BINS))
    counts[bin]++
    total++
  }
  if (total === 0) return []
  return counts.map((n) => Math.round((n / total) * 1000) / 1000)
}

/** Whether `value` is a usable tone histogram. */
export function isToneHistogram(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === TONE_BINS && value.every((n) => typeof n === 'number' && Number.isFinite(n))
}

/**
 * Share (0..1) of the wallpaper on which the appearance's body text keeps
 * `minRatio` contrast once the appearance's veil is laid over it.
 * @param tones - the wallpaper's tone histogram.
 * @param appearance - which text/wash pair to test.
 * @param alphas - veil alphas in play (main area, sidebar); the result is their mean.
 * @param minRatio - required text contrast.
 */
export function legibleShare(tones: readonly number[], appearance: 'light' | 'dark', alphas: readonly number[], minRatio = 4.5): number {
  const { text, wash } = POLES[appearance]
  let sum = 0
  for (const alpha of alphas) {
    let share = 0
    for (let bin = 0; bin < TONE_BINS; bin++) {
      const grey = binGrey(bin)
      const under = rgbToHex(grey, grey, grey)
      if (contrast(text, alphaOver(wash, alpha, under)) >= minRatio) share += tones[bin] ?? 0
    }
    sum += share
  }
  return alphas.length > 0 ? sum / alphas.length : 0
}

/**
 * Appearance a translucent skin should render in. The host appearance stands
 * unless it is light and the wallpaper is mostly too dark for dark text while
 * the dark palette is clearly better, in which case the palette flips to dark.
 * The reverse is left alone on purpose: a dark host with a bright wallpaper is
 * a deliberate choice and its veil already handles it.
 * @param tones - the wallpaper's tone histogram, if known.
 * @param host - the host's current appearance.
 * @param alphas - veil alphas in play (main area, sidebar).
 */
export function resolveAppearance(tones: readonly number[] | undefined, host: 'light' | 'dark', alphas: readonly number[]): 'light' | 'dark' {
  if (host === 'dark' || !tones || tones.length !== TONE_BINS) return host
  const light = legibleShare(tones, 'light', alphas)
  if (light >= 0.7) return host
  return legibleShare(tones, 'dark', alphas) >= light + 0.15 ? 'dark' : host
}
