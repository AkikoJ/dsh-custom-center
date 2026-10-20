/**
 * Wallpaper library rules shared by the host half, the browser half and tests:
 * which files count as images or videos, how uploaded names are sanitized, and
 * the small HTTP helpers (byte ranges, loopback check) the host routes need.
 * Pure: no DOM, no Node APIs.
 */

/** The two wallpaper classes the library keeps in separate folders. */
export type MediaKind = 'image' | 'video'

/** One library file as the browser sees it. Never carries an absolute path. */
export interface MediaItem {
  /** Path relative to the library root, e.g. `images/sea.jpg`. */
  id: string
  kind: MediaKind
  name: string
  size: number
  /** Modification time in whole milliseconds, used to bust caches. */
  mtime: number
}

const MIB = 1024 * 1024

/** Accepted extensions with their class and response content type. */
const EXTENSIONS: ReadonlyMap<string, { kind: MediaKind; type: string }> = new Map([
  ['png', { kind: 'image', type: 'image/png' }],
  ['jpg', { kind: 'image', type: 'image/jpeg' }],
  ['jpeg', { kind: 'image', type: 'image/jpeg' }],
  ['webp', { kind: 'image', type: 'image/webp' }],
  ['mp4', { kind: 'video', type: 'video/mp4' }],
  ['webm', { kind: 'video', type: 'video/webm' }],
])

/** Sub-folder of the library root that holds each class. */
export const MEDIA_FOLDERS: Readonly<Record<MediaKind, string>> = { image: 'images', video: 'videos' }

/** Upload size ceiling per class, in bytes. */
export const MAX_BYTES: Readonly<Record<MediaKind, number>> = { image: 50 * MIB, video: 512 * MIB }

/** Value of the marker header the browser half sends with every library request. */
export const MARKER_HEADER = 'x-dsh-custom-center'

/**
 * Lower-case extension of a file name, without the dot.
 * @param name - a file name.
 * @returns the extension, or an empty string when there is none.
 */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot <= 0 || dot === name.length - 1 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * Classify a file name by its extension.
 * @param name - a file name.
 * @returns the class, or undefined for an unsupported type.
 */
export function kindOfName(name: string): MediaKind | undefined {
  return EXTENSIONS.get(extensionOf(name))?.kind
}

/**
 * Content type to serve a library file with.
 * @param name - a supported file name.
 */
export function contentTypeOf(name: string): string {
  return EXTENSIONS.get(extensionOf(name))?.type ?? 'application/octet-stream'
}

/**
 * Turn a client-supplied name into a safe single path segment.
 * @param raw - the name as sent by the browser (may hold directories or odd characters).
 * @returns the cleaned name, or undefined when the extension is unsupported.
 */
export function sanitizeFileName(raw: string): string | undefined {
  const last = raw.split(/[\\/]/).pop() ?? ''
  const ext = extensionOf(last)
  if (!EXTENSIONS.has(ext)) return undefined
  let stem = last
    .slice(0, last.length - ext.length - 1)
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
  stem = Array.from(stem.replace(/^[\s.]+/, '')).slice(0, 100).join('').replace(/[\s.]+$/, '')
  return `${stem === '' ? 'wallpaper' : stem}.${ext}`
}

/**
 * Pick a name that does not collide with an existing file.
 * @param name - a sanitized file name.
 * @param taken - lower-case names already present (folders may be case-insensitive).
 * @returns `name`, or `stem (n).ext` for the first free n.
 */
export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name.toLowerCase())) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const suffix = dot > 0 ? name.slice(dot) : ''
  for (let n = 1; n < 1000; n += 1) {
    const candidate = `${stem} (${n})${suffix}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
  throw new Error('too many files share this name')
}

/** An inclusive byte range within a file. */
export interface ByteRange {
  start: number
  end: number
}

/**
 * Parse a single-range `Range` header.
 * @param header - the raw header value, if any.
 * @param size - the file size in bytes.
 * @returns the range, `unsatisfiable` when it lies outside the file, or undefined
 *   when there is no usable single range (serve the whole file).
 */
export function parseRange(header: string | undefined, size: number): ByteRange | 'unsatisfiable' | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec((header ?? '').trim())
  if (!match || (match[1] === '' && match[2] === '')) return undefined
  if (match[1] === '') {
    const suffix = Number(match[2])
    return suffix === 0 || size === 0 ? 'unsatisfiable' : { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(match[1])
  if (start >= size) return 'unsatisfiable'
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  return end < start ? undefined : { start, end }
}

/**
 * Whether a socket's remote address is the local machine.
 * @param address - `socket.remoteAddress`.
 */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false
  const plain = address.startsWith('::ffff:') ? address.slice(7) : address
  return plain === '::1' || /^127(\.\d{1,3}){3}$/.test(plain)
}

/** Number of leading bytes {@link matchesSignature} needs. */
export const SIGNATURE_BYTES = 12

/** MP4 atoms a file may legally start with (offset 4). */
const MP4_BRANDS = ['ftyp', 'moov', 'mdat', 'free', 'wide', 'skip']

/**
 * Check that a file's leading bytes agree with its extension, so a renamed
 * arbitrary file is not stored as a wallpaper.
 * @param ext - lower-case extension without the dot.
 * @param head - at least {@link SIGNATURE_BYTES} leading bytes (fewer fail).
 */
export function matchesSignature(ext: string, head: Uint8Array): boolean {
  const has = (offset: number, ...bytes: number[]): boolean =>
    head.length >= offset + bytes.length && bytes.every((value, index) => head[offset + index] === value)
  switch (ext) {
    case 'png':
      return has(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    case 'jpg':
    case 'jpeg':
      return has(0, 0xff, 0xd8, 0xff)
    case 'webp':
      return has(0, 0x52, 0x49, 0x46, 0x46) && has(8, 0x57, 0x45, 0x42, 0x50)
    case 'webm':
      return has(0, 0x1a, 0x45, 0xdf, 0xa3)
    case 'mp4':
      return MP4_BRANDS.some((brand) => has(4, ...Array.from(brand, (ch) => ch.charCodeAt(0))))
    default:
      return false
  }
}
