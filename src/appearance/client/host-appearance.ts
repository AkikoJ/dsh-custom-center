import type { ThemeService } from "../../shared/browser-env.js";
import { TOKEN_NAMES, type Appearance, type SkinSeeds, deriveTokens } from "../skins.js";
import { luminance, readableOn } from "../color.js";
import { resolveAppearance } from "../tone.js";
import { CUSTOM_ID, type SkinConfig } from "./model.js";


/** Attribute the host sets on `<body>` while its dark palette is active. */
const DARK_ATTRIBUTE = 'data-ds-dark-theme'

// ---------------------------------------------------------------------------
// Background layers (image + video)
// ---------------------------------------------------------------------------

/** Set or clear the fixed background-image layer on `<html>`. */
export function applyBackground(image: string | null): void {
  const host = document.documentElement
  if (image) {
    host.style.setProperty('--dsh-cc-bg-image', `url(${image})`)
    host.setAttribute('data-dsh-cc-bg', 'image')
  } else {
    host.style.removeProperty('--dsh-cc-bg-image')
    host.removeAttribute('data-dsh-cc-bg')
  }
}

let videoBgEl: HTMLVideoElement | null = null

let videoBgUrl: string | null = null

/** Create or reuse the fixed `<video>` wallpaper layer. */
export function applyVideoBackground(blobUrl: string | null): void {
  const host = document.documentElement
  if (!blobUrl) {
    clearVideoBackground()
    return
  }
  if (!videoBgEl) {
    videoBgEl = document.createElement('video')
    videoBgEl.muted = true
    videoBgEl.loop = true
    videoBgEl.playsInline = true
    videoBgEl.autoplay = true
    videoBgEl.setAttribute('aria-hidden', 'true')
    // DSH marks every direct child of <body> except #root as `no-drag` on macOS.
    // This layer covers the whole window, so without the inline reset it would
    // cancel the window drag regions (title bar strip) while a video is active.
    videoBgEl.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;pointer-events:none;-webkit-app-region:initial'
    document.body.appendChild(videoBgEl)
  }
  if (videoBgUrl !== blobUrl) {
    videoBgEl.src = blobUrl
    videoBgUrl = blobUrl
  }
  void videoBgEl.play().catch(() => {
    // autoplay may require a gesture; the loop retries
  })
  host.setAttribute('data-dsh-cc-bg', 'video')
}

/** Remove the `<video>` wallpaper layer and release its object URL. */
export function clearVideoBackground(): void {
  if (videoBgEl) {
    videoBgEl.pause()
    videoBgEl.removeAttribute('src')
    videoBgEl.load()
    videoBgEl.parentNode?.removeChild(videoBgEl)
    videoBgEl = null
  }
  if (videoBgUrl) {
    URL.revokeObjectURL(videoBgUrl)
    videoBgUrl = null
  }
  const host = document.documentElement
  host.removeAttribute('data-dsh-cc-bg')
}

/** Reflect the frosted-scrim toggle onto `<html>`. */
export function applyFrostedGate(on: boolean): void {
  if (on) document.documentElement.setAttribute('data-dsh-cc-frosted', '')
  else document.documentElement.removeAttribute('data-dsh-cc-frosted')
}


/** Applies a complete appearance and owns its host registrations and DOM resources. */
export function createHostAppearance(theme: ThemeService) {
  let registration: (() => void) | null = null

  let registeredSeeds: SkinSeeds | null = null

  let videoCache: { blob: Blob; url: string } | null = null

  /** The palette was flipped to dark over a light host; the body attribute is ours to keep. */
  let forcedDark = false

  let darkGuard: MutationObserver | null = null

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
  return { render };
}
