import type { IdentityResult, PlatformResponse } from "./types.ts";

export const LOGIN_URL = "https://www.douyin.com/";
// Candidate used by the reference implementations; live acceptance remains required.
export const IDENTITY_URL =
  "https://www.douyin.com/aweme/v1/web/user/profile/self/?device_platform=webapp&aid=6383";

export function allowedCookieDomain(domain: string): boolean {
  const host = domain.startsWith(".") ? domain.slice(1) : domain;
  return (
    host === "douyin.com" ||
    /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.douyin\.com$/i.test(host)
  );
}

export function allowedRequestUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    (url.hostname === "www.douyin.com" || url.hostname === "douyin.com")
  );
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** A successful transport or a nonempty cookie is never proof of identity. */
export function identityResult(response: PlatformResponse): IdentityResult {
  if (response.status === 429)
    return { kind: "pending", reason: "rate-limited" };
  if (response.status === 401) return { kind: "expired", reason: "expired" };
  if (response.status === 403) return { kind: "pending", reason: "challenge" };
  if (response.status !== 200) return { kind: "pending", reason: "network" };
  const body = record(response.body);
  if (body?.status_code === 8) return { kind: "expired", reason: "expired" };
  const user = record(body?.user);
  if (
    body?.status_code !== 0 ||
    typeof user?.uid !== "string" ||
    !/^\d{1,30}$/.test(user.uid) ||
    /^0+$/.test(user.uid)
  ) {
    return { kind: "pending", reason: "identity-unconfirmed" };
  }
  const nickname =
    typeof user.nickname === "string" ? user.nickname.slice(0, 100) : undefined;
  return {
    kind: "verified",
    account: { uid: user.uid, ...(nickname ? { nickname } : {}) },
  };
}
