import type { SkinSeeds } from "../skins.ts";

/** Native-appearance id stored in `LS_ACTIVE`: no tokens, no wallpaper. */
export const NATIVE_ID = 'system'

/** Custom image/video skin id (also the host theme registration id). */
export const CUSTOM_ID = 'skin-custom'

export const DEFAULT_BG = 25

export const DEFAULT_INPUT = 22

/** Wallpaper kind of a configuration. */
export type WallpaperKind = 'none' | 'image' | 'video'

/** One complete skin configuration. */
export interface SkinConfig {
  kind: WallpaperKind
  seeds: SkinSeeds | null
  /** Library id of the chosen file (e.g. `images/sea.jpg`), or an empty string. */
  source: string
  /** Compact WebP data URL (image kind only). */
  image: string
  /** Video file (video kind only); null while the stored copy is still loading. */
  video: Blob | null
  /** Veil over the main (right) area, 0..100. */
  bg: number
  /** Veil over the sidebar (left), 0..100. */
  side: number
  /** Input well opacity, 0..100. */
  input: number
  frosted: boolean
}
