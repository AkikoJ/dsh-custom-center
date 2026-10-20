/**
 * Skin model and palette derivation.
 *
 * A skin is four seed colours (accent, secondary, surface, text). From those
 * seeds {@link deriveTokens} builds the full map of `--dsw-*` alias tokens the
 * DSH Web UI reads, keeping WCAG contrast against the skin's own surface by
 * construction. Custom image/video skins pass `translucent` so raised surfaces
 * stay legible over the wallpaper.
 *
 * This module is pure (no DOM, no React) so the browser half and the tests
 * derive identical palettes.
 */
import {
  adjustLightness,
  alphaOver,
  contrast,
  ensureContrast,
  fillForWhiteLabel,
  hexToHsl,
  hslToHex,
  luminance,
  readableOn,
  readableOnFill,
  rgba,
  safeAlpha,
  visibleAlpha,
  visibleTint,
} from './color.ts'

/** The four seed colours every skin is built from. */
export interface SkinSeeds {
  accent: string
  secondary: string
  surface: string
  text: string
  /** Sampled background veil strength (0..1), present on custom skins only. */
  veil?: number
  /** Wallpaper lightness histogram (see `tone.ts`), present on custom skins only. */
  tones?: number[]
}

/** Light or dark appearance the palette is derived for. */
export type Appearance = 'light' | 'dark'

/** Flat token map written straight onto `body.style`. */
export type TokenMap = Record<string, string>

/** Options controlling one palette derivation. */
export interface DeriveOptions {
  /** Custom image/video skin: surfaces become translucent washes. */
  translucent?: boolean
  /** Force a specific appearance; built-in skins follow the UI otherwise. */
  appearance?: Appearance
  /** User-tunable input-well alpha (0..1); custom skins only. */
  inputAlpha?: number
  /** User-tunable veil alpha (0..1) of the main (right) area; custom skins only. */
  backgroundAlpha?: number
  /** User-tunable veil alpha (0..1) of the sidebar (left); defaults to `backgroundAlpha`. */
  sidebarAlpha?: number
}

/**
 * Derive the full alias-token palette from four seeds.
 * @param seeds - the skin's seed colours.
 * @param opts - translucency, appearance and user-tunable alphas.
 * @returns a flat `--dsw-*` token map.
 */
export function deriveTokens(seeds: SkinSeeds, opts: DeriveOptions = {}): TokenMap {
  const { translucent = false, appearance, inputAlpha, backgroundAlpha, sidebarAlpha } = opts
  let surface = seeds.surface
  let text = seeds.text
  const accent = seeds.accent
  const secondary = seeds.secondary

  const dark = appearance ? appearance === 'dark' : luminance(surface) < 0.35

  // Translucent (photo) skins must track the appearance: the sampled text
  // colour is illegible against the opposite-appearance wash, so force it to
  // the readable pole per appearance.
  if (translucent && appearance) {
    text = dark ? '#eef1f6' : '#1a1d24'
    surface = dark ? '#0f1116' : '#f4f5f9'
  }

  const onAccent = readableOn(accent)
  const onSurface = readableOn(surface)
  const invertedLabel = readableOn(text)
  const contrastFill = readableOn(invertedLabel)
  const washBase = translucent ? (dark ? '#0f1116' : '#f4f5f9') : surface

  const wa = backgroundAlpha == null ? (dark ? 0.3 : 0.4) : backgroundAlpha
  const washOf = (alpha: number): string => (dark ? `rgba(14, 16, 22, ${alpha})` : `rgba(250, 250, 252, ${alpha})`)
  const wash = translucent ? washOf(wa) : null
  const sideWash = translucent ? washOf(sidebarAlpha == null ? wa : sidebarAlpha) : null

  const layer1 = dark ? adjustLightness(surface, 3) : adjustLightness(surface, -2)
  const layer2 = dark ? adjustLightness(surface, 6) : adjustLightness(surface, -4)
  const layer3 = dark ? adjustLightness(surface, 9) : adjustLightness(surface, -6)
  const overlay = dark ? adjustLightness(surface, 14) : adjustLightness(surface, -8)

  const border1 = translucent
    ? alphaOver(accent, dark ? 0.22 : 0.12, washBase)
    : alphaOver(text, dark ? 0.18 : 0.08, surface)
  const border2 = translucent
    ? alphaOver(accent, dark ? 0.32 : 0.18, washBase)
    : alphaOver(text, dark ? 0.28 : 0.14, surface)
  const border3 = translucent
    ? alphaOver(accent, dark ? 0.42 : 0.26, washBase)
    : alphaOver(text, dark ? 0.36 : 0.2, surface)
  const border4 = translucent
    ? alphaOver(accent, dark ? 0.52 : 0.34, washBase)
    : alphaOver(text, dark ? 0.44 : 0.26, surface)

  let labelSecondary: string
  let labelTertiary: string
  let labelCaption: string
  let labelDimmed: string
  if (translucent) {
    labelSecondary = dark ? '#dfe5ef' : '#292f39'
    labelTertiary = dark ? '#c5cdd9' : '#444d5a'
    // caption is also the composer placeholder, which sits on a see-through well
    labelCaption = dark ? '#bcc5d1' : '#4a5463'
    labelDimmed = dark ? '#8f9baa' : '#727d8b'
  } else {
    labelSecondary = alphaOver(text, dark ? 0.78 : 0.72, surface)
    labelTertiary = alphaOver(text, dark ? 0.58 : 0.55, surface)
    labelCaption = alphaOver(text, dark ? 0.48 : 0.42, surface)
    labelDimmed = alphaOver(text, dark ? 0.38 : 0.32, surface)
  }

  const hoverBg = alphaOver(text, dark ? 0.1 : 0.05, surface)
  const activeBg = alphaOver(text, dark ? 0.16 : 0.09, surface)
  const hoverAccent = alphaOver(accent, dark ? 0.22 : 0.14, surface)

  const codeBg = dark ? adjustLightness(surface, 6) : adjustLightness(surface, -3)
  const codeBg2 = dark ? adjustLightness(surface, 4) : adjustLightness(surface, -1)
  const mdCodeBg = translucent ? alphaOver(accent, dark ? 0.32 : 0.16, washBase) : codeBg
  const mdCodeBg2 = translucent ? alphaOver(accent, dark ? 0.24 : 0.11, washBase) : codeBg2

  const ia = inputAlpha == null ? (dark ? 0.22 : 0.12) : inputAlpha

  // The composer paints its caret and slash-command chip text with
  // `state-business-primary`, its chip highlight with `state-business-tertiary`,
  // and the send button with `button-info-fill` carrying a hard-coded white
  // arrow. A pale or grey wallpaper accent made all three vanish into the input
  // well, so they get contrast-checked variants instead of the raw accent.
  const inputBase = translucent ? washBase : surface
  const readableAccent = ensureContrast(accent, inputBase, translucent ? 4.5 : 3.0)
  const sendFill = fillForWhiteLabel(accent, inputBase, 3.0, 3.0)
  const sendHover = adjustLightness(sendFill, dark ? 6 : -6)

  // Solid-accent fills (selected nav row, primary button) carry body text. A
  // dark accent under dark text, or a pale accent under light text, is unreadable,
  // so a fill that fails contrast with the label drops to a tinted wash instead.
  // Accents that already read well keep their solid fill.
  // An accent that nearly matches the wash (black on a dark panel, white on a
  // light one) makes buttons, switches and the selected row disappear, so it is
  // lifted just enough to be seen. Accents that already stand out are untouched.
  const brand = translucent && contrast(accent, washBase) < 1.25 ? ensureContrast(accent, washBase, 1.8) : accent
  const labelOnFill = translucent ? readableOnFill(brand) : onSurface
  // Selected and hovered rows are soft tints of the readable accent, never a
  // solid block: a pale or dark accent as a solid fill turns the row into a
  // heavy grey or black slab. Each tint is raised only until it is visible over
  // the wash, then capped so the row label keeps its contrast.
  const rowTint = (alpha: number, minRatio: number): string => {
    const visible = visibleAlpha(readableAccent, alpha, washBase, minRatio, 0.3)
    return rgba(readableAccent, safeAlpha(readableAccent, visible, washBase, text))
  }
  const navActive = rowTint(dark ? 0.2 : 0.11, dark ? 1.3 : 1.14)
  const navHover = rowTint(dark ? 0.12 : 0.07, dark ? 1.18 : 1.07)

  return {
    // surfaces
    '--dsw-alias-bg-base': translucent && wash ? wash : surface,
    '--dsw-alias-bg-layer-1': translucent
      ? dark
        ? 'rgba(20, 22, 28, 0.94)'
        : 'rgba(249, 250, 251, 0.95)'
      : layer1,
    '--dsw-alias-bg-layer-2': translucent
      ? dark
        ? 'rgba(24, 26, 32, 0.95)'
        : 'rgba(250, 251, 252, 0.96)'
      : layer2,
    '--dsw-alias-bg-layer-3': translucent
      ? dark
        ? 'rgba(27, 29, 36, 0.96)'
        : 'rgba(251, 252, 253, 0.97)'
      : layer3,
    '--dsw-alias-bg-overlay': translucent
      ? dark
        ? 'rgba(22, 24, 30, 0.92)'
        : 'rgba(248, 249, 251, 0.94)'
      : overlay,
    '--dsw-alias-bg-module-platform': translucent
      ? dark
        ? 'rgba(24, 26, 32, 0.95)'
        : 'rgba(250, 251, 252, 0.96)'
      : layer2,
    '--dsw-alias-bg-multi-select': translucent
      ? dark
        ? 'rgba(24, 26, 32, 0.95)'
        : 'rgba(250, 251, 252, 0.96)'
      : layer2,
    '--dsw-alias-bg-skeleton': alphaOver(text, dark ? 0.12 : 0.05, surface),

    // borders
    '--dsw-alias-border-l1': border1,
    '--dsw-alias-border-l2': border2,
    '--dsw-alias-border-l2-darkmode-thin': border2,
    '--dsw-alias-border-l3': border3,
    '--dsw-alias-border-l4': border4,
    '--dsw-alias-border-inverted': onSurface,
    '--dsw-alias-border-inverted2': onSurface,

    // brand
    '--dsw-alias-brand-primary': brand,
    '--dsw-alias-brand-primary-new-colorprimary-new-color': brand,
    '--dsw-alias-brand-text': text,
    '--dsw-alias-brand-primary-invert': translucent ? readableOnFill(brand) : onAccent,

    // buttons
    '--dsw-alias-button-primary-fill': brand,
    '--dsw-alias-button-primary-hover': adjustLightness(brand, dark ? 6 : -6),
    '--dsw-alias-button-primary-dimmed': alphaOver(accent, 0.55, surface),
    '--dsw-alias-button-contrast-fill': contrastFill,
    '--dsw-alias-button-elevated-fill': translucent && wash ? wash : layer1,
    '--dsw-alias-button-floating-fill': translucent && wash ? wash : layer1,
    '--dsw-alias-button-floating-hover': translucent && wash ? wash : layer2,
    '--dsw-alias-button-ghost-active-border': border3,
    '--dsw-alias-button-ghost-active-fill': translucent && wash ? wash : layer2,
    '--dsw-alias-button-ghost-active-hover': translucent && wash ? wash : layer2,
    '--dsw-alias-button-info-fill': translucent ? sendFill : accent,
    '--dsw-alias-button-info-hover': translucent ? sendHover : adjustLightness(accent, dark ? 6 : -6),
    '--dsw-alias-button-tool-bar-fill': alphaOver(secondary, 0.5, surface),
    '--dsw-alias-button-tool-bar-fill-invisible': alphaOver(secondary, 0.3, surface),
    '--dsw-alias-button-tool-bar-hover': alphaOver(secondary, 0.6, surface),

    // interactions
    // translucent hover/active wells are tinted with the contrast-checked accent
    // and raised until they are actually visible over the wash, so a pale or grey
    // wallpaper accent still shows which row is hovered
    '--dsw-alias-interactive-bg-hover': translucent
      ? visibleTint(readableAccent, dark ? 0.22 : 0.1, washBase, dark ? 1.3 : 1.14, dark ? 0.3 : 0.14)
      : hoverBg,
    '--dsw-alias-interactive-bg-active': translucent
      ? visibleTint(readableAccent, dark ? 0.3 : 0.14, washBase, dark ? 1.42 : 1.2, dark ? 0.4 : 0.2)
      : activeBg,
    '--dsw-alias-interactive-bg-hover-solid': translucent
      ? visibleTint(readableAccent, dark ? 0.24 : 0.12, washBase, dark ? 1.34 : 1.16, dark ? 0.32 : 0.16)
      : layer2,
    '--dsw-alias-interactive-bg-hover-accent': translucent
      ? visibleTint(readableAccent, dark ? 0.5 : 0.28, washBase, dark ? 1.7 : 1.45, 0.6)
      : hoverAccent,
    '--dsw-alias-interactive-bg-hover-danger': alphaOver('#d92d20', dark ? 0.2 : 0.08, surface),

    // labels
    '--dsw-alias-label-primary': text,
    '--dsw-alias-label-primary-bluish': text,
    '--dsw-alias-label-primary-dimmed': labelTertiary,
    '--dsw-alias-label-primary-foreground': labelOnFill,
    '--dsw-alias-label-primary-inverted': invertedLabel,
    '--dsw-alias-label-secondary': labelSecondary,
    '--dsw-alias-label-tertiary': labelTertiary,
    '--dsw-alias-label-caption': labelCaption,
    '--dsw-alias-label-dimmed': labelDimmed,

    // markdown / code
    '--dsw-alias-markdown-citation': translucent ? alphaOver(accent, dark ? 0.18 : 0.08, washBase) : layer2,
    '--dsw-alias-markdown-code-block': mdCodeBg,
    '--dsw-alias-markdown-code-block-banner': mdCodeBg2,
    '--dsw-alias-markdown-code-segment-selected': translucent
      ? alphaOver(accent, dark ? 0.18 : 0.13, washBase)
      : layer2,
    '--dsw-alias-markdown-code-segment-unselected': mdCodeBg2,
    '--dsw-alias-markdown-inline-code': mdCodeBg,
    '--dsw-alias-markdown-placeholder': mdCodeBg2,
    '--dsw-alias-markdown-tag': mdCodeBg2,

    // scrollbar
    '--dsw-alias-scrollbar-bg-l1': alphaOver(text, dark ? 0.2 : 0.1, surface),
    '--dsw-alias-scrollbar-bg-l2': alphaOver(text, dark ? 0.28 : 0.16, surface),
    '--dsw-alias-scrollbar-hover-l1': alphaOver(text, dark ? 0.34 : 0.22, surface),
    '--dsw-alias-scrollbar-hover-l2': alphaOver(text, dark ? 0.42 : 0.3, surface),

    // states
    '--dsw-alias-state-business-primary': readableAccent,
    '--dsw-alias-state-business-tertiary': translucent
      ? alphaOver(readableAccent, dark ? 0.28 : 0.16, washBase)
      : alphaOver(accent, 0.2, surface),
    '--dsw-alias-state-error-primary': '#d92d20',
    '--dsw-alias-state-error-secondary': '#f04438',
    '--dsw-alias-state-success-primary': '#12b76a',
    '--dsw-alias-state-success-secondary': '#32d583',
    '--dsw-alias-state-success-tertiary': alphaOver('#12b76a', 0.18, surface),
    '--dsw-alias-state-warn-primary': '#f79009',
    '--dsw-alias-state-warn-secondary': '#fdb022',
    '--dsw-alias-state-warn-tertiary': alphaOver('#f79009', 0.18, surface),
    '--dsw-alias-state-warn-label': dark ? '#fdb022' : '#b54708',

    // chrome
    // DSH paints tooltip and toast text in a fixed white, so their fill must stay
    // dark in the light appearance too (a pale fill makes the text unreadable).
    '--dsw-alias-toast-bg': translucent
      ? 'rgba(30, 32, 39, 0.94)'
      : dark
        ? adjustLightness(surface, 12)
        : overlay,
    '--dsw-alias-tooltip-bg': translucent
      ? 'rgba(30, 32, 39, 0.94)'
      : dark
        ? adjustLightness(surface, 12)
        : overlay,
    '--dsw-alias-bg-mask-1': 'rgba(0, 0, 0, 0.24)',
    '--dsw-alias-bg-mask-2': 'rgba(0, 0, 0, 0.12)',
    '--dsw-alias-bg-mask-3': 'rgba(0, 0, 0, 0.48)',
    '--dsw-alias-bg-mask-photo': 'rgba(0, 0, 0, 0.88)',
    '--dsw-alias-bg-mask-drop': dark ? 'rgba(30, 30, 36, 0.7)' : 'rgba(255, 255, 255, 0.7)',

    // specific component seats
    '--dsw-specific-bubble': translucent
      ? alphaOver(accent, dark ? 0.22 : 0.09, washBase)
      : dark
        ? layer2
        : layer1,
    '--dsw-specific-bubble-highlight': translucent
      ? alphaOver(accent, safeAlpha(accent, dark ? 0.55 : 0.28, washBase, text), washBase)
      : alphaOver(accent, dark ? 0.28 : 0.16, surface),
    '--dsw-specific-input-major': translucent ? rgba(dark ? '#0e1016' : '#fafafc', ia) : layer1,
    '--dsw-specific-login-input': translucent ? rgba(dark ? '#0e1016' : '#fafafc', ia) : layer2,
    '--dsw-specific-menu': translucent
      ? dark
        ? 'rgba(22, 24, 30, 0.92)'
        : 'rgba(248, 249, 251, 0.94)'
      : dark
        ? layer3
        : layer2,
    '--dsw-specific-selector': translucent
      ? dark
        ? 'rgba(22, 24, 30, 0.92)'
        : 'rgba(248, 249, 251, 0.94)'
      : layer2,
    '--dsw-specific-sidebar-fill': translucent && sideWash ? sideWash : dark ? adjustLightness(surface, 3) : layer1,
    '--dsw-specific-sidebar-nav-item-active': translucent ? navActive : layer2,
    '--dsw-specific-sidebar-nav-item-active-accent': translucent
      ? navActive
      : alphaOver(accent, dark ? 0.24 : 0.14, surface),
    '--dsw-specific-sidebar-nav-item-hover': translucent ? navHover : layer2,
    '--dsw-specific-tip': translucent
      ? alphaOver(accent, dark ? 0.18 : 0.08, washBase)
      : dark
        ? layer2
        : layer1,
  }
}

/** Every token name {@link deriveTokens} produces, for exact teardown. */
export const TOKEN_NAMES: readonly string[] = Object.keys(
  deriveTokens({ accent: '#000000', secondary: '#000000', surface: '#000000', text: '#ffffff' }),
)

/** Second seed hue-rotated from an accent, used by the colour sampler. */
export function secondaryFromAccent(accent: string): string {
  const aHsl = hexToHsl(accent)
  return hslToHex(aHsl.h + 30, Math.min(85, aHsl.s + 10), Math.max(30, Math.min(80, aHsl.l + 12)))
}
