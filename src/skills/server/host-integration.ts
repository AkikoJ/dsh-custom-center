import type { ProviderCandidate } from "./provider.js";
import type { Agent, HostContext, ProviderControl } from "../host-types.js";
import type { ScopeOptions } from "./types.js";
import { getProviderSkill, listProviderCandidates } from "./provider.js";

/** 文件写入后刷新宿主技能目录，并通知 Web 端重拉 `/` 菜单缓存。 */
export function notifyChatCatalog(ctx: HostContext, invalidateSkills?: () => void) {
  try {
    if (typeof invalidateSkills === "function") invalidateSkills();
  } catch {
    /* 目录缓存失效失败不影响已完成的文件操作 */
  }
  try {
    if (typeof ctx.emit === "function") ctx.emit("commands/change");
  } catch {
    /* 命令目录刷新失败不影响已完成的文件操作 */
  }
  try {
    const sessions = typeof ctx.get === "function" ? ctx.get("sessions") : undefined;
    const list = sessions && typeof sessions.list === "function" ? sessions.list() : [];
    for (const session of list) {
      const id = session && (session.id ?? session.header?.id);
      const preset = session && session.header && typeof session.header.agentPreset === "string"
        ? session.header.agentPreset
        : undefined;
      if (id == null || !preset || typeof ctx.emit !== "function") continue;
      // Web `/` 技能菜单缓存在 dsh-client-ui-skill，只在 agent-preset/selected 时失效；
      // skills/change 未进入官方转发白名单，只能借用这条已转发事件。
      ctx.emit("agent-preset/selected", id, preset);
    }
  } catch {
    /* 斜杠菜单刷新失败不影响已完成的文件操作 */
  }
}

/**
 * 读取宿主登记的工作区路径。服务缺失、方法缺失或抛错都返回 undefined，
 * 由 resolveWorkspaceTarget 统一拒绝写项目，用户目录写入不受影响。
 */
export function registeredWorkspacePaths(ctx: HostContext): string[] | undefined {
  try {
    const registry = typeof ctx.get === "function" ? ctx.get("workspaceRegistry") : undefined;
    if (!registry || typeof registry.list !== "function") return undefined;
    return [...registry.list()].flatMap((item) => {
      const path = item?.path ?? item?.cwd;
      return typeof path === "string" && path.trim() ? [path.trim()] : [];
    });
  } catch {
    return undefined;
  }
}

/** 仅从客户端当前选中的已知 Session 解析工作目录；缺失或失效时不回退其他会话。 */
export function activeSessionCwds(ctx: HostContext, sessionId: unknown) {
  if (typeof sessionId !== "string" || !sessionId.trim()) return [];
  const sessions = ctx.sessions || (typeof ctx.get === "function" ? ctx.get("sessions") : undefined);
  if (!sessions) return [];
  const session = typeof sessions.get === "function" ? sessions.get(sessionId) :
    (typeof sessions.list === "function" ? sessions.list() : []).find((item) => (item.id ?? item.header?.id) === sessionId);
  const cwd = session?.header?.cwd;
  return typeof cwd === "string" && cwd.trim() ? [cwd.trim()] : [];
}

export function externalSkillProvider(control: ProviderControl, invalidators: Set<() => void>) {
  invalidators.add(control.invalidate);
  if (control.signal && typeof control.signal.addEventListener === "function") {
    control.signal.addEventListener("abort", () => {
      invalidators.delete(control.invalidate);
    }, { once: true });
  }
  return {
    name: "dsh-custom-center-skills-external",
    list: async (options?: ScopeOptions) => listProviderCandidates(options),
    get: async (candidate: ProviderCandidate, options?: ScopeOptions) => getProviderSkill(candidate, options),
  };
}

/**
 * Agent presets register their filesystem provider in a nearer, preset-scoped
 * skill layer. Register the manager policy once more in each live agent's own
 * layer so disabled shared skills cannot fall through to that native provider.
 */
export function registerAgentSkillProviders(ctx: HostContext, invalidators: Set<() => void>) {
  if (typeof ctx.on !== "function") return () => { };
  const registrations = new Map<string, () => void>();

  const install = (agent: Agent) => {
    if (!agent || registrations.has(agent.id)) return;
    const agentCtx = agent.ctx;
    const skills = agentCtx && typeof agentCtx.get === "function"
      ? agentCtx.get("skills")
      : agentCtx && agentCtx.skills;
    if (!skills || typeof skills.registerProvider !== "function") return;
    const dispose = skills.registerProvider((control) => externalSkillProvider(control, invalidators));
    registrations.set(agent.id, dispose);
  };

  const uninstall = (agent: Agent) => {
    if (!agent) return;
    const dispose = registrations.get(agent.id);
    registrations.delete(agent.id);
    if (typeof dispose === "function") dispose();
  };

  const stopCreated = ctx.on("agent/created", ({ agent }) => install(agent));
  const stopDisposed = ctx.on("agent/disposed", ({ agent }) => uninstall(agent));
  const agents = typeof ctx.get === "function" ? ctx.get("agents") : undefined;
  if (agents && typeof agents.list === "function") {
    for (const agent of agents.list()) install(agent);
  }

  return () => {
    if (typeof stopCreated === "function") stopCreated();
    if (typeof stopDisposed === "function") stopDisposed();
    for (const dispose of registrations.values()) {
      if (typeof dispose === "function") dispose();
    }
    registrations.clear();
  };
}

export function trustedHostsReader(ctx: HostContext) {
  const getTrustedHosts = () => {
    try {
      const rawCtx = ctx as unknown as Record<string, unknown>;
      // Cordis context proxy throws "cannot get property X without inject" on rawCtx.webRuntime or rawCtx.get
      // Check root properties or safe get without throwing
      const root = (rawCtx.root || rawCtx) as Record<string, unknown>;
      const candidate = root.webRuntime || root.webStartup;
      if (candidate && typeof candidate === "object" && Array.isArray((candidate as { trustedHosts?: unknown; }).trustedHosts)) {
        return (candidate as { trustedHosts: string[]; }).trustedHosts;
      }
    } catch {
      // ignore
    }
    return [];
  };
  return getTrustedHosts;
}
