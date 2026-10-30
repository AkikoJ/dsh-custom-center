import { createHostAppearance } from "./host-appearance.js";
import { defaultConfig, loadSaved, persist } from "./storage.js";
import type { SkinConfig, WallpaperKind } from "./model.js";
export type { WallpaperKind } from "./model.js";
import { type SkinSeeds } from "../skins.js";
import { isToneHistogram } from "../tone.js";
import type { ThemeService } from "../../shared/browser-env.js";
import { LS_CUSTOM_SEEDS, idbLoadBlob, saveLS } from "./storage.js";
import { processVideo, toneOfImageUrl } from "./wallpaper.js";


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

/**
 * Build the controller.
 * @param theme - the host theme service.
 * @param onThemeChange - registers a `theme/change` listener; returns a disposer.
 */
export function createController(
  theme: ThemeService,
  onThemeChange: (handler: () => void) => () => void,
): SkinController {
  const hostAppearance = createHostAppearance(theme)
  let saved = loadSaved()
  let draft: SkinConfig = { ...saved }
  let live: SkinConfig = saved
  let dirty = false
  let previewing = false
  let disposed = false
  let revision = 0
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

  /** Render a configuration onto the live UI. */
  function render(cfg: SkinConfig): void {
    if (typeof document === "undefined") return
    live = cfg
    hostAppearance.render(cfg)
  }

  /** Mark the draft as edited; in preview mode the edit is rendered at once. */
  function touch(): void {
    dirty = true
    if (previewing) render(draft)
    publish()
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
