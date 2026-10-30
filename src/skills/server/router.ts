import type { IncomingMessage, ServerResponse } from "node:http";
import type { state, workspaceSkills } from "./queries.js";
import type { HostContext } from "../host-types.js";
import type { CodedError, SkillRoot } from "../model.js";
import { browseDirectories } from "./entry-access.js";
import { getSidebarEntry } from "./policy-store.js";
import { listWorkspaces } from "./workspaces.js";
import { MAX_UPLOAD_BODY_BYTES, readBody, validateRequestOrigin, validateMutationRequest } from "./http-policy.js";
import { createRequestScope } from "./request-scope.js";
import type { SkillsCommands } from "./commands.js";

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
  rootByKey: Record<string, SkillRoot>;
  getTrustedHosts: () => string[];
  commands: SkillsCommands;
  activeSessionCwds: (ctx: HostContext, sessionId: string | string[] | undefined) => string[];
  registeredWorkspacePaths: (ctx: HostContext) => string[] | undefined;
}

export function createSkillsHandler({
  state,
  workspaceSkills,
  ctx,
  rootByKey,
  getTrustedHosts,
  commands,
  activeSessionCwds,
  registeredWorkspacePaths,
}: RouterOptions) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const u = new URL(req.url!, "http://localhost");
    const path = u.pathname.replace(/\/+$/, "");
    const sessionId = req.headers["x-dsh-skills-session"];
    const requestScope = createRequestScope({ctx, rootByKey, activeSessionCwds, registeredWorkspacePaths}, sessionId);
    const { projectOptions } = requestScope;
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
      return commands.enqueueMutation(() => {
        const operation = commands.operation(path.startsWith("/api/dsh-custom-center/skills/") ? path.slice("/api/dsh-custom-center/skills/".length) : "", body, requestScope);
        if (operation) return run(res, operation.task, operation.afterSuccess);
        json(res, 404, { ok: false, code: "error.proto.unknownAction", error: `unknown action: ${path}` });
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
