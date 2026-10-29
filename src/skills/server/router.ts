import type { IncomingMessage, ServerResponse } from "node:http";
import type { state, workspaceSkills } from "../core.js";
import type { HostContext } from "../host-types.js";
import type { CodedError, CreateInput, Log, OperationError, Serialize, SkillRoot, UploadInput } from "../types.js";
import {
  assignSkillCategory,
  createCategory,
  deleteCategory,
  moveSkillInCategory,
  renameCategory,
  setCategoryEnabled,
} from "./categories.js";
import { browseDirectories, openSkillFolder, skillDetail } from "./entry-access.js";
import { getSidebarEntry, setSidebarEntry } from "./policy-store.js";
import { setSkillEnabled, setSourceEnabled } from "./policy.js";
import { createSkill, importSkill } from "./skill-import.js";
import { syncSkills } from "./skill-sync.js";
import { deleteSkill, permanentlyDeleteTrash, restoreTrash } from "./trash.js";
import { importUploadedSkill } from "./upload-import.js";
import { listWorkspaces, projectRoots, resolveWorkspaceTarget } from "./workspaces.js";

const CLIENT_MARKER_HEADER = "x-dsh-custom-center-skills";
// 文件夹上传 Base64 膨胀和路径元数据沿用原 88 MiB 上限。
const MAX_UPLOAD_BODY_BYTES = 88 << 20;
function readBody(req: IncomingMessage, limit = 1 << 20) {
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
function validateRequestOrigin(req: IncomingMessage, trustedHosts: string[] = []) {
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
function validateMutationRequest(req: IncomingMessage, trustedHosts: string[]) {
  const hostError = validateRequestOrigin(req, trustedHosts);
  if (hostError) return hostError;
  if (req.headers[CLIENT_MARKER_HEADER] !== "1") return { statusCode: 403, code: "error.proto.forbidden", error: "forbidden mutation request" };
  const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return { statusCode: 415, code: "error.proto.contentType", error: "content-type must be application/json" };
  return null;
}

function json(res: ServerResponse, code: number, payload: unknown, headOnly = false) {
  if (!res || res.writableEnded || res.destroyed) return;
  res.once("error", () => { });
  try {
    const body = JSON.stringify(payload);
    res.writeHead(code, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(body),
    });
    // HEAD 按 RFC 语义返回与实体一致的 content-length，但不输出 body。
    res.end(headOnly ? undefined : body);
  } catch {
    /* 客户端已断开 */
  }
}

/** 成功统一包成 { ok: true, data }；核心返回 { ok:false, error } 时透传为 400。 */
function run(res: ServerResponse, task: () => unknown, afterSuccess?: () => void, headOnly = false) {
  return Promise.resolve().then(task).then((r) => {
    if (r && typeof r === "object" && "ok" in r && r.ok === false) json(res, 400, r, headOnly);
    else {
      try {
        if (afterSuccess) afterSuccess();
      } catch {
        /* 目录刷新失败不影响已完成的文件操作 */
      }
      json(res, 200, { ok: true, data: r }, headOnly);
    }
  }).catch((e) => {
    try {
      json(res, Number.isInteger(e && e.statusCode) ? e.statusCode! : 500, {
        ok: false,
        ...(e && typeof e.code === "string" ? { code: e.code } : {}),
        ...(e && e.params && typeof e.params === "object" && !Array.isArray(e.params) ? { params: e.params } : {}),
        error: String(e && e.message ? e.message : e),
      }, headOnly);
    } catch {
      /* response already closed */
    }
  });
}

export interface RouterOptions {
  state: typeof state;
  workspaceSkills: typeof workspaceSkills;
  ctx: HostContext;
  log: Log;
  rootByKey: Record<string, SkillRoot>;
  getTrustedHosts: () => string[];
  enqueueMutation: Serialize;
  afterWrite: () => void;
  activeSessionCwds: (ctx: HostContext, sessionId: string | string[] | undefined) => string[];
  registeredWorkspacePaths: (ctx: HostContext) => string[] | undefined;
}
export function createSkillsHandler({
  state,
  workspaceSkills,
  ctx,
  log,
  rootByKey,
  getTrustedHosts,
  enqueueMutation,
  afterWrite,
  activeSessionCwds,
  registeredWorkspacePaths,
}: RouterOptions) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const u = new URL(req.url!, "http://localhost");
    const path = u.pathname.replace(/\/+$/, "");
    const sessionId = req.headers["x-dsh-skills-session"];
    const projectOptions = () => ({ projectCwds: activeSessionCwds(ctx, sessionId) });
    /** 请求体带 workspace 时只经登记列表解析；字段存在但无效也拒绝，不静默回退到用户目录。 */
    const workspaceTarget = async (body: RequestBody) => {
      if (body.workspace === undefined) return null;
      return resolveWorkspaceTarget(body.workspace, registeredWorkspacePaths(ctx));
    };
    /** 项目页操作带 workspace：先按登记路径校验，再只在该项目的来源里解析，不依赖当前会话。 */
    const workspaceScope = async (body: RequestBody): Promise<{ projectCwds: string[]; } | OperationError | null> => {
      const target = await workspaceTarget(body);
      if (!target) return null;
      if ("ok" in target && target.ok === false) return target;
      return { projectCwds: (target as { root: SkillRoot; }).root.workspaceCwds ?? [] };
    };
    const scopedOptions = (scope: { projectCwds: string[]; } | null) => scope ?? projectOptions();
    const requestRoot = async (key: string, cwds?: string[]) => cwds ? (await projectRoots(cwds)).find((root) => root.key === key) : rootByKey[key] || (await projectRoots(projectOptions().projectCwds)).find((root) => root.key === key);
    /** 单项操作的统一入口：有 workspace 就在其作用域内解析根，无则沿用当前会话。 */
    const withScope = async <T>(body: RequestBody, action: (scope: { projectCwds: string[]; } | null) => Promise<T>) => {
      const scope = await workspaceScope(body);
      if (scope && "ok" in scope && scope.ok === false) return scope;
      return action(scope as { projectCwds: string[]; } | null);
    };
    const stateWithSources = async () => state(projectOptions());
    try {
      const hostError = validateRequestOrigin(req, getTrustedHosts());
      if (hostError) {
        json(res, hostError.statusCode, { ok: false, code: hostError.code, error: hostError.error });
        return;
      }
      // dsh-custom-center rule: every host route also passes Connection's browser authentication.
      const rejection = ctx.connection?.requestRejection(req);
      if (rejection !== undefined) {
        json(res, rejection, {
          ok: false,
          code: rejection === 401 ? "error.proto.unauthorized" : "error.proto.forbiddenHost",
          error: rejection === 401 ? "unauthorized" : "forbidden",
        });
        return;
      }
      if (req.method === "GET" && path === "/api/dsh-custom-center/skills/state") {
        return run(res, stateWithSources);
      }
      if (req.method === "GET" && path === "/api/dsh-custom-center/skills/sidebar-entry") {
        return run(res, async () => ({ enabled: await getSidebarEntry() }));
      }
      if ((req.method === "GET" || req.method === "HEAD") && path === "/api/dsh-custom-center/skills/workspaces") {
        return run(res, async () => ({ items: await listWorkspaces(registeredWorkspacePaths(ctx) ?? []) }), undefined, req.method === "HEAD");
      }
      if (req.method === "HEAD") {
        // HEAD 复用 GET/405 的载荷计算 content-length，保持与实体一致的响应头语义。
        if (path === "/api/dsh-custom-center/skills/state") return run(res, stateWithSources, undefined, true);
        if (path === "/api/dsh-custom-center/skills/sidebar-entry") return run(res, async () => ({ enabled: await getSidebarEntry() }), undefined, true);
        json(res, 405, { ok: false, code: "error.proto.method", error: `method not allowed: ${req.method}` }, true);
        return;
      }
      if (req.method !== "POST") {
        json(res, 405, { ok: false, code: "error.proto.method", error: `method not allowed: ${req.method}` });
        return;
      }
      const requestError = validateMutationRequest(req, getTrustedHosts());
      if (requestError) {
        json(res, requestError.statusCode, { ok: false, code: requestError.code, error: requestError.error });
        return;
      }
      const body = await readBody(req, path === "/api/dsh-custom-center/skills/upload" ? MAX_UPLOAD_BODY_BYTES : undefined);
      if (path === "/api/dsh-custom-center/skills/browse") {
        return run(res, () => browseDirectories(String(body.path ?? "")));
      }
      return enqueueMutation(() => {
        switch (path) {
          case "/api/dsh-custom-center/skills/sidebar-entry":
            return run(res, async () => {
              if (!body || typeof body.enabled !== "boolean") {
                throw Object.assign(new Error("enabled 必须是布尔值"), { statusCode: 400, code: "error.proto.invalidParams" });
              }
              const enabled = await setSidebarEntry(body.enabled);
              return { enabled };
            });
          case "/api/dsh-custom-center/skills/workspace-skills":
            return run(res, () => workspaceSkills(body.workspace, registeredWorkspacePaths(ctx)));
          case "/api/dsh-custom-center/skills/enable":
            return run(res, () => withScope(body, async (scope) => setSkillEnabled(await requestRoot(String(body.root || "dsh"), scope?.projectCwds), String(body.name || ""), true, log)), afterWrite);
          case "/api/dsh-custom-center/skills/disable":
            return run(res, () => withScope(body, async (scope) => setSkillEnabled(await requestRoot(String(body.root || "dsh"), scope?.projectCwds), String(body.name || ""), false, log)), afterWrite);
          case "/api/dsh-custom-center/skills/source-enable":
            return run(res, () => withScope(body, (scope) => setSourceEnabled(String(body.root || ""), true, log, scopedOptions(scope))), afterWrite);
          case "/api/dsh-custom-center/skills/source-disable":
            return run(res, () => withScope(body, (scope) => setSourceEnabled(String(body.root || ""), false, log, scopedOptions(scope))), afterWrite);
          case "/api/dsh-custom-center/skills/category-create":
            return run(res, () => withScope(body, (scope) => createCategory(String(body.root || ""), String(body.name || ""), log, scopedOptions(scope))));
          case "/api/dsh-custom-center/skills/category-rename":
            return run(res, () => withScope(body, (scope) => renameCategory(String(body.root || ""), String(body.id || ""), String(body.name || ""), log, scopedOptions(scope))));
          case "/api/dsh-custom-center/skills/category-delete":
            return run(res, () => withScope(body, (scope) => deleteCategory(String(body.root || ""), String(body.id || ""), log, scopedOptions(scope))));
          case "/api/dsh-custom-center/skills/category-assign":
            return run(res, () => withScope(body, (scope) => assignSkillCategory(String(body.root || ""), String(body.name || ""), String(body.category || ""), log, scopedOptions(scope))));
          case "/api/dsh-custom-center/skills/category-move":
            return run(res, () => withScope(body, (scope) => moveSkillInCategory(String(body.root || ""), String(body.name || ""), String(body.category || ""), body.targetName ? String(body.targetName) : undefined, body.position === undefined ? "before" : String(body.position), log, scopedOptions(scope))));
          case "/api/dsh-custom-center/skills/category-enable":
            return run(res, () => withScope(body, (scope) => setCategoryEnabled(String(body.root || ""), String(body.category || ""), true, log, scopedOptions(scope))), afterWrite);
          case "/api/dsh-custom-center/skills/category-disable":
            return run(res, () => withScope(body, (scope) => setCategoryEnabled(String(body.root || ""), String(body.category || ""), false, log, scopedOptions(scope))), afterWrite);
          case "/api/dsh-custom-center/skills/delete":
            return run(res, () => withScope(body, async (scope) => {
              const target = await workspaceTarget(body);
              if (target && "ok" in target && target.ok === false) return target;
              const root = target ? (target as { root: SkillRoot; }).root : await requestRoot(String(body.root || "dsh"), scope?.projectCwds);
              return deleteSkill(root, String(body.name || ""), log);
            }), afterWrite);
          case "/api/dsh-custom-center/skills/trash-restore":
            return run(res, () => withScope(body, (scope) => restoreTrash(String(body.id || ""), log, { ...(scope ?? {}), registeredWorkspaces: registeredWorkspacePaths(ctx) })), afterWrite);
          case "/api/dsh-custom-center/skills/trash-delete":
            return run(res, () => permanentlyDeleteTrash(String(body.id || ""), log));
          case "/api/dsh-custom-center/skills/detail":
            return run(res, () => withScope(body, (scope) => skillDetail(String(body.root || "dsh"), String(body.name || ""), scope ? { ...scope, workspaceBound: true } : projectOptions())));
          case "/api/dsh-custom-center/skills/create":
            return run(res, async () => {
              const target = await workspaceTarget(body);
              if (target && "ok" in target && target.ok === false) return target;
              return createSkill(
                { name: body.name, description: body.description, body: body.body },
                log,
                { root: target ? (target as { root: SkillRoot; }).root : await requestRoot(String(body.root || "dsh")) },
              );
            }, afterWrite);
          case "/api/dsh-custom-center/skills/import":
            return run(res, async () => {
              const target = await workspaceTarget(body);
              if (target && "ok" in target && target.ok === false) return target;
              return importSkill(String(body.source || ""), log, {
                conflict: body.conflict === "overwrite" ? "overwrite" : "skip",
                dryRun: body.dryRun === true,
                ...(target ? { root: (target as { root: SkillRoot; }).root } : body.root === "agents" ? { root: await requestRoot("agents") } : {}),
              });
            }, body.dryRun === true ? undefined : afterWrite);
          case "/api/dsh-custom-center/skills/sync":
            // Copies another Agent's skills into DSH. The source key and skill names are checked
            // against server-side scans; the client never supplies a path.
            return run(res, () => withScope(body, (scope) => syncSkills(
              { root: body.root, names: body.names, all: body.all, overwrite: body.overwrite },
              log,
              { projectCwds: scopedOptions(scope).projectCwds, trash: (root, name) => deleteSkill(root, name, log) },
            )), afterWrite);
          case "/api/dsh-custom-center/skills/upload":
            return run(res, async () => {
              const target = await workspaceTarget(body);
              if (target && "ok" in target && target.ok === false) return target;
              return importUploadedSkill({ name: body.name, entries: body.entries, zip: body.zip }, log, {
                conflict: body.conflict === "overwrite" ? "overwrite" : "skip",
                ...(target ? { root: (target as { root: SkillRoot; }).root } : body.root === "agents" ? { root: await requestRoot("agents") } : {}),
              });
            }, afterWrite);
          case "/api/dsh-custom-center/skills/open-folder":
            return run(res, () => withScope(body, async (scope) => {
              const root = await requestRoot(String(body.root || "dsh"), scope?.projectCwds);
              return openSkillFolder(root, String(body.name || ""), scopedOptions(scope));
            }));
          default:
            json(res, 404, { ok: false, code: "error.proto.unknownAction", error: `unknown action: ${path}` });
        }
      });
    } catch (caught) {
      const e = caught as CodedError;
      json(res, Number.isInteger(e && e.statusCode) ? e.statusCode! : 500, {
        ok: false,
        ...(e && typeof e.code === "string" ? { code: e.code } : {}),
        ...(e && e.params && typeof e.params === "object" && !Array.isArray(e.params) ? { params: e.params } : {}),
        error: String(e && e.message ? e.message : e),
      });
    }
  };
}
/** 请求体由各业务入口现有校验解析，此类型只声明路由转交的字段。 */
type RequestBody = CreateInput & UploadInput & {
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
