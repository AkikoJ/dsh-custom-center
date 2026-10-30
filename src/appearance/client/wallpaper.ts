import { IMAGE_VEIL, VIDEO_VEIL, sampleSeeds } from "../sample.js";
import type { SampleResult } from "../sample.js";
import { toneHistogram } from "../tone.js";

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
