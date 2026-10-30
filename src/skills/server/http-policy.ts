import type { IncomingMessage } from "node:http";
import type { CodedError } from "../model.js";
import type { CreateInput, UploadInput } from "../contracts.js";

const CLIENT_MARKER_HEADER = "x-dsh-custom-center-skills";

// 文件夹上传 Base64 膨胀和路径元数据沿用原 88 MiB 上限。
export const MAX_UPLOAD_BODY_BYTES = 88 << 20;

export function readBody(req: IncomingMessage, limit = 1 << 20) {
  return new Promise<RequestBody>((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks: Buffer[] = [];
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on("data", (c) => {
      if (settled) return;
      size += c.length;
      if (size > limit) {
        const error: CodedError = new Error("body too large");
        error.statusCode = 413;
        error.code = "error.proto.bodyTooLarge";
        fail(error);
        req.resume();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (settled) return;
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        const body: RequestBody = raw ? JSON.parse(raw) : {};
        settled = true;
        resolve(body);
      } catch (caught) {
        const e = caught as CodedError;
        const error: CodedError = new Error(`invalid JSON body: ${e.message}`);
        error.statusCode = 400;
        error.code = "error.proto.invalidJson";
        fail(error);
      }
    });
    req.on("error", fail);
  });
}

/** 将裸 `host[:port]` authority 解析为 URL；非法形态返回 undefined。 */
function parseAuthority(authority: string) {
  try {
    return new URL(`http://${authority}`);
  } catch {
    return undefined;
  }
}

/**
 * 返回 authority 的规范形态。用 http/https 双重解析保留显式的 :80 / :443，
 * 避免默认端口被 WHATWG URL 自动剥离后意外扩大为任意端口授权。
 */
function canonicalAuthority(authority: string, parsed: URL) {
  const port = parsed.port !== "" ? parsed.port : new URL(`https://${authority}`).port;
  return port === "" ? parsed.hostname : `${parsed.hostname}:${port}`;
}

/** 只接受纯净、规范的 host[:port]，拒绝路径、userinfo、空白和非规范端口。 */
function isCanonicalAuthority(authority: string, parsed: URL) {
  return canonicalAuthority(authority, parsed) === authority.toLowerCase();
}

/** 与 DSH `/api` 信任栅栏一致：localhost、IPv6 loopback 或 IPv4 127/8。 */
function isLoopbackHostname(hostname: string) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** 带端口的 trustedHosts 条目精确匹配；不带端口的条目匹配同主机的任意端口。 */
function isTrustedAuthority(hostUrl: URL, trustedHosts: string[]) {
  return trustedHosts.some((entry) => {
    if (typeof entry !== "string") return false;
    const entryUrl = parseAuthority(entry);
    if (!entryUrl || !isCanonicalAuthority(entry, entryUrl)) return false;
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host;
  });
}

/**
 * 复用 DSH Web runtime 的 trustedHosts（LAN IP + `--trusted-host`），同时
 * 保留 loopback 默认值；未知 Host、跨站 Fetch 或异源 Origin 继续拒绝。
 */
export function validateRequestOrigin(req: IncomingMessage, trustedHosts: string[] = []) {
  const host = typeof req.headers.host === "string" ? req.headers.host : "";
  const hostUrl = parseAuthority(host);
  if (!hostUrl || !isCanonicalAuthority(host, hostUrl)) {
    return { statusCode: 403, code: "error.proto.forbiddenHost", error: "forbidden host" };
  }
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) {
    return { statusCode: 403, code: "error.proto.forbiddenHost", error: "forbidden host" };
  }
  if (req.headers["sec-fetch-site"] === "cross-site") {
    return { statusCode: 403, code: "error.proto.forbiddenHost", error: "forbidden host" };
  }
  const origin = req.headers.origin;
  if (typeof origin === "string") {
    try {
      if (new URL(origin).host !== hostUrl.host) {
        return { statusCode: 403, code: "error.proto.forbiddenHost", error: "forbidden host" };
      }
    } catch {
      return { statusCode: 403, code: "error.proto.forbiddenHost", error: "forbidden host" };
    }
  }
  return null;
}

/** 写接口额外要求自定义头与 JSON；自定义头迫使跨站 fetch 预检，且本接口不回 CORS。 */
export function validateMutationRequest(req: IncomingMessage, trustedHosts: string[]) {
  const hostError = validateRequestOrigin(req, trustedHosts);
  if (hostError) return hostError;
  if (req.headers[CLIENT_MARKER_HEADER] !== "1") return { statusCode: 403, code: "error.proto.forbidden", error: "forbidden mutation request" };
  const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return { statusCode: 415, code: "error.proto.contentType", error: "content-type must be application/json" };
  return null;
}

/** 请求体由各业务入口现有校验解析，此类型只声明路由转交的字段。 */
export type RequestBody = CreateInput & UploadInput & {
  id?: string;
  path?: string;
  names?: unknown;
  all?: unknown;
  overwrite?: unknown;
  root?: string;
  source?: string;
  conflict?: string;
  dryRun?: boolean;
  workspace?: unknown;
  enabled?: boolean;
  category?: string;
  targetName?: string;
  position?: "before" | "after";
};
