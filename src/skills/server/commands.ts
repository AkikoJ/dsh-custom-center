import type { workspaceSkills } from "./queries.js";
import type { SkillRoot } from "../model.js";
import type { CreateInput } from "../contracts.js";
import type { Log, Serialize } from "./types.js";
import { assignSkillCategory, createCategory, deleteCategory, moveSkillInCategory, renameCategory, setCategoryEnabled } from "./categories.js";
import { openSkillFolder, skillDetail } from "./entry-access.js";
import { setSidebarEntry } from "./policy-store.js";
import { setSkillEnabled, setSourceEnabled } from "./policy.js";
import { createSkill } from "./skill-create.js";
import { importSkill } from "./skill-import.js";
import { syncSkills } from "./skill-sync.js";
import { deleteSkill, permanentlyDeleteTrash, restoreTrash } from "./trash.js";
import { importUploadedSkill } from "./upload-import.js";
import type { RequestBody } from "./http-policy.js";
import type { RequestScope } from "./request-scope.js";

export interface CommandOptions {
  log: Log;
  afterWrite: () => void;
  workspaceSkills: typeof workspaceSkills;
  registeredWorkspaces: () => string[] | undefined;
}

export interface SkillOperation { task: () => unknown; afterSuccess?: () => void; }

/** One queue covers HTTP requests and the create_skill tool. */
export function createSkillsCommands({ log, afterWrite, workspaceSkills, registeredWorkspaces }: CommandOptions) {
  let mutationQueue: Promise<unknown> = Promise.resolve();
  const enqueueMutation: Serialize = (task) => {
    const queued = mutationQueue.then(task, task);
    mutationQueue = queued.catch(() => undefined);
    return queued;
  };
  return {
    enqueueMutation,
    create(input: CreateInput) {
      return enqueueMutation(async () => {
        const result = await createSkill(input, log);
        if (!result || result.ok !== false) afterWrite();
        return result;
      });
    },
    operation(action: string, body: RequestBody, scope: RequestScope): SkillOperation | undefined {
      const { projectOptions, workspaceTarget, scopedOptions, requestRoot, withScope } = scope;
      switch (action) {
        case "sidebar-entry":
          return {
            task: async () => {
              if (!body || typeof body.enabled !== "boolean") {
                throw Object.assign(new Error("enabled 必须是布尔值"), { statusCode: 400, code: "error.proto.invalidParams" });
              }
              const enabled = await setSidebarEntry(body.enabled);
              return { enabled };
            }
          };
        case "workspace-skills":
          return { task: () => workspaceSkills(body.workspace, registeredWorkspaces()) };
        case "enable":
          return { task: () => withScope(body, async (scope) => setSkillEnabled(await requestRoot(String(body.root || "dsh"), scope?.projectCwds), String(body.name || ""), true, log)), afterSuccess: afterWrite };
        case "disable":
          return { task: () => withScope(body, async (scope) => setSkillEnabled(await requestRoot(String(body.root || "dsh"), scope?.projectCwds), String(body.name || ""), false, log)), afterSuccess: afterWrite };
        case "source-enable":
          return { task: () => withScope(body, (scope) => setSourceEnabled(String(body.root || ""), true, log, scopedOptions(scope))), afterSuccess: afterWrite };
        case "source-disable":
          return { task: () => withScope(body, (scope) => setSourceEnabled(String(body.root || ""), false, log, scopedOptions(scope))), afterSuccess: afterWrite };
        case "category-create":
          return { task: () => withScope(body, (scope) => createCategory(String(body.root || ""), String(body.name || ""), log, scopedOptions(scope))) };
        case "category-rename":
          return { task: () => withScope(body, (scope) => renameCategory(String(body.root || ""), String(body.id || ""), String(body.name || ""), log, scopedOptions(scope))) };
        case "category-delete":
          return { task: () => withScope(body, (scope) => deleteCategory(String(body.root || ""), String(body.id || ""), log, scopedOptions(scope))) };
        case "category-assign":
          return { task: () => withScope(body, (scope) => assignSkillCategory(String(body.root || ""), String(body.name || ""), String(body.category || ""), log, scopedOptions(scope))) };
        case "category-move":
          return { task: () => withScope(body, (scope) => moveSkillInCategory(String(body.root || ""), String(body.name || ""), String(body.category || ""), body.targetName ? String(body.targetName) : undefined, body.position === undefined ? "before" : String(body.position), log, scopedOptions(scope))) };
        case "category-enable":
          return { task: () => withScope(body, (scope) => setCategoryEnabled(String(body.root || ""), String(body.category || ""), true, log, scopedOptions(scope))), afterSuccess: afterWrite };
        case "category-disable":
          return { task: () => withScope(body, (scope) => setCategoryEnabled(String(body.root || ""), String(body.category || ""), false, log, scopedOptions(scope))), afterSuccess: afterWrite };
        case "delete":
          return {
            task: () => withScope(body, async (scope) => {
              const target = await workspaceTarget(body);
              if (target && "ok" in target && target.ok === false) return target;
              const root = target ? (target as { root: SkillRoot; }).root : await requestRoot(String(body.root || "dsh"), scope?.projectCwds);
              return deleteSkill(root, String(body.name || ""), log);
            }), afterSuccess: afterWrite
          };
        case "trash-restore":
          return { task: () => withScope(body, (scope) => restoreTrash(String(body.id || ""), log, { ...(scope ?? {}), registeredWorkspaces: registeredWorkspaces() })), afterSuccess: afterWrite };
        case "trash-delete":
          return { task: () => permanentlyDeleteTrash(String(body.id || ""), log) };
        case "detail":
          return { task: () => withScope(body, (scope) => skillDetail(String(body.root || "dsh"), String(body.name || ""), scope ? { ...scope, workspaceBound: true } : projectOptions())) };
        case "create":
          return {
            task: async () => {
              const target = await workspaceTarget(body);
              if (target && "ok" in target && target.ok === false) return target;
              return createSkill(
                { name: body.name, description: body.description, body: body.body },
                log,
                { root: target ? (target as { root: SkillRoot; }).root : await requestRoot(String(body.root || "dsh")) },
              );
            }, afterSuccess: afterWrite
          };
        case "import":
          return {
            task: async () => {
              const target = await workspaceTarget(body);
              if (target && "ok" in target && target.ok === false) return target;
              return importSkill(String(body.source || ""), log, {
                conflict: body.conflict === "overwrite" ? "overwrite" : "skip",
                dryRun: body.dryRun === true,
                ...(target ? { root: (target as { root: SkillRoot; }).root } : body.root === "agents" ? { root: await requestRoot("agents") } : {}),
              });
            }, afterSuccess: body.dryRun === true ? undefined : afterWrite
          };
        case "sync":
          // Copies another Agent's skills into DSH. The source key and skill names are checked
          // against server-side scans; the client never supplies a path.
          return {
            task: () => withScope(body, (scope) => syncSkills(
              { root: body.root, names: body.names, all: body.all, overwrite: body.overwrite },
              log,
              { projectCwds: scopedOptions(scope).projectCwds, trash: (root, name) => deleteSkill(root, name, log) },
            )), afterSuccess: afterWrite
          };
        case "upload":
          return {
            task: async () => {
              const target = await workspaceTarget(body);
              if (target && "ok" in target && target.ok === false) return target;
              return importUploadedSkill({ name: body.name, entries: body.entries, zip: body.zip }, log, {
                conflict: body.conflict === "overwrite" ? "overwrite" : "skip",
                ...(target ? { root: (target as { root: SkillRoot; }).root } : body.root === "agents" ? { root: await requestRoot("agents") } : {}),
              });
            }, afterSuccess: afterWrite
          };
        case "open-folder":
          return {
            task: () => withScope(body, async (scope) => {
              const root = await requestRoot(String(body.root || "dsh"), scope?.projectCwds);
              return openSkillFolder(root, String(body.name || ""), scopedOptions(scope));
            })
          };
        default:
          return undefined;
      }
    },
  };
}

export type SkillsCommands = ReturnType<typeof createSkillsCommands>;
