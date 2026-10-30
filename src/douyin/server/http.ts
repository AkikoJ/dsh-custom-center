import { Cookie, CookieJar } from "tough-cookie";
import {
  IDENTITY_URL,
  allowedCookieDomain,
  allowedRequestUrl,
  identityResult,
} from "./platform.ts";
import {
  LoginFailure,
  type CredentialCookie,
  type CredentialSnapshot,
  type HttpTransport,
  type IdentityResult,
} from "./types.ts";

export function cookieFingerprint(cookies: CredentialCookie[]): string {
  return JSON.stringify(
    cookies
      .map((c) => [
        c.domain,
        c.path,
        c.name,
        c.partitionKey ?? "",
        c.value,
        c.expires,
        c.httpOnly,
        c.secure,
        c.sameSite,
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}

function browserCookie(cookie: Cookie): CredentialCookie {
  const expiry = cookie.expiryTime(
    cookie.creation instanceof Date ? cookie.creation : undefined,
  );
  return {
    name: cookie.key,
    value: cookie.value,
    domain: cookie.hostOnly ? cookie.domain! : `.${cookie.domain!}`,
    path: cookie.path ?? "/",
    expires:
      expiry === undefined || expiry === Infinity
        ? -1
        : Math.max(0, expiry) / 1000,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite:
      cookie.sameSite === "strict"
        ? "Strict"
        : cookie.sameSite === "none"
          ? "None"
          : "Lax",
  };
}

async function cookieJar(cookies: CredentialCookie[]): Promise<CookieJar> {
  const jar = new CookieJar(undefined, { prefixSecurity: "strict" });
  for (const c of cookies) {
    if (!allowedCookieDomain(c.domain)) continue;
    // tough-cookie has no partition-aware request context. Preserve in snapshot,
    // exclude from ordinary HTTP rather than broadening a partitioned credential.
    if (c.partitionKey !== undefined) continue;
    const hostOnly = !c.domain.startsWith(".");
    const domain = c.domain.replace(/^\./, "");
    const cookie = new Cookie({
      key: c.name,
      value: c.value,
      domain,
      hostOnly,
      path: c.path,
      expires: c.expires === -1 ? "Infinity" : new Date(c.expires * 1000),
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite.toLowerCase() as "strict" | "lax" | "none",
    });
    await jar.setCookie(cookie, `https://${domain}${c.path}`, {
      ignoreError: false,
    });
  }
  return jar;
}

async function boundedBody(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1024 * 1024) throw new LoginFailure("challenge");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof LoginFailure) throw error;
    return null;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export interface HttpVerification {
  identity: IdentityResult;
  cookies: CredentialCookie[];
  changed: boolean;
}

/** Fixed read-only platform request. No arbitrary URL or proxy API is exposed. */
export async function verifyHttp(
  snapshot: CredentialSnapshot,
  transport: HttpTransport,
  signal: AbortSignal,
): Promise<HttpVerification> {
  const jar = await cookieJar(snapshot.cookies);
  const before = cookieFingerprint(
    (await jar.serialize()).cookies
      .map((c) => Cookie.fromJSON(c))
      .filter((c): c is Cookie => !!c)
      .map(browserCookie),
  );
  let url = new URL(IDENTITY_URL);
  for (let hop = 0; hop < 5; hop++) {
    signal.throwIfAborted();
    if (!allowedRequestUrl(url)) throw new LoginFailure("redirect-rejected");
    const cookie = await jar.getCookieString(url.href);
    const response = await transport(url.href, {
      method: "GET",
      redirect: "manual",
      signal,
      headers: {
        accept: "application/json",
        "user-agent": snapshot.userAgent,
        referer: "https://www.douyin.com/",
        ...(cookie ? { cookie } : {}),
      },
    });
    for (const value of response.headers.getSetCookie()) {
      // Never flatten partitioned Set-Cookie into a global session.
      if (/(?:^|;)\s*partitioned(?:\s*;|\s*$)/i.test(value))
        throw new LoginFailure("cookie-unsupported");
      const parsed = Cookie.parse(value);
      if (parsed?.domain && !allowedCookieDomain(parsed.domain))
        throw new LoginFailure("redirect-rejected");
      if (!parsed) throw new LoginFailure("cookie-unsupported");
      // Pin Max-Age to receipt time. CookieJar preserves the original creation
      // time on replacement and updates lastAccessed on reads; neither may
      // shift a response cookie's absolute expiration across redirects/restarts.
      if (parsed.maxAge !== null) {
        const expiry = parsed.expiryTime(new Date());
        if (expiry !== undefined && expiry !== Infinity) parsed.expires = new Date(Math.max(0, expiry));
        else parsed.expires = "Infinity";
        parsed.maxAge = null;
      }
      await jar.setCookie(parsed, url.href, { ignoreError: false });
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location) throw new LoginFailure("redirect-rejected");
      url = new URL(location, url);
      continue;
    }
    const body = await boundedBody(response);
    signal.throwIfAborted();
    const identity = identityResult({ status: response.status, body });
    const serialized = await jar.serialize();
    const cookies = serialized.cookies
      .map((c) => Cookie.fromJSON(c))
      .filter((c): c is Cookie => !!c)
      .map(browserCookie);
    const changed = before !== cookieFingerprint(cookies);
    return {
      identity,
      changed,
      cookies: [
        ...cookies,
        ...snapshot.cookies.filter((c) => c.partitionKey !== undefined),
      ],
    };
  }
  throw new LoginFailure("redirect-rejected");
}
