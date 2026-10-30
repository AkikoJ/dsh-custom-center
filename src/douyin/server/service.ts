import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { DouyinStatus } from '../contracts.ts'
import { DOUYIN_MESSAGES } from '../contracts.ts'
import { playwrightBrowser } from './browser.ts'
import { cookieFingerprint, verifyHttp } from './http.ts'
import { identityResult } from './platform.ts'
import { CredentialStore, privateDirectory } from './storage.ts'
import { LoginFailure, type BrowserSession, type CredentialSnapshot, type HttpTransport, type LoginBrowser } from './types.ts'

interface ServiceOptions {
  root: string
  browser?: LoginBrowser
  transport?: HttpTransport
}

// Survives module reload: a new owner must await the previous owner's cleanup.
const ownershipKey = Symbol.for('dsh-custom-center.douyin.owners')
interface Owner { dispose(): Promise<void> }
const globals = globalThis as typeof globalThis & { [ownershipKey]?: Map<string, Owner> }
const owners = globals[ownershipKey] ??= new Map<string, Owner>()

export class DouyinLoginService {
  private readonly root: string
  private readonly store: CredentialStore
  private readonly browser: LoginBrowser
  private readonly transport: HttpTransport
  private readonly ready: Promise<void>
  private tail: Promise<unknown> = Promise.resolve()
  private session?: BrowserSession
  private credentials?: CredentialSnapshot
  private controller = new AbortController()
  private revision = 0
  private disposed = false
  private storageBlocked = false
  private disposal?: Promise<void>
  private timer?: ReturnType<typeof setTimeout>
  private observeUntil = 0
  private nextCheckAt = 0
  private backoff = 10_000
  private httpBackoff = 10_000
  private checking?: Promise<DouyinStatus>
  private state: DouyinStatus = {
    window: 'closed', phase: 'idle', browserAuth: 'unverified', persistence: 'none', observation: 'idle', http: { state: 'unverified' },
  }

  constructor(options: ServiceOptions) {
    this.root = path.resolve(options.root)
    this.store = new CredentialStore(this.root)
    this.browser = options.browser ?? playwrightBrowser
    this.transport = options.transport ?? ((url, init) => fetch(url, init))
    const previous = owners.get(this.root)
    owners.set(this.root, this)
    this.ready = this.initialize(previous)
  }

  private async initialize(previous?: Owner): Promise<void> {
    try {
      if (previous) await previous.dispose()
      if (this.disposed) return
      await privateDirectory(this.root)
      this.credentials = await this.store.load()
      if (this.credentials) {
        this.state.account = this.credentials.account
        this.state.savedAt = this.credentials.exportedAt
        this.state.persistence = 'historical'
      }
    } catch (error) {
      this.state.persistence = 'invalid'
      this.state.notice = error instanceof LoginFailure ? error.code : 'storage-unavailable'
      this.storageBlocked = this.state.notice !== 'snapshot-invalid'
    }
  }

  async status(): Promise<DouyinStatus> {
    await this.ready
    return structuredClone(this.state)
  }

  private enqueue(run: () => Promise<void>, cleanup = false): Promise<DouyinStatus> {
    const revision = this.revision
    const task = this.tail.then(async () => {
      await this.ready
      if (this.disposed && !cleanup) throw new LoginFailure('disposed')
      if (revision !== this.revision && !cleanup) return
      try { await run() }
      catch (error) {
        if (revision === this.revision && !this.disposed) {
          this.state.notice = error instanceof LoginFailure && DOUYIN_MESSAGES[error.code] ? error.code : 'failed'
        }
      } finally {
        if (revision === this.revision && !this.disposed) this.state.phase = 'idle'
      }
    })
    this.tail = task.catch(() => undefined)
    return task.then(() => this.status())
  }

  open(): Promise<DouyinStatus> {
    return this.enqueue(async () => {
      if (this.storageBlocked) throw new LoginFailure('storage-unavailable')
      if (this.session) {
        await this.session.focus()
        this.startObservation()
        return
      }
      const revision = this.revision
      this.controller = new AbortController()
      this.state.phase = 'opening'
      this.state.window = 'opening'
      try {
        const session = await this.browser.open(path.join(this.root, 'browser'), this.controller.signal,
          this.credentials?.usable ? this.credentials.browserCookies : undefined)
        if (this.disposed || revision !== this.revision) { await session.close(); return }
        this.session = session
        session.onClose(() => {
          if (this.session !== session) return
          this.session = undefined
          this.cancelWork()
          this.state.window = 'closed'
          this.state.phase = 'idle'
          this.state.notice = 'window-closed'
        })
        this.state.window = 'open'
        if (this.state.browserAuth !== 'verified') this.state.browserAuth = 'waiting'
        this.state.notice = 'waiting'
        this.startObservation()
      } catch (error) {
        if (revision === this.revision) this.state.window = 'closed'
        throw error
      }
    })
  }

  check(): Promise<DouyinStatus> {
    if (this.checking) return this.checking
    const result = this.enqueue(() => this.performCheck())
    this.checking = result
    void result.finally(() => { if (this.checking === result) this.checking = undefined }).catch(() => undefined)
    return result
  }

  private current(revision: number): void {
    if (this.disposed || revision !== this.revision) throw new LoginFailure('disposed')
    this.controller.signal.throwIfAborted()
  }

  private async save(snapshot: CredentialSnapshot, revision: number): Promise<boolean> {
    this.current(revision)
    this.state.phase = 'saving'
    try {
      await this.store.save(snapshot, this.controller.signal)
      this.current(revision)
      this.credentials = snapshot
      this.state.persistence = 'saved'
      this.state.savedAt = snapshot.exportedAt
      return true
    } catch {
      this.current(revision)
      this.state.persistence = 'failed'
      this.state.http = { state: 'unverified' }
      this.state.notice = 'save-failed'
      return false
    }
  }

  private async invalidate(reason: 'expired' | 'account-mismatch', revision: number): Promise<void> {
    this.current(revision)
    this.state.browserAuth = reason
    this.state.http = { state: 'rejected', reason }
    this.state.notice = reason
    this.stopObservation()
    // Deny immediately, even if persisting the invalidation fails.
    if (this.credentials) {
      this.credentials.usable = false
      const previousPhase = this.state.phase
      await this.save({ ...this.credentials, generation: randomUUID() }, revision)
      this.state.phase = previousPhase
      this.state.http = { state: 'rejected', reason }
      this.state.notice = reason
    }
  }

  private async performCheck(): Promise<void> {
    const session = this.session
    if (!session) throw new LoginFailure('window-required')
    if (Date.now() < this.nextCheckAt) { this.state.notice = 'check-throttled'; return }
    if (this.state.observation === 'paused') this.startObservation()
    const revision = this.revision
    this.nextCheckAt = Date.now() + this.backoff
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(15_000)])
    this.state.phase = 'checking'
    let identity
    try { identity = identityResult(await session.identity(signal)) }
    catch {
      this.current(revision)
      this.state.notice = signal.aborted ? 'timeout' : 'network'
      this.backoff = Math.min(this.backoff * 2, 60_000)
      this.nextCheckAt = Date.now() + this.backoff
      return
    }
    this.current(revision)
    if (identity.kind === 'expired') {
      if (this.state.account) { await this.invalidate('expired', revision); return }
      // An anonymous first visit is the normal QR waiting state. Keep watching
      // the same window until the user completes login or observation pauses.
      this.state.browserAuth = 'waiting'
      this.state.notice = 'waiting'
      this.backoff = Math.min(this.backoff * 2, 60_000)
      this.nextCheckAt = Date.now() + this.backoff
      return
    }
    if (identity.kind !== 'verified') {
      this.state.notice = identity.reason
      if (this.state.browserAuth !== 'verified') this.state.browserAuth = 'waiting'
      this.backoff = Math.min(this.backoff * 2, 60_000)
      this.nextCheckAt = Date.now() + this.backoff
      return
    }
    const expectedUid = this.state.account?.uid
    if (expectedUid && expectedUid !== identity.account.uid) { await this.invalidate('account-mismatch', revision); return }
    this.backoff = 10_000
    this.state.account = identity.account
    this.state.browserAuth = 'verified'
    const now = new Date().toISOString()
    this.state.browserVerifiedAt = now
    this.nextCheckAt = Date.now() + this.backoff
    this.state.http = { state: 'unverified' }
    let exported
    try { exported = await session.credentials() }
    catch { this.current(revision); this.state.persistence = 'failed'; throw new LoginFailure('export-failed') }
    this.current(revision)
    let snapshot: CredentialSnapshot = {
      schema: 1, generation: randomUUID(), account: identity.account, exportedAt: now,
      browserVerifiedAt: now, ...exported, browserCookies: exported.cookies, usable: true,
    }
    if (this.credentials?.usable && this.credentials.userAgent === exported.userAgent
      && cookieFingerprint(this.credentials.browserCookies) === cookieFingerprint(exported.cookies)) {
      // Reuse HTTP cookie updates until the actual browser cookie source changes.
      snapshot = { ...this.credentials, account: identity.account, browserVerifiedAt: now }
    }
    this.state.http = { state: 'pending' }
    if (!await this.save(snapshot, revision)) return
    this.state.phase = 'verifying-http'
    this.state.notice = undefined
    try {
      const httpSignal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(15_000)])
      const result = await verifyHttp(snapshot, this.transport, httpSignal)
      this.current(revision)
      if (result.identity.kind === 'expired') { await this.invalidate('expired', revision); return }
      if (result.identity.kind === 'verified' && result.identity.account.uid !== snapshot.account.uid) {
        await this.invalidate('account-mismatch', revision)
        return
      }
      if (result.changed) {
        const updated = { ...snapshot, cookies: result.cookies, generation: randomUUID(), exportedAt: new Date().toISOString() }
        if (!await this.save(updated, revision)) return
        // Response verified the previous generation; the updated jar needs a new check.
        this.state.http = { state: 'pending', reason: 'credentials-updated' }
        this.deferHttp()
      } else if (result.identity.kind === 'verified') {
        this.httpBackoff = 10_000
        this.state.http = { state: 'verified', uid: snapshot.account.uid, generation: snapshot.generation, verifiedAt: new Date().toISOString() }
        this.stopObservation()
      } else {
        this.state.http = { state: 'pending', reason: result.identity.reason }
        this.deferHttp()
      }
    } catch (error) {
      this.current(revision)
      const reason = error instanceof LoginFailure ? error.code
        : error instanceof Error && /Timeout|Abort/.test(error.name) ? 'timeout' : 'network'
      this.state.http = { state: 'pending', reason }
      this.deferHttp()
    }
  }

  private deferHttp(): void {
    this.httpBackoff = Math.min(this.httpBackoff * 2, 60_000)
    this.nextCheckAt = Date.now() + this.httpBackoff
  }

  private startObservation(): void {
    if (this.state.observation === 'observing') return
    this.observeUntil = Date.now() + 10 * 60_000
    this.state.observation = 'observing'
    this.scheduleObservation()
  }

  private scheduleObservation(): void {
    if (this.timer || this.disposed || !this.session || this.state.observation !== 'observing') return
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (Date.now() >= this.observeUntil) {
        this.state.observation = 'paused'
        this.state.notice = 'observation-paused'
        return
      }
      if (Date.now() < this.nextCheckAt) { this.scheduleObservation(); return }
      void this.check().catch(() => undefined).finally(() => this.scheduleObservation())
    }, 3_000)
    this.timer.unref?.()
  }

  private stopObservation(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    this.state.observation = 'idle'
  }

  private cancelWork(): void {
    this.revision++
    this.controller.abort()
    this.stopObservation()
    this.checking = undefined
    this.nextCheckAt = 0
  }

  close(): Promise<DouyinStatus> {
    // Detach before aborting: an intentional context close must not cancel the
    // queued close/reopen operation through its own onClose notification.
    const session = this.session
    this.session = undefined
    this.cancelWork()
    return this.enqueue(async () => {
      this.state.phase = 'closing'
      this.state.window = 'closing'
      try { if (session) await session.close() }
      catch { this.session = session; this.state.window = 'open'; throw new LoginFailure('close-failed') }
      this.state.window = 'closed'
      this.state.notice = 'window-closed'
    }, true)
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal
    this.disposed = true
    const ownedSession = this.session
    this.session = undefined
    this.cancelWork()
    this.disposal = (async () => {
      await this.ready
      await this.tail
      const session = ownedSession ?? this.session
      this.session = undefined
      if (session) await session.close()
      this.state.window = 'closed'
      if (owners.get(this.root) === this) owners.delete(this.root)
    })()
    return this.disposal
  }
}
