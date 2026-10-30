import type { HostContext } from "./host-types.js";
import { createSkillsHandler } from "./server/router.js";
import { userRoots } from "./server/source-roots.js";
import { state, workspaceSkills } from "./server/queries.js";
import { makeLog } from "./server/audit-log.js";
import { activeSessionCwds, registeredWorkspacePaths, externalSkillProvider, registerAgentSkillProviders, notifyChatCatalog, trustedHostsReader } from "./server/host-integration.js";
import { registerCreateSkillTool } from "./server/create-skill-tool.js";
import { createSkillsCommands } from "./server/commands.js";

const name = "custom-center-skills";

const inject = ["webServer", "connection", "skills", "tools", "sessions"];

function apply(ctx: HostContext) {
  const log = makeLog();
  const getTrustedHosts = trustedHostsReader(ctx);
  const roots = userRoots();
  const rootByKey = Object.fromEntries(roots.map((r) => [r.key, r]));

  const providerInvalidators = new Set<() => void>();
  const invalidateSkills = () => {
    for (const invalidate of providerInvalidators) invalidate();
  };
  const afterWrite = () => notifyChatCatalog(ctx, invalidateSkills);
  const commands = createSkillsCommands({ log, afterWrite, workspaceSkills, registeredWorkspaces: () => registeredWorkspacePaths(ctx) });
  ctx.effect(() => ctx.skills.registerProvider((control) => externalSkillProvider(control, providerInvalidators)), "custom-center-skills global external skills provider");
  ctx.effect(() => registerAgentSkillProviders(ctx, providerInvalidators), "custom-center-skills agent-scoped external skills providers");

  registerCreateSkillTool(ctx, commands);

  // Cordis can construct a plain function apply(), so its returned disposer
  // is not collected. Own the route explicitly for restart and startup failure.
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/api/dsh-custom-center/skills",
    handler: createSkillsHandler({
      state,
      workspaceSkills,
      ctx,
      rootByKey,
      getTrustedHosts,
      commands,
      activeSessionCwds,
      registeredWorkspacePaths,
    }),
  }), "custom-center-skills: API route");
}

export { apply, inject, name };
