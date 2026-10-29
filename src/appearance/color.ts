/**
 * Pure colour utilities shared by the token-derivation core, the image/video
 * colour sampler and the tests. No DOM, no DSH, no React: every function here
 * is a plain maths transform so both halves and the test runner agree on the
 * exact palette a set of seeds produces.
 */

/** An RGB triple with 0..255 channels. */
export interface Rgb {
  r: number
  g: number
  b: number
}

/** An HSL triple: h in 0..360, s and l in 0..100. */
export interface Hsl {
  h: number
  s: number
  l: number
}

/** Parse a `#rrggbb` (or `rrggbb`) hex string into an RGB triple. */
export function hexToRgb(hex: string): Rgb {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return { r: 0, g: 0, b: 0 }
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  }
}

/** Format an RGB triple as a clamped `#rrggbb` string. */
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number): string => {
    const clamped = Math.max(0, Math.min(255, Math.round(v)))
    return clamped.toString(16).padStart(2, '0')
  }
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Convert RGB (0..255) to HSL (h 0..360, s/l 0..100). */
export function rgbToHsl(rIn: number, gIn: number, bIn: number): Hsl {
  const r = rIn / 255
  const g = gIn / 255
  const b = bIn / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }
  return { h: h * 360, s: s * 100, l: l * 100 }
}

/** Convert HSL (h 0..360, s/l 0..100) to RGB (0..255). */
export function hslToRgb(hIn: number, sIn: number, lIn: number): Rgb {
  const h = ((((hIn % 360) + 360) % 360) / 360)
  const s = sIn / 100
  const l = lIn / 100
  if (s === 0) {
    const v = l * 255
    return { r: v, g: v, b: v }
  }
  const hue2rgb = (p: number, q: number, tIn: number): number => {
    let t = tIn
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255,
  }
}

/** Convert a hex string to HSL. */
export function hexToHsl(hex: string): Hsl {
  const c = hexToRgb(hex)
  return rgbToHsl(c.r, c.g, c.b)
}

/** Convert an HSL triple to a hex string. */
export function hslToHex(h: number, s: number, l: number): string {
  const c = hslToRgb(h, s, l)
  return rgbToHex(c.r, c.g, c.b)
}

/** Shift a colour's lightness by `delta` (-100..100), keeping hue/saturation. */
export function adjustLightness(hex: string, delta: number): string {
  const hsl = hexToHsl(hex)
  return hslToHex(hsl.h, hsl.s, Math.max(0, Math.min(100, hsl.l + delta)))
}

/** Linearly mix two hex colours; `t=1` returns `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  return rgbToHex(
    ca.r + (cb.r - ca.r) * t,
    ca.g + (cb.g - ca.g) * t,
    ca.b + (cb.b - ca.b) * t,
  )
}

/** Alpha-composite `hex` at `alpha` over opaque background `bg`. */
export function alphaOver(hex: string, alpha: number, bg: string): string {
  const c = hexToRgb(hex)
  const b = hexToRgb(bg)
  return rgbToHex(
    c.r * alpha + b.r * (1 - alpha),
    c.g * alpha + b.g * (1 - alpha),
    c.b * alpha + b.b * (1 - alpha),
  )
}

/** Render a hex colour as an `rgba()` string with the given alpha (0..1). */
export function rgba(hex: string, alpha: number): string {
  const c = hexToRgb(hex)
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`
}

/** WCAG relative luminance of a hex colour (0..1). */
export function luminance(hex: string): number {
  const c = hexToRgb(hex)
  const f = (vIn: number): number => {
    const v = vIn / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}

/** WCAG contrast ratio between two hex colours (1..21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/** Readable on-surface colour: near-black on light surfaces, near-white on dark. */
export function readableOn(surface: string): string {
  return luminance(surface) > 0.4 ? '#1a1a1a' : '#f5f5f5'
}

/**
 * Nudge `color`'s lightness toward the opposite end until it clears `minRatio`
 * contrast against `bg`. Used for carets and focus rings that must stay
 * visible against the skin's own surface.
 */
export function ensureContrast(color: string, bg: string, minRatio: number): string {
  if (contrast(color, bg) >= minRatio) return color
  const hsl = hexToHsl(color)
  const step = luminance(bg) > 0.5 ? -4 : 4
  let cur = hsl.l
  for (let i = 0; i < 30; i++) {
    cur = Math.max(0, Math.min(100, cur + step))
    const candidate = hslToHex(hsl.h, Math.min(100, Math.max(0, hsl.s)), cur)
    if (contrast(candidate, bg) >= minRatio) return candidate
  }
  return readableOn(bg)
}

/**
 * Pick a fill for a control that carries a fixed white label (the composer
 * send arrow is hard-coded `#fff`). Keeps the colour's hue and saturation and
 * moves only its lightness, choosing the candidate closest to the original
 * that clears `minWhite` against the white label and `minBg` against the
 * surface the control sits on, so the control is both readable and visible.
 */
export function fillForWhiteLabel(color: string, bg: string, minWhite: number, minBg: number): string {
  if (contrast(color, '#ffffff') >= minWhite && contrast(color, bg) >= minBg) return color
  const hsl = hexToHsl(color)
  let best: string | null = null
  let bestDistance = Infinity
  let fallback = color
  let fallbackScore = -1
  for (let l = 0; l <= 100; l++) {
    const candidate = hslToHex(hsl.h, hsl.s, l)
    const white = contrast(candidate, '#ffffff')
    const surface = contrast(candidate, bg)
    const score = Math.min(white / minWhite, surface / minBg)
    if (score > fallbackScore) {
      fallbackScore = score
      fallback = candidate
    }
    if (white >= minWhite && surface >= minBg) {
      const distance = Math.abs(l - hsl.l)
      if (distance < bestDistance) {
        bestDistance = distance
        best = candidate
      }
    }
  }
  return best ?? fallback
}

/**
 * Smallest alpha (from `alpha` up to `maxAlpha`) at which a tint of `color`
 * over `bg` clears `minRatio` contrast against `bg`; `maxAlpha` when none does.
 */
export function visibleAlpha(color: string, alpha: number, bg: string, minRatio: number, maxAlpha = 0.5): number {
  let a = alpha
  while (a < maxAlpha && contrast(alphaOver(color, a, bg), bg) < minRatio) a += 0.02
  return Math.round(Math.min(a, maxAlpha) * 100) / 100
}

/**
 * Translucent tint of `color` that stays visible over `bg`: {@link visibleAlpha}
 * rendered as an rgba string, so hover wells made from a pale or grey accent do
 * not disappear into a near-white menu.
 */
export function visibleTint(color: string, alpha: number, bg: string, minRatio: number, maxAlpha = 0.5): string {
  return rgba(color, visibleAlpha(color, alpha, bg, minRatio, maxAlpha))
}

/**
 * Near-black or near-white label, whichever contrasts more with `fill`.
 * {@link readableOn} switches on a fixed luminance cut and so leaves mid-tone
 * fills with a weak label; this compares the two poles directly.
 */
export function readableOnFill(fill: string): string {
  const dark = '#1a1a1a'
  const light = '#f5f5f5'
  return contrast(fill, dark) >= contrast(fill, light) ? dark : light
}

/**
 * Largest alpha (<= `alpha`) at which `color` laid over `base` still leaves
 * `text` readable (>= `minRatio`) on top. Used for highlight fills that carry
 * body text, so a bright or dark accent cannot swallow the label drawn on it.
 */
export function safeAlpha(color: string, alpha: number, base: string, text: string, minRatio = 4.5): number {
  let a = alpha
  while (a > 0.04 && contrast(text, alphaOver(color, a, base)) < minRatio) a -= 0.02
  return Math.max(0.04, Math.round(a * 100) / 100)
}
