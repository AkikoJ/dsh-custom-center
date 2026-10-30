import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, lstat, mkdir, open, rename, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { allowedCookieDomain, record } from './platform.ts'
import { LoginFailure, type CredentialCookie, type CredentialSnapshot } from './types.ts'

/** Profile-owned base; no browser request can override this location. */
export function defaultDouyinRoot(): string {
  const base = process.env.DSH_PROFILE_DIR?.trim() || process.env.DSH_HOME?.trim() || path.join(os.homedir(), '.dsh')
  return path.resolve(base, 'custom-center', 'douyin')
}

export function validCookie(value: unknown): value is CredentialCookie {
  const c = record(value)
  return !!c && typeof c.name === 'string' && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(c.name)
    && typeof c.value === 'string' && !/[\x00-\x20\x7f;,]/.test(c.value)
    && typeof c.domain === 'string' && allowedCookieDomain(c.domain)
    && typeof c.path === 'string' && c.path.startsWith('/') && !/[\r\n;]/.test(c.path)
    && typeof c.expires === 'number' && Number.isFinite(c.expires) && (c.expires === -1 || c.expires >= 0)
    && typeof c.httpOnly === 'boolean' && typeof c.secure === 'boolean'
    && ['Strict', 'Lax', 'None'].includes(String(c.sameSite))
    && (c.partitionKey === undefined || typeof c.partitionKey === 'string')
}

function validSnapshot(value: unknown): value is CredentialSnapshot {
  const s = record(value)
  const account = record(s?.account)
  const time = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v))
  return !!s && s.schema === 1 && typeof s.generation === 'string' && /^[\w-]{1,100}$/.test(s.generation)
    && typeof account?.uid === 'string' && /^\d{1,30}$/.test(account.uid) && !/^0+$/.test(account.uid)
    && (account.nickname === undefined || typeof account.nickname === 'string' && account.nickname.length <= 100)
    && time(s.exportedAt) && time(s.browserVerifiedAt)
    && typeof s.userAgent === 'string' && s.userAgent.length <= 1000 && !/[\r\n]/.test(s.userAgent)
    && typeof s.usable === 'boolean' && Array.isArray(s.cookies) && s.cookies.length <= 3000 && s.cookies.every(validCookie)
    && Array.isArray(s.browserCookies) && s.browserCookies.length <= 3000 && s.browserCookies.every(validCookie)
}

/** Reject symlinked owned roots and files, including intermediate owned folders. */
export async function privateDirectory(directory: string): Promise<void> {
  const absolute = path.resolve(directory)
  const parent = path.dirname(absolute)
  if (parent !== absolute) {
    const info = await lstat(parent).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
      return undefined
    })
    if (!info) await privateDirectory(parent)
    else if (!info.isDirectory() || info.isSymbolicLink()) throw new LoginFailure('storage-unavailable')
  }
  await mkdir(absolute, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error })
  const info = await lstat(absolute)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new LoginFailure('storage-unavailable')
  await chmod(absolute, 0o700)
}

export class CredentialStore {
  readonly file: string
  constructor(readonly root: string) { this.file = path.join(root, 'credentials.json') }

  async load(): Promise<CredentialSnapshot | undefined> {
    try {
      const info = await lstat(this.file)
      if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024) throw new LoginFailure('snapshot-invalid')
      const fd = await open(this.file, constants.O_RDONLY | constants.O_NOFOLLOW)
      let value: unknown
      try { value = JSON.parse(await fd.readFile('utf8')) } finally { await fd.close() }
      if (!validSnapshot(value)) throw new LoginFailure('snapshot-invalid')
      await chmod(this.file, 0o600)
      return value
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw new LoginFailure('snapshot-invalid')
    }
  }

  async save(snapshot: CredentialSnapshot, signal: AbortSignal): Promise<void> {
    if (!validSnapshot(snapshot)) throw new LoginFailure('save-failed')
    await privateDirectory(this.root)
    const target = await lstat(this.file).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
      return undefined
    })
    if (target && (!target.isFile() || target.isSymbolicLink())) throw new LoginFailure('save-failed')
    const temp = path.join(this.root, `.credentials-${randomUUID()}.tmp`)
    try {
      const fd = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
      try { await fd.writeFile(JSON.stringify(snapshot)); await fd.sync() } finally { await fd.close() }
      signal.throwIfAborted()
      await rename(temp, this.file)
    } finally { await rm(temp, { force: true }) }
  }
}
