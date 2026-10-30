export interface Account { uid: string; nickname?: string }

/** Browser cookie attributes stay intact in storage, including partition data. */
export interface CredentialCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'Strict' | 'Lax' | 'None'
  partitionKey?: string
}

export interface CredentialSnapshot {
  schema: 1
  generation: string
  account: Account
  exportedAt: string
  browserVerifiedAt: string
  userAgent: string
  cookies: CredentialCookie[]
  /** Browser-owned source for window restoration; HTTP updates never overwrite it. */
  browserCookies: CredentialCookie[]
  usable: boolean
}

export interface PlatformResponse { status: number; body: unknown }
export type IdentityResult = { kind: 'verified'; account: Account } | { kind: 'pending' | 'expired'; reason: string }

/** Only the browser/platform boundaries are replaced in route tests. */
export interface BrowserSession {
  identity(signal: AbortSignal): Promise<PlatformResponse>
  credentials(): Promise<{ cookies: CredentialCookie[]; userAgent: string }>
  focus(): Promise<void>
  close(): Promise<void>
  onClose(callback: () => void): void
}
export interface LoginBrowser { open(profile: string, signal: AbortSignal, restore?: CredentialCookie[]): Promise<BrowserSession> }
export type HttpTransport = (url: string, init: RequestInit) => Promise<Response>

/** Never use native exception messages in public state or logs. */
export class LoginFailure extends Error {
  constructor(readonly code: string) { super(code) }
}
