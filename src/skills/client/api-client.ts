import type { ApiRoutes } from "../client-types.js";
import type { CodedError } from "../types.js";

/** Resolve plugin API paths against the page base, preserving reverse-proxy prefixes. */
function pageBaseHref(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const raw = document.baseURI;
  if (typeof raw !== "string" || raw === "") return undefined;
  try {
    const url = new URL(raw);
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.href;
  } catch {
    return undefined;
  }
}

export function resolveApiUrl(path: string): string {
  if (typeof path !== "string" || path.charAt(0) !== "/" || path.charAt(1) === "/") return path;
  const base = pageBaseHref();
  if (base === undefined) return path;
  try {
    return new URL(path.slice(1), base).href;
  } catch {
    return path;
  }
}

var MUTATION_HEADERS = {
  "content-type": "application/json",
  "x-dsh-custom-center-skills": "1",
};

function parseApiResponse<T = unknown>(response: Response): Promise<T> {
  return response
    .json()
    .catch(function () {
      var error: CodedError = new Error("non-json response");
      error.code = "error.proto.nonJson";
      error.params = { status: response.status };
      throw error;
    })
    .then(function (value: unknown) {
      const payload = value as { ok?: boolean; data: T; };
      if (!response.ok || payload.ok === false) throw payload;
      return payload.data;
    });
}

function callApi<K extends keyof ApiRoutes>(
  path: K,
  options?: RequestInit,
): Promise<ApiRoutes[K]> {
  return fetch(
    resolveApiUrl("/api/dsh-custom-center/skills" + path),
    options,
  ).then(parseApiResponse<ApiRoutes[K]>);
}
export { callApi, MUTATION_HEADERS, parseApiResponse };

export function createSessionApi(sessionId?: string) {
  return function sessionApi<K extends keyof ApiRoutes>(
    path: K,
    options?: RequestInit,
  ): Promise<ApiRoutes[K]> {
    var headers: Record<string, string> = Object.fromEntries(
      new Headers(options?.headers).entries(),
    );
    if (sessionId) headers["x-dsh-skills-session"] = sessionId;
    return callApi(path, Object.assign({}, options, { headers: headers }));
  };
}
