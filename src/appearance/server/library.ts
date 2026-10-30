/**
 * The wallpaper library: a folder on this machine with one sub-folder per
 * class (`images/`, `videos/`), served to the browser half through three
 * loopback-only routes.
 *
 * Route contract:
 * - `GET  /custom-center/list`   -> `{ folder, items }`
 * - `POST /custom-center/upload?name=<file name>` (raw body) -> `{ item }`
 * - `GET  /custom-center/file?id=<images|videos>/<name>` -> the file (Range ok)
 *
 * Safety rules, per the project AGENTS.md:
 * - every route requires a loopback socket plus the Connection Host/Origin
 *   fence and browser authentication;
 * - `list` and `upload` also require the same-origin marker header (a custom
 *   header a cross-site page cannot send without a preflight); `file` cannot,
 *   because `<img>` and `<video>` requests carry no custom headers;
 * - the browser never supplies a path: ids are `<class folder>/<single name>`
 *   and are resolved against the server-owned root, symlinks are refused.
 */
import { randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { link, lstat, mkdir, readdir, rename, rm } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import {
  MAX_BYTES,
  MEDIA_FOLDERS,
  SIGNATURE_BYTES,
  contentTypeOf,
  extensionOf,
  kindOfName,
  matchesSignature,
  parseRange,
  sanitizeFileName,
  uniqueName,
  type MediaItem,
  type MediaKind,
} from '../media.ts'
import { MARKER_HEADER, isLoopbackAddress } from '../../shared/request.ts'
import type { WebRoute } from "../../shared/host-env.js";

/** Path prefix of the library routes. */
export const ROUTE_PREFIX = '/custom-center'

/** Options for {@link createLibraryRoutes}. */
export interface LibraryOptions {
  /** Absolute library root; server-owned, never taken from a request. */
  root: string
  /** Host/Origin fence plus authentication; returns a rejection status or undefined. */
  reject: (req: IncomingMessage) => 401 | 403 | undefined
}

/** Failure with an HTTP status and a stable machine-readable code. */
class LibraryFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code)
  }
}

/**
 * Default library root: `<DSH home>/background`.
 * @returns the absolute folder path.
 */
export function defaultLibraryRoot(): string {
  const home = process.env['DSH_HOME']?.trim()
  return path.join(home ? home : path.join(os.homedir(), '.dsh'), 'background')
}

/**
 * Human-readable form of a path, with the home directory shown as `~`.
 * @param target - an absolute path.
 */
export function displayPath(target: string): string {
  const home = os.homedir()
  return target === home || target.startsWith(home + path.sep) ? `~${target.slice(home.length)}` : target
}

function sendJson(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extra,
  })
  res.end(text)
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : undefined
}

async function ensureFolders(root: string): Promise<void> {
  for (const kind of ['image', 'video'] as const) await mkdir(path.join(root, MEDIA_FOLDERS[kind]), { recursive: true })
}

async function listItems(root: string): Promise<MediaItem[]> {
  const items: MediaItem[] = []
  for (const kind of ['image', 'video'] as const) {
    const folder = MEDIA_FOLDERS[kind]
    const dir = path.join(root, folder)
    const names = await readdir(dir).catch((error: unknown) => {
      if (errorCode(error) === 'ENOENT') return [] as string[]
      throw error
    })
    for (const name of names) {
      if (name.startsWith('.') || kindOfName(name) !== kind) continue
      try {
        const info = await lstat(path.join(dir, name))
        if (info.isFile()) items.push({ id: `${folder}/${name}`, kind, name, size: info.size, mtime: Math.floor(info.mtimeMs) })
      } catch {
        // removed while listing
      }
    }
  }
  items.sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name))
  return items
}

/** Resolve a browser-supplied id to a file inside the library, or undefined. */
function resolveId(root: string, id: string): { kind: MediaKind; name: string; file: string } | undefined {
  const match = /^(images|videos)\/([^/\\]+)$/.exec(id)
  if (!match) return undefined
  const kind: MediaKind = match[1] === 'images' ? 'image' : 'video'
  const name = match[2] as string
  if (name.startsWith('.') || name.includes('\0') || kindOfName(name) !== kind) return undefined
  return { kind, name, file: path.join(root, match[1] as string, name) }
}

/** Give a finished temp file its final, collision-free name. */
async function publish(temp: string, dir: string, name: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const taken = new Set((await readdir(dir)).map((entry) => entry.toLowerCase()))
    const finalName = uniqueName(name, taken)
    const target = path.join(dir, finalName)
    try {
      await link(temp, target)
      await rm(temp, { force: true })
      return finalName
    } catch (error) {
      if (errorCode(error) === 'EEXIST') continue
      // no hard links on this filesystem: fall back to a plain rename
      await rename(temp, target)
      return finalName
    }
  }
  throw new LibraryFailure(500, 'failed')
}

async function handleList(options: LibraryOptions, res: ServerResponse): Promise<void> {
  await ensureFolders(options.root)
  sendJson(res, 200, { folder: displayPath(options.root), items: await listItems(options.root) })
}

async function handleUpload(options: LibraryOptions, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const name = sanitizeFileName(url.searchParams.get('name') ?? '')
  const kind = name === undefined ? undefined : kindOfName(name)
  if (name === undefined || kind === undefined) throw new LibraryFailure(415, 'unsupported')
  const limit = MAX_BYTES[kind]
  const declared = Number(req.headers['content-length'])
  if (Number.isFinite(declared) && declared > limit) throw new LibraryFailure(413, 'too-large')

  await ensureFolders(options.root)
  const dir = path.join(options.root, MEDIA_FOLDERS[kind])
  const temp = path.join(dir, `.upload-${randomBytes(6).toString('hex')}.part`)
  const ext = extensionOf(name)
  let total = 0
  let head = Buffer.alloc(0)
  let verified = false

  async function* guarded(source: AsyncIterable<Buffer>): AsyncGenerator<Buffer> {
    for await (const chunk of source) {
      total += chunk.length
      if (total > limit) throw new LibraryFailure(413, 'too-large')
      if (!verified) {
        head = Buffer.concat([head, chunk]).subarray(0, SIGNATURE_BYTES)
        if (head.length >= SIGNATURE_BYTES) {
          if (!matchesSignature(ext, head)) throw new LibraryFailure(415, 'bad-content')
          verified = true
        }
      }
      yield chunk
    }
    if (!verified && !matchesSignature(ext, head)) throw new LibraryFailure(415, 'bad-content')
  }

  try {
    await pipeline(req, guarded, createWriteStream(temp, { flags: 'wx', mode: 0o600 }))
    const finalName = await publish(temp, dir, name)
    const info = await lstat(path.join(dir, finalName))
    const item: MediaItem = {
      id: `${MEDIA_FOLDERS[kind]}/${finalName}`,
      kind,
      name: finalName,
      size: info.size,
      mtime: Math.floor(info.mtimeMs),
    }
    sendJson(res, 201, { item })
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

async function handleFile(options: LibraryOptions, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const target = resolveId(options.root, url.searchParams.get('id') ?? '')
  if (!target) throw new LibraryFailure(404, 'not-found')
  const info = await lstat(target.file).catch(() => undefined)
  if (!info || !info.isFile()) throw new LibraryFailure(404, 'not-found')

  const headers: Record<string, string> = {
    'content-type': contentTypeOf(target.name),
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
  }
  const range = parseRange(req.headers.range, info.size)
  if (range === 'unsatisfiable') {
    res.writeHead(416, { ...headers, 'content-range': `bytes */${info.size}` })
    res.end()
    return
  }
  if (info.size === 0) {
    res.writeHead(200, { ...headers, 'content-length': '0' })
    res.end()
    return
  }
  const start = range?.start ?? 0
  const end = range?.end ?? info.size - 1
  res.writeHead(range ? 206 : 200, {
    ...headers,
    'content-length': String(end - start + 1),
    ...(range ? { 'content-range': `bytes ${start}-${end}/${info.size}` } : {}),
  })
  await pipeline(createReadStream(target.file, { start, end }), res).catch(() => undefined)
}

/**
 * Build the three library routes.
 * @param options - the library root and the Connection fence.
 * @returns routes ready for `webServer.register`.
 */
export function createLibraryRoutes(options: LibraryOptions): WebRoute[] {
  const make =
    (
      method: 'GET' | 'POST',
      needsMarker: boolean,
      run: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
    ): WebRoute['handler'] =>
    async (req, res) => {
      try {
        if (!isLoopbackAddress(req.socket.remoteAddress)) throw new LibraryFailure(403, 'forbidden')
        const rejection = options.reject(req)
        if (rejection !== undefined) throw new LibraryFailure(rejection, rejection === 401 ? 'unauthorized' : 'forbidden')
        if (req.method !== method) throw new LibraryFailure(405, 'method-not-allowed')
        if (needsMarker && req.headers[MARKER_HEADER] !== '1') throw new LibraryFailure(403, 'forbidden')
        await run(req, res)
      } catch (error) {
        if (res.headersSent) {
          res.destroy()
          return
        }
        const failure = error instanceof LibraryFailure ? error : new LibraryFailure(500, 'failed')
        sendJson(res, failure.status, { error: failure.code }, failure.status === 405 ? { allow: method } : {})
      }
    }
  return [
    { kind: 'exact', path: `${ROUTE_PREFIX}/list`, handler: make('GET', true, (_req, res) => handleList(options, res)) },
    { kind: 'exact', path: `${ROUTE_PREFIX}/upload`, handler: make('POST', true, (req, res) => handleUpload(options, req, res)) },
    { kind: 'exact', path: `${ROUTE_PREFIX}/file`, handler: make('GET', false, (req, res) => handleFile(options, req, res)) },
  ]
}
