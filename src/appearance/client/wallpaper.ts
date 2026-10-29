/**
 * Browser-side wallpaper runtime: persistence, background layers and the
 * image/video decode + colour-sampling bridge.
 *
 * Everything that touches the DOM, localStorage or IndexedDB lives here; the
 * palette maths stays in src/appearance. Custom wallpapers never leave the machine:
 * images persist in localStorage, videos in IndexedDB.
 */
import { IMAGE_VEIL, VIDEO_VEIL, sampleSeeds } from '../sample.ts'
import type { SampleResult } from '../sample.ts'
import { toneHistogram } from '../tone.ts'

/** localStorage / IndexedDB keys owned by this plugin. */
export const LS_ACTIVE = 'dsh-custom-center.active'
export const LS_BG_OPACITY = 'dsh-custom-center.bgOpacity'
export const LS_SIDE_OPACITY = 'dsh-custom-center.sideOpacity'
export const LS_INPUT_OPACITY = 'dsh-custom-center.inputOpacity'
export const LS_FROSTED = 'dsh-custom-center.frosted'
export const LS_CUSTOM_SEEDS = 'dsh-custom-center.custom.seeds'
export const LS_CUSTOM_IMAGE = 'dsh-custom-center.custom.image'
export const LS_CUSTOM_VIDEO = 'dsh-custom-center.custom.video'
export const LS_CUSTOM_SOURCE = 'dsh-custom-center.custom.source'

const IDB_DB = 'dsh-custom-center'
const IDB_STORE = 'videos'
const IDB_KEY = 'custom'

/** Read a localStorage string, tolerating privacy-mode throws. */
export function loadLS(key: string, fallback: string): string {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : raw
  } catch {
    return fallback
  }
}

/** Write a localStorage string, swallowing quota/privacy errors. */
export function saveLS(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // quota exceeded or privacy mode: skip persistence
  }
}

/** Read a clamped 0..100 opacity from localStorage. */
export function loadOpacity(key: string, fallback: number): number {
  const raw = loadLS(key, '')
  if (raw === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, n))
}

// ---------------------------------------------------------------------------
// IndexedDB blob store (video wallpaper)
// ---------------------------------------------------------------------------

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1)
    req.onupgradeneeded = (): void => {
      req.result.createObjectStore(IDB_STORE)
    }
    req.onsuccess = (): void => resolve(req.result)
    req.onerror = (): void => reject(req.error)
  })
}

/** Persist a video blob under the single custom key. */
export function idbSaveBlob(blob: Blob): Promise<void> {
  return idbOpen().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite')
        tx.objectStore(IDB_STORE).put(blob, IDB_KEY)
        tx.oncomplete = (): void => {
          db.close()
          resolve()
        }
        tx.onerror = (): void => {
          db.close()
          reject(tx.error)
        }
      }),
  )
}

/** Read the persisted video blob, or null when absent. */
export function idbLoadBlob(): Promise<Blob | null> {
  return idbOpen().then(
    (db) =>
      new Promise<Blob | null>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly')
        const req = tx.objectStore(IDB_STORE).get(IDB_KEY)
        req.onsuccess = (): void => {
          db.close()
          resolve((req.result as Blob) ?? null)
        }
        req.onerror = (): void => {
          db.close()
          reject(req.error)
        }
      }),
  )
}

/** Delete the persisted video blob (best effort). */
export function idbClearBlob(): Promise<void> {
  return idbOpen().then(
    (db) =>
      new Promise<void>((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readwrite')
        tx.objectStore(IDB_STORE).delete(IDB_KEY)
        tx.oncomplete = (): void => {
          db.close()
          resolve()
        }
        tx.onerror = (): void => {
          db.close()
          resolve()
        }
      }),
  )
}

// ---------------------------------------------------------------------------
// Image decode + colour sampling
// ---------------------------------------------------------------------------

/** Decoded custom image: compact WebP data URL plus sampled seeds and veil. */
export interface ProcessedImage extends SampleResult {
  image: string
}

/**
 * Decode an image file, re-encode a compact WebP background and sample its
 * seeds. The image is only ever processed in the browser.
 * @param file - a user-selected PNG/JPG/WebP file.
 */
export function processImage(file: File): Promise<ProcessedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = (): void => {
      try {
        const naturalW = img.naturalWidth
        const naturalH = img.naturalHeight
        if (!naturalW || !naturalH) {
          reject(new Error('bad image'))
          return
        }
        // 1) compact background: fit long edge to 1920px, WebP q0.82.
        const scale = Math.min(1, 1920 / Math.max(naturalW, naturalH))
        const bw = Math.max(1, Math.round(naturalW * scale))
        const bh = Math.max(1, Math.round(naturalH * scale))
        const bgCanvas = document.createElement('canvas')
        bgCanvas.width = bw
        bgCanvas.height = bh
        const bgCtx = bgCanvas.getContext('2d')
        if (!bgCtx) {
          reject(new Error('no 2d context'))
          return
        }
        bgCtx.imageSmoothingQuality = 'high'
        bgCtx.drawImage(img, 0, 0, bw, bh)
        let image = bgCanvas.toDataURL('image/webp', 0.82)
        if (image.length > 2 * 1024 * 1024) image = bgCanvas.toDataURL('image/webp', 0.6)

        // 2) colour sample on a 64px grid.
        const size = 64
        const sample = document.createElement('canvas')
        sample.width = size
        sample.height = size
        const sctx = sample.getContext('2d', { willReadFrequently: true })
        if (!sctx) {
          reject(new Error('no 2d context'))
          return
        }
        sctx.drawImage(img, 0, 0, size, size)
        const data = sctx.getImageData(0, 0, size, size).data
        URL.revokeObjectURL(url)

        const { seeds, veil } = sampleSeeds(data, IMAGE_VEIL)
        resolve({ seeds, veil, image })
      } catch (err) {
        URL.revokeObjectURL(url)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    img.onerror = (): void => {
      URL.revokeObjectURL(url)
      reject(new Error('decode failed'))
    }
    img.src = url
  })
}

/**
 * Tone histogram of a stored image data URL. Wallpapers saved before the tone
 * profile existed have none; this recovers it without asking for a re-import.
 * @param url - the stored WebP data URL.
 */
export function toneOfImageUrl(url: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = (): void => {
      try {
        const size = 64
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          reject(new Error('no 2d context'))
          return
        }
        ctx.drawImage(img, 0, 0, size, size)
        resolve(toneHistogram(ctx.getImageData(0, 0, size, size).data))
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    img.onerror = (): void => reject(new Error('decode failed'))
    img.src = url
  })
}

/**
 * Decode a video's first representative frame and sample its seeds. The video
 * blob is stored separately in IndexedDB; this returns seeds and a veil only.
 * @param file - a user-selected MP4/WebM file.
 */
export function processVideo(file: File): Promise<SampleResult> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted = true
    video.preload = 'auto'
    video.playsInline = true
    let cleaned = false
    const cleanup = (): void => {
      if (cleaned) return
      cleaned = true
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      video.load()
    }
    video.onloadeddata = (): void => {
      try {
        video.currentTime = Math.min(1, (video.duration || 1) * 0.1)
      } catch (err) {
        cleanup()
        reject(err instanceof Error ? err : new Error('video seek failed'))
      }
    }
    video.onseeked = (): void => {
      try {
        const w = video.videoWidth
        const h = video.videoHeight
        if (!w || !h) {
          cleanup()
          reject(new Error('bad video dimensions'))
          return
        }
        const size = 64
        const sample = document.createElement('canvas')
        sample.width = size
        sample.height = size
        const sctx = sample.getContext('2d', { willReadFrequently: true })
        if (!sctx) {
          cleanup()
          reject(new Error('no 2d context'))
          return
        }
        sctx.drawImage(video, 0, 0, size, size)
        const data = sctx.getImageData(0, 0, size, size).data
        const result = sampleSeeds(data, VIDEO_VEIL)
        cleanup()
        resolve(result)
      } catch (err) {
        cleanup()
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    video.onerror = (): void => {
      cleanup()
      reject(new Error('video decode failed'))
    }
    video.src = url
  })
}

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
