/**
 * The skin controller: the imperative engine the React page drives.
 *
 * Three configurations are kept apart:
 * - saved: what is persisted (localStorage / IndexedDB) and applied on load;
 * - draft: what the page is editing;
 * - live:  what is currently rendered.
 *
 * Outside preview mode edits only change the draft and the live UI keeps the
 * saved look. After {@link SkinController.preview} every edit is rendered live
 * until the user saves, leaves preview or discards. Only
 * {@link SkinController.save} persists the draft. It is deliberately
 * framework-free so the React component stays a thin view with a snapshot
 * subscription.
 *
 * The skin is an orthogonal overlay on the host appearance: it never calls
 * `theme.setTheme` (ui-theme owns light/dark), it listens for `theme/change`
 * and re-applies its tokens after every host repaint.
 */
import { TOKEN_NAMES, type Appearance, type SkinSeeds, deriveTokens } from '../skins.ts'
import { luminance, readableOn } from '../color.ts'
import { isToneHistogram, resolveAppearance } from '../tone.ts'
import type { ThemeService } from '../../shared/browser-env.ts'
import {
  LS_ACTIVE,
  LS_BG_OPACITY,
  LS_CUSTOM_IMAGE,
  LS_CUSTOM_SEEDS,
  LS_CUSTOM_SOURCE,
  LS_CUSTOM_VIDEO,
  LS_FROSTED,
  LS_INPUT_OPACITY,
  LS_SIDE_OPACITY,
  applyBackground,
  applyFrostedGate,
  applyVideoBackground,
  clearVideoBackground,
  idbClearBlob,
  idbLoadBlob,
  idbSaveBlob,
  loadLS,
  loadOpacity,
  processVideo,
  saveLS,
  toneOfImageUrl,
} from './wallpaper.ts'

/** Native-appearance id stored in `LS_ACTIVE`: no tokens, no wallpaper. */
const NATIVE_ID = 'system'
/** Custom image/video skin id (also the host theme registration id). */
const CUSTOM_ID = 'skin-custom'

/** Attribute the host sets on `<body>` while its dark palette is active. */
const DARK_ATTRIBUTE = 'data-ds-dark-theme'

const DEFAULT_BG = 25
const DEFAULT_INPUT = 22

/** Wallpaper kind of a configuration. */
export type WallpaperKind = 'none' | 'image' | 'video'

/** One complete skin configuration. */
interface SkinConfig {
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

/** Immutable snapshot the React view renders from. */
export interface SkinSnapshot {
  kind: WallpaperKind
  seeds: SkinSeeds | null
  /** Library id of the draft wallpaper, or an empty string. */
  source: string
  /** Draft wallpaper image data URL (image kind only), for the thumbnail. */
  image: string
  /** Draft wallpaper video (video kind only), for the thumbnail. */
  video: Blob | null
  bgOpacity: number
  sideOpacity: number
  inputOpacity: number
  frosted: boolean
  /** The draft differs from the saved configuration. */
  dirty: boolean
  /** Preview mode: every edit is rendered live and is not yet saved. */
  previewing: boolean
  revision: number
}

/** The imperative controller surface the React page consumes. */
export interface SkinController {
  getSnapshot(): SkinSnapshot
  subscribe(fn: () => void): () => void
  /** Set the draft wallpaper to a processed image from the library. */
  setImage(seeds: SkinSeeds, image: string, veil: number, source: string): void
  /** Set the draft wallpaper to a video file from the library. */
  setVideo(seeds: SkinSeeds, blob: Blob, veil: number, source: string): void
  /** Set a slider value in the draft (`bg` = main area, `side` = sidebar, `both` = left and right together). */
  setOpacity(kind: 'bg' | 'side' | 'both' | 'input', value: number): void
  /** Set the frosted toggle in the draft. */
  setFrosted(on: boolean): void
  /** Enter preview mode: render the draft now and render every later edit live. */
  preview(): void
  /** Leave preview mode: the live UI returns to the saved look, the draft is kept. */
  exitPreview(): void
  /** Persist the draft and make it the live configuration. */
  save(): Promise<void>
  /** Drop the draft and any preview; return to the saved configuration. */
  discard(): void
  /** Restore the native look and clear every stored customization. */
  reset(): Promise<void>
  dispose(): void
}

function defaultConfig(): SkinConfig {
  return { kind: 'none', seeds: null, source: '', image: '', video: null, bg: DEFAULT_BG, side: DEFAULT_BG, input: DEFAULT_INPUT, frosted: false }
}

/** Read the persisted configuration (the video blob is loaded separately). */
function loadSaved(): SkinConfig {
  const base: SkinConfig = {
    ...defaultConfig(),
    input: loadOpacity(LS_INPUT_OPACITY, DEFAULT_INPUT),
    frosted: loadLS(LS_FROSTED, '0') === '1',
  }
  if (loadLS(LS_ACTIVE, NATIVE_ID) !== CUSTOM_ID) return base
  try {
    const seeds = JSON.parse(loadLS(LS_CUSTOM_SEEDS, 'null')) as SkinSeeds | null
    if (!seeds?.accent) return base
    // a malformed histogram must not reach the palette maths
    if (seeds.tones !== undefined && !isToneHistogram(seeds.tones)) delete seeds.tones
    const isVideo = loadLS(LS_CUSTOM_VIDEO, '') === '1'
    const image = isVideo ? '' : loadLS(LS_CUSTOM_IMAGE, '')
    if (!isVideo && !image) return base
    const bg = loadOpacity(LS_BG_OPACITY, Math.round((seeds.veil ?? 0.25) * 100))
    return {
      ...base,
      kind: isVideo ? 'video' : 'image',
      seeds,
      source: loadLS(LS_CUSTOM_SOURCE, ''),
      image,
      bg,
      // saves from before the two-sided veil have no sidebar value: follow the main area
      side: loadOpacity(LS_SIDE_OPACITY, bg),
    }
  } catch {
    return base
  }
}

/**
 * Build the controller.
 * @param theme - the host theme service.
 * @param onThemeChange - registers a `theme/change` listener; returns a disposer.
 */
export function createController(
  theme: ThemeService,
  onThemeChange: (handler: () => void) => () => void,
): SkinController {
  let saved = loadSaved()
  let draft: SkinConfig = { ...saved }
  let live: SkinConfig = saved
  let dirty = false
  let previewing = false
  let disposed = false
  let revision = 0
  let registration: (() => void) | null = null
  let registeredSeeds: SkinSeeds | null = null
  let videoCache: { blob: Blob; url: string } | null = null
  /** The palette was flipped to dark over a light host; the body attribute is ours to keep. */
  let forcedDark = false
  let darkGuard: MutationObserver | null = null
  const listeners = new Set<() => void>()
  let snapshot: SkinSnapshot = buildSnapshot()

  function buildSnapshot(): SkinSnapshot {
    return {
      kind: draft.kind,
      seeds: draft.seeds,
      source: draft.source,
      image: draft.image,
      video: draft.video,
      bgOpacity: draft.bg,
      sideOpacity: draft.side,
      inputOpacity: draft.input,
      frosted: draft.frosted,
      dirty,
      previewing,
      revision,
    }
  }

  function publish(): void {
    revision += 1
    snapshot = buildSnapshot()
    for (const fn of listeners) fn()
  }

  function currentAppearance(): Appearance {
    try {
      return theme.getTheme().active?.colorScheme === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  }

  /**
   * Make the host's dark-palette attribute match the appearance being rendered.
   * Components key their own dark rules (cards, code colours, illustrations) on
   * `body[data-ds-dark-theme]`, so flipping tokens alone would leave them light.
   * The host rewrites the attribute on every repaint, hence the guard.
   */
  function syncForcedDark(force: boolean): void {
    if (typeof document === 'undefined') return
    const body = document.body
    if (force) {
      forcedDark = true
      body.setAttribute(DARK_ATTRIBUTE, '')
      document.documentElement.style.colorScheme = 'dark'
      if (!darkGuard && typeof MutationObserver !== 'undefined') {
        darkGuard = new MutationObserver(() => {
          if (forcedDark && !body.hasAttribute(DARK_ATTRIBUTE)) {
            body.setAttribute(DARK_ATTRIBUTE, '')
            document.documentElement.style.colorScheme = 'dark'
          }
        })
        darkGuard.observe(body, { attributes: true, attributeFilter: [DARK_ATTRIBUTE] })
      }
      return
    }
    if (!forcedDark) return
    forcedDark = false
    darkGuard?.disconnect()
    darkGuard = null
    if (currentAppearance() === 'dark') return
    body.removeAttribute(DARK_ATTRIBUTE)
    document.documentElement.style.colorScheme = 'light'
  }

  function clearTokens(): void {
    for (const name of TOKEN_NAMES) document.body.style.removeProperty(name)
  }

  /** Keep the host theme registration in step with the seeds being rendered. */
  function syncRegistration(seeds: SkinSeeds | null): void {
    if (seeds === registeredSeeds) return
    registration?.()
    registration = null
    registeredSeeds = seeds
    if (!seeds) return
    try {
      registration = theme.register({
        id: CUSTOM_ID,
        colorScheme: luminance(seeds.surface) < 0.35 ? 'dark' : 'light',
        tokens: deriveTokens(seeds, { translucent: true }),
      })
    } catch {
      // already registered (HMR re-activation)
    }
  }

  /** One object URL per video blob, so re-rendering never reloads the video. */
  function videoUrl(blob: Blob): string {
    if (videoCache?.blob === blob) return videoCache.url
    if (videoCache) URL.revokeObjectURL(videoCache.url)
    videoCache = { blob, url: URL.createObjectURL(blob) }
    return videoCache.url
  }

  function dropVideo(): void {
    clearVideoBackground()
    videoCache = null
  }

  /** Render a configuration onto the live UI. */
  function render(cfg: SkinConfig): void {
    if (typeof document === 'undefined') return
    live = cfg
    const root = document.documentElement
    clearTokens()
    applyFrostedGate(cfg.frosted)
    if (cfg.kind === 'none' || !cfg.seeds) {
      syncRegistration(null)
      syncForcedDark(false)
      dropVideo()
      applyBackground(null)
      root.style.removeProperty('--dsh-cc-on-accent')
      return
    }
    syncRegistration(cfg.seeds)
    const host = currentAppearance()
    // A light host over a mostly dark wallpaper cannot keep dark text legible
    // even under the veil, so the palette flips to dark. Everything else keeps
    // the host appearance.
    const appearance = resolveAppearance(cfg.seeds.tones, host, [cfg.bg / 100, cfg.side / 100])
    syncForcedDark(appearance === 'dark' && host === 'light')
    const tokens = deriveTokens(cfg.seeds, {
      translucent: true,
      appearance,
      inputAlpha: cfg.input / 100,
      backgroundAlpha: cfg.bg / 100,
      sidebarAlpha: cfg.side / 100,
    })
    for (const name in tokens) document.body.style.setProperty(name, tokens[name])
    root.style.setProperty('--dsh-cc-on-accent', tokens['--dsw-alias-brand-primary-invert'] ?? readableOn(cfg.seeds.accent))
    if (cfg.kind === 'image') {
      dropVideo()
      applyBackground(cfg.image)
    } else {
      applyBackground(null)
      if (cfg.video) applyVideoBackground(videoUrl(cfg.video))
    }
  }

  /** Mark the draft as edited; in preview mode the edit is rendered at once. */
  function touch(): void {
    dirty = true
    if (previewing) render(draft)
    publish()
  }

  /** Write a configuration to storage; returns the pending IndexedDB write. */
  function persist(cfg: SkinConfig, previous: SkinConfig): Promise<void> {
    const custom = cfg.kind !== 'none' && cfg.seeds !== null
    saveLS(LS_ACTIVE, custom ? CUSTOM_ID : NATIVE_ID)
    saveLS(LS_CUSTOM_SEEDS, custom ? JSON.stringify(cfg.seeds) : '')
    saveLS(LS_CUSTOM_IMAGE, cfg.kind === 'image' ? cfg.image : '')
    saveLS(LS_CUSTOM_VIDEO, cfg.kind === 'video' ? '1' : '')
    saveLS(LS_CUSTOM_SOURCE, custom ? cfg.source : '')
    saveLS(LS_BG_OPACITY, String(cfg.bg))
    saveLS(LS_SIDE_OPACITY, String(cfg.side))
    saveLS(LS_INPUT_OPACITY, String(cfg.input))
    saveLS(LS_FROSTED, cfg.frosted ? '1' : '0')
    if (cfg.kind !== 'video') return idbClearBlob().catch(() => undefined)
    if (cfg.video && cfg.video !== previous.video) return idbSaveBlob(cfg.video)
    return Promise.resolve()
  }

  // --- lifecycle ---
  render(saved)
  // the host repaints its tokens while adopting layout state; render again after it
  setTimeout(() => {
    if (!disposed && live === saved) render(saved)
  }, 300)
  if (saved.kind === 'video') {
    const base = saved
    void idbLoadBlob()
      .then((blob) => {
        if (disposed || !blob || saved !== base) return
        saved = { ...saved, video: blob }
        if (draft.kind === 'video' && !draft.video) draft = { ...draft, video: blob }
        if (live === base) render(saved)
        publish()
        if (saved.seeds && !saved.seeds.tones) {
          backfillTones(saved, processVideo(new File([blob], 'wallpaper')).then((r) => r.seeds.tones ?? []))
        }
      })
      .catch(() => undefined)
  }
  // Wallpapers saved before the tone profile existed have none: recover it once,
  // persist it with the seeds, and re-render. Failures leave the host appearance.
  function backfillTones(base: SkinConfig, pending: Promise<number[]>): void {
    void pending
      .then((tones) => {
        if (disposed || saved !== base || !base.seeds || !isToneHistogram(tones)) return
        const seeds = { ...base.seeds, tones }
        saved = { ...saved, seeds }
        if (draft.seeds === base.seeds) draft = { ...draft, seeds }
        saveLS(LS_CUSTOM_SEEDS, JSON.stringify(seeds))
        if (live === base) render(saved)
        publish()
      })
      .catch(() => undefined)
  }
  if (saved.kind === 'image' && saved.seeds && !saved.seeds.tones) backfillTones(saved, toneOfImageUrl(saved.image))
  const offThemeChange = onThemeChange(() => {
    if (live.kind !== 'none') render(live)
    publish()
  })

  return {
    getSnapshot: () => snapshot,
    subscribe(fn: () => void): () => void {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    setImage(seeds: SkinSeeds, image: string, veil: number, source: string): void {
      const v = veil || 0.4
      draft = { ...draft, kind: 'image', seeds: { ...seeds, veil: v }, source, image, video: null, bg: Math.round(v * 100), side: Math.round(v * 100) }
      touch()
    },
    setVideo(seeds: SkinSeeds, blob: Blob, veil: number, source: string): void {
      const v = veil || 0.4
      draft = { ...draft, kind: 'video', seeds: { ...seeds, veil: v }, source, image: '', video: blob, bg: Math.round(v * 100), side: Math.round(v * 100) }
      touch()
    },
    setOpacity(kind: 'bg' | 'side' | 'both' | 'input', value: number): void {
      const v = Math.max(0, Math.min(100, Math.round(value)))
      if (kind === 'bg') draft = { ...draft, bg: v }
      else if (kind === 'side') draft = { ...draft, side: v }
      else if (kind === 'both') draft = { ...draft, bg: v, side: v }
      else draft = { ...draft, input: v }
      touch()
    },
    setFrosted(on: boolean): void {
      draft = { ...draft, frosted: on }
      touch()
    },
    preview(): void {
      if (previewing) return
      previewing = true
      render(draft)
      publish()
    },
    exitPreview(): void {
      if (!previewing) return
      previewing = false
      render(saved)
      publish()
    },
    save(): Promise<void> {
      if (!dirty) return Promise.resolve()
      const next = draft
      const pending = persist(next, saved)
      saved = next
      draft = { ...next }
      dirty = false
      previewing = false
      render(saved)
      publish()
      return pending.catch((err) => console.error('[dsh-custom-center] saving the video failed', err))
    },
    discard(): void {
      draft = { ...saved }
      dirty = false
      previewing = false
      render(saved)
      publish()
    },
    reset(): Promise<void> {
      const cleared = defaultConfig()
      const pending = persist(cleared, saved)
      saved = cleared
      draft = { ...cleared }
      dirty = false
      previewing = false
      render(saved)
      publish()
      return pending
    },
    dispose(): void {
      disposed = true
      offThemeChange()
      render(defaultConfig())
      listeners.clear()
    },
  }
}
