import type { HostContext } from "../host-types.js";
import type { OperationError, SkillRoot } from "../model.js";
import { projectRoots, resolveWorkspaceTarget } from "./workspaces.js";
import type { RequestBody } from "./http-policy.js";

export interface RequestScopeOptions {
  ctx: HostContext;
  rootByKey: Record<string, SkillRoot>;
  activeSessionCwds: (ctx: HostContext, sessionId: string | string[] | undefined) => string[];
  registeredWorkspacePaths: (ctx: HostContext) => string[] | undefined;
}

export function createRequestScope({ ctx, rootByKey, activeSessionCwds, registeredWorkspacePaths }: RequestScopeOptions, sessionId: string | string[] | undefined) {
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
  return { projectOptions, workspaceTarget, scopedOptions, requestRoot, withScope };
}

export type RequestScope = ReturnType<typeof createRequestScope>;
