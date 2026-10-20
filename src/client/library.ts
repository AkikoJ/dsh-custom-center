/**
 * Browser-side access to the wallpaper library served by the host half.
 *
 * Requests go to the same origin as the page (resolved against the document
 * base URI, like the DSH connection does) and carry the marker header the host
 * requires. Nothing here ever sends a file path; files are named by library id.
 */
import { MARKER_HEADER, kindOfName, type MediaItem } from '../core/media.ts'

/** The library listing. */
export interface LibraryListing {
  /** Display form of the library folder, e.g. `~/.dsh/background`. */
  folder: string
  items: MediaItem[]
}

/** Failure of a library request, with the host's stable error code. */
export class LibraryError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code)
  }
}

function routeUrl(route: string): URL {
  return new URL(`custom-center/${route}`, document.baseURI)
}

async function failure(response: Response): Promise<LibraryError> {
  let code = 'failed'
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string') code = body.error
  } catch {
    // not JSON: keep the generic code
  }
  return new LibraryError(code, response.status)
}

async function json<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    // the SPA fallback answers unknown paths with HTML: the host half is not running
    throw new LibraryError('unavailable', response.status)
  }
}

async function call(url: URL, init: RequestInit = {}): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      headers: { [MARKER_HEADER]: '1', ...init.headers },
    })
  } catch {
    throw new LibraryError('unreachable', 0)
  }
  if (!response.ok) throw await failure(response)
  return response
}

/** List every file in the library, newest first. */
export async function listLibrary(): Promise<LibraryListing> {
  const response = await call(routeUrl('list'))
  return json<LibraryListing>(response)
}

/**
 * Upload one file into the library; the host sorts it into the image or video folder.
 * @param file - the user-selected file.
 * @returns the stored item (its name may differ if the name was taken).
 */
export async function uploadToLibrary(file: File): Promise<MediaItem> {
  if (kindOfName(file.name) === undefined) throw new LibraryError('unsupported', 415)
  const url = routeUrl('upload')
  url.searchParams.set('name', file.name)
  const response = await call(url, {
    method: 'POST',
    body: file,
    headers: { 'content-type': 'application/octet-stream' },
  })
  return (await json<{ item: MediaItem }>(response)).item
}

/**
 * Address of a library file, usable as an `<img>` or `<video>` source.
 * @param item - a library item.
 */
export function fileUrl(item: MediaItem): string {
  const url = routeUrl('file')
  url.searchParams.set('id', item.id)
  url.searchParams.set('v', String(item.mtime))
  return url.toString()
}

/**
 * Download a library file as a `File` so the wallpaper pipeline can process it.
 * @param item - a library item.
 */
export async function loadLibraryFile(item: MediaItem): Promise<File> {
  const response = await call(new URL(fileUrl(item)))
  const blob = await response.blob()
  return new File([blob], item.name, { type: blob.type })
}
