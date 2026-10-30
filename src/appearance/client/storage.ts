import { type SkinSeeds } from "../skins.js";
import { isToneHistogram } from "../tone.js";
import { NATIVE_ID, CUSTOM_ID, DEFAULT_BG, DEFAULT_INPUT, type SkinConfig } from "./model.js";


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

export function defaultConfig(): SkinConfig {
  return { kind: 'none', seeds: null, source: '', image: '', video: null, bg: DEFAULT_BG, side: DEFAULT_BG, input: DEFAULT_INPUT, frosted: false }
}

/** Read the persisted configuration (the video blob is loaded separately). */
export function loadSaved(): SkinConfig {
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

/** Write a configuration to storage; returns the pending IndexedDB write. */
export function persist(cfg: SkinConfig, previous: SkinConfig): Promise<void> {
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
