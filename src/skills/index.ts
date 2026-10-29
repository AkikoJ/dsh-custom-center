import type { ProviderCandidate } from "./core.js";
import type { Agent, HostContext, ProviderControl } from "./host-types.js";
import { createSkillsHandler } from "./server/router.js";
import type { Log, ScopeOptions, Serialize } from "./types.js";
// 技能管理 host half（移植自 dsh-skills-manager，Apache-2.0）：设置面板的 HTTP 后端（webServer prefix 路由）
// - host 路由仅依赖 node: 内置与本地 core.js；ZIP 解压封装在 core
// - 路由：状态、启停、详情、创建、导入、回收站
// - 全部接口先校验 DSH Web 信任的 Host；写接口再校验请求标记与 JSON
// - 所有来源的启停只写 manager 状态，不改原始 Skill 文件
// - $DSH_HOME\skills 与活动项目 .dsh/skills 可创建、回收与恢复；Agent 来源文件保持只读

import { appendFile, rename, rm, stat } from "node:fs/promises";
import {
  createSkill,
  getProviderSkill,
  listProviderCandidates,
  logPath,
  state,
  userRoots,
  workspaceSkills
} from "./core.js";

const name = "custom-center-skills";
const inject = ["webServer", "connection", "skills", "tools", "sessions"];
const MAX_LOG_BYTES = 1 << 20;

function makeLog(): Log {
  const file = logPath();
  let queue = Promise.resolve();
  return async (event, detail) => {
    queue = queue.then(async () => {
      try {
        const current = await stat(file).catch(() => null);
        if (current && current.size >= MAX_LOG_BYTES) {
          await rm(`${file}.1`, { force: true });
          await rename(file, `${file}.1`);
        }
        await appendFile(file, `${JSON.stringify({ ts: new Date().toISOString(), event, detail })}\n`, "utf8");
      } catch {
        /* 日志失败不阻塞主流程 */
      }
    });
    await queue;
  };
}

/** 文件写入后刷新宿主技能目录，并通知 Web 端重拉 `/` 菜单缓存。 */
function notifyChatCatalog(ctx: HostContext, invalidateSkills?: () => void) {
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
function registeredWorkspacePaths(ctx: HostContext): string[] | undefined {
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
function activeSessionCwds(ctx: HostContext, sessionId: unknown) {
  if (typeof sessionId !== "string" || !sessionId.trim()) return [];
  const sessions = ctx.sessions || (typeof ctx.get === "function" ? ctx.get("sessions") : undefined);
  if (!sessions) return [];
  const session = typeof sessions.get === "function" ? sessions.get(sessionId) :
    (typeof sessions.list === "function" ? sessions.list() : []).find((item) => (item.id ?? item.header?.id) === sessionId);
  const cwd = session?.header?.cwd;
  return typeof cwd === "string" && cwd.trim() ? [cwd.trim()] : [];
}

function externalSkillProvider(control: ProviderControl, invalidators: Set<() => void>) {
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
function registerAgentSkillProviders(ctx: HostContext, invalidators: Set<() => void>) {
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

/** Whether a global tool with this name is already registered by another plugin. */
function toolExists(ctx: HostContext, toolName: string) {
  try {
    const tools = ctx.tools as unknown as { get?: (name: string) => unknown; } | undefined;
    return typeof tools?.get === "function" && tools.get(toolName) !== undefined;
  } catch {
    return false;
  }
}

function apply(ctx: HostContext) {
  const log = makeLog();
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
  const roots = userRoots();
  const rootByKey = Object.fromEntries(roots.map((r) => [r.key, r]));

  const providerInvalidators = new Set<() => void>();
  const invalidateSkills = () => {
    for (const invalidate of providerInvalidators) invalidate();
  };
  const afterWrite = () => notifyChatCatalog(ctx, invalidateSkills);
  let mutationQueue: Promise<unknown> = Promise.resolve();
  const enqueueMutation: Serialize = (task) => {
    const queued = mutationQueue.then(task, task);
    mutationQueue = queued.catch(() => undefined);
    return queued;
  };
  ctx.effect(() => ctx.skills.registerProvider((control) => externalSkillProvider(control, providerInvalidators)), "custom-center-skills global external skills provider");
  ctx.effect(() => registerAgentSkillProviders(ctx, providerInvalidators), "custom-center-skills agent-scoped external skills providers");

  // tools.register throws on a duplicate name. When @michengai/dsh-skills-manager is
  // also installed it already owns create_skill; skip ours instead of aborting
  // apply(), which would leave the HTTP route unregistered (the page then 404s).
  if (ctx.tools && typeof ctx.tools.register === "function" && !toolExists(ctx, "create_skill")) {
    ctx.effect(() => ctx.tools!.register({
      name: "create_skill",
      description: "Create a new local DSH skill in DSH_HOME/skills. Use only when the user explicitly asks to create or save a reusable skill.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Skill name; it will be normalized to kebab-case." },
          description: { type: "string", description: "A concise routing description for when to use the skill." },
          body: { type: "string", description: "Markdown instructions that form the skill body." },
        },
        required: ["name", "description", "body"],
        additionalProperties: false,
      },
      output: {
        schema: { type: "object" },
        render: (_args, value) => [{
          type: "text",
          text: value && value.ok === false ? `Skill creation failed${typeof value.code === "string" ? ` (${value.code})` : ""}.` : `Created DSH skill ${value.name} at ${value.path}`,
        }],
      },
      async execute(args) {
        return enqueueMutation(async () => {
          const result = await createSkill(args, log);
          if (!result || result.ok !== false) afterWrite();
          return result;
        });
      },
      presentCall(args) {
        return {
          card: "generic",
          title: "Create DSH skill",
          kind: "edit",
          rawInput: args && args.name ? String(args.name) : undefined,
        };
      },
    }), "custom-center-skills create_skill tool");
    if (typeof ctx.on === "function") ctx.on("tools/pre-execute", (exec, next) => {
      if (exec && exec.name === "create_skill") return Promise.resolve({ kind: "ask", reason: "Create a new skill under DSH_HOME/skills" });
      return next();
    });
  }

  // Cordis can construct a plain function apply(), so its returned disposer
  // is not collected. Own the route explicitly for restart and startup failure.
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/api/dsh-custom-center/skills",
    handler: createSkillsHandler({
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
    }),
  }), "custom-center-skills: API route");
}

export { activeSessionCwds, apply, inject, name, notifyChatCatalog, registerAgentSkillProviders };
