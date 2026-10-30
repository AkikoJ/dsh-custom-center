import type { HostContext } from "../host-types.js";
import type { SkillsCommands } from "./commands.js";

/** Whether a global tool with this name is already registered by another plugin. */
function toolExists(ctx: HostContext, toolName: string) {
  try {
    const tools = ctx.tools as unknown as { get?: (name: string) => unknown; } | undefined;
    return typeof tools?.get === "function" && tools.get(toolName) !== undefined;
  } catch {
    return false;
  }
}

export function registerCreateSkillTool(ctx: HostContext, commands: SkillsCommands) {
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
        return commands.create(args);
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

}
