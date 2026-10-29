import { pathIdentity } from "./file-operations.js";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { SkillRoot, RootInput } from "../types.js";
import { createHash } from "node:crypto";
// 项目来源集中定义，路径校验、策略身份和展示共用，避免新增目录只可见却不可加载。
// 两种作用域共用 Agent 顺序；兼容目录紧跟主目录，不扫描项目根的普通资源目录。
export const EXTERNAL_SOURCE_ORDER = [
  "ccswitch", "codex", "claude", "gemini", "opencode", "cursor", "copilot",
  "windsurf", "windsurf-user", "trae", "trae-cn", "openclaw", "clawdbot",
  "roo", "codebuddy", "workbuddy", "qoder", "qoder-cn", "lingma",
];
export function rankSources<T extends {key: string; native?: boolean; rank?: number; localeKey?: string}>(sources: T[], startRank: number) {
  const order = (root: T) => EXTERNAL_SOURCE_ORDER.indexOf(root.key);
  const external = sources.filter((root) => !root.native);
  // 先逐项校验；单元素数组不会调用 sort 比较器，也不能漏过未登记来源。
  for (const root of external) {
    if (order(root) < 0) throw new Error(`技能来源未登记到 EXTERNAL_SOURCE_ORDER: ${root.key}`);
  }
  external.sort((a, b) => order(a) - order(b));
  const ranks = new Map(external.map((root, index) => [root.key, startRank + index * 10]));
  // Non-native (other Agent) sources are view-and-sync only; DSH never loads them directly.
  return sources.map((root) => ({ ...root, rank: root.native ? root.rank! : ranks.get(root.key)!, ...(root.native ? {} : { toggleable: false }) }))
    .sort((a, b) => a.rank - b.rank);
}
export const PROJECT_SOURCES = rankSources([
  { key: "dsh", directory: ".dsh", localeKey: "projectDsh", label: "Project DSH", rank: 100, mutable: true, native: true },
  { key: "agents", directory: ".agents", localeKey: "projectAgents", label: "Project Agent", rank: 200, native: true },
  // 保留原生项目 100/200；其余项目来源按统一 Agent 顺序生成 210–320。
  { key: "copilot", directory: ".github", localeKey: "copilot", label: "Copilot" },
  { key: "codex", directory: ".codex", localeKey: "codex", label: "Codex" },
  { key: "claude", directory: ".claude", localeKey: "claude", label: "Claude Code" },
  { key: "gemini", directory: ".gemini", localeKey: "gemini", label: "Gemini" },
  { key: "opencode", directory: ".opencode", localeKey: "opencode", label: "OpenCode" },
  { key: "cursor", directory: ".cursor", localeKey: "cursor", label: "Cursor" },
  { key: "windsurf", directory: ".windsurf", localeKey: "windsurf", label: "Windsurf" },
  { key: "trae", directory: ".trae", localeKey: "trae", label: "Trae" },
  { key: "trae-cn", directory: ".trae-cn", localeKey: "traeCn", label: "Trae CN" },
  { key: "roo", directory: ".roo", localeKey: "roo", label: "Roo" },
  { key: "codebuddy", directory: ".codebuddy", localeKey: "codebuddy", label: "CodeBuddy" },
  { key: "workbuddy", directory: ".workbuddy", localeKey: "workbuddy", label: "WorkBuddy" },
  // Qoder CN CLI 的项目技能也写在 .qoder/skills，与国际版 Qoder 共用。
  { key: "qoder", directory: ".qoder", localeKey: "qoder", label: "Qoder" },
  { key: "lingma", directory: ".lingma", localeKey: "lingma", label: "Qoder CN" },
], 210);
export const PROJECT_ROOT_KEY_RE = new RegExp(
  `^project-(?:${[...PROJECT_SOURCES]
    .map((source) => source.key)
    .sort((left, right) => right.length - left.length)
    .join("|")}):[a-f0-9]{16}$`,
);
export function projectSourceDefinition(kind?: string) {
  return PROJECT_SOURCES.find((source) => `project-${source.key}` === kind);
}
export const USER_DSH_POLICY_RANK = 399;

// ── 路径解析 ────────────────────────────────────────────────────────────────

export function resolveDshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

export function resolveAgentsHome() {
  return process.env.DSH_AGENTS_HOME || join(homedir(), ".agents");
}

export function isDshRoot(root: RootInput) {
  return typeof root === "string" && resolve(root) === resolve(dshRootPath());
}

/**
 * DSH 及常见 Agent 的用户级技能目录。
 *
 * rank 与官方 filesystem provider 的用户级优先级衔接：DSH=400、Agents=500。
 * manager provider 以 450 接管公共 Agents（仍低于 DSH），其余来源依次排在其后。
 */
export function userRoots(): SkillRoot[] {
  return rankSources([
    {
      key: "dsh",
      path: join(resolveDshHome(), "skills"),
      label: "DSH",
      mutable: true,
      toggleable: true,
      native: true,
      rank: 400,
    },
    {
      key: "agents",
      path: join(resolveAgentsHome(), "skills"),
      label: "公共 Agent",
      mutable: true,
      toggleable: true,
      native: true,
      rank: 450,
    },
    {
      key: "ccswitch",
      path: join(homedir(), ".cc-switch", "skills"),
      label: "CC Switch",
      mutable: false,
      toggleable: true,
      native: false,
    },
    {
      key: "codex",
      path: join(
        process.env.DSH_CODEX_HOME || join(homedir(), ".codex"),
        "skills",
      ),
      label: "Codex",
      mutable: false,
      toggleable: true,
      native: false,
    },
    {
      key: "claude",
      path: join(
        process.env.DSH_CLAUDE_HOME || join(homedir(), ".claude"),
        "skills",
      ),
      label: "Claude Code",
      mutable: false,
      toggleable: true,
      native: false,
    },
    {
      key: "gemini",
      path: join(
        process.env.DSH_GEMINI_HOME || join(homedir(), ".gemini"),
        "skills",
      ),
      label: "Gemini",
      mutable: false,
      toggleable: true,
      native: false,
    },
    {
      key: "opencode",
      path: join(
        process.env.DSH_OPENCODE_HOME || join(homedir(), ".config", "opencode"),
        "skills",
      ),
      label: "OpenCode",
      mutable: false,
      toggleable: true,
      native: false,
    },
    {
      key: "cursor",
      path: join(
        process.env.DSH_CURSOR_HOME || join(homedir(), ".cursor"),
        "skills",
      ),
      label: "Cursor",
      mutable: false,
      toggleable: true,
      native: false,
    },
    {
      key: "copilot",
      path: join(process.env.DSH_COPILOT_HOME || join(homedir(), ".copilot"), "skills"),
      label: "Copilot",
      mutable: false,
      toggleable: true,
      native: false,
    },
    {
      key: "windsurf",
      path: join(
        process.env.DSH_WINDSURF_HOME || join(homedir(), ".codeium", "windsurf"),
        "skills",
      ),
      label: "Windsurf",
      mutable: false,
      toggleable: true,
      native: false,
    },
    {
      key: "windsurf-user",
      localeKey: "windsurfUser",
      path: join(
        process.env.DSH_WINDSURF_USER_HOME || join(homedir(), ".windsurf"),
        "skills",
      ),
      label: "Windsurf 主目录",
      mutable: false,
      toggleable: true,
      native: false,
    },
    {
      key: "trae",
      path: join(process.env.DSH_TRAE_HOME || join(homedir(), ".trae"), "skills"),
      label: "Trae",
      mutable: false,
      toggleable: true,
      native: false,
    },
    {
      key: "trae-cn",
      localeKey: "traeCn",
      path: join(
        process.env.DSH_TRAE_CN_HOME || join(homedir(), ".trae-cn"),
        "skills",
      ),
      label: "Trae 国内版",
      mutable: false,
      toggleable: true,
      native: false,
    },
    {
      key: "openclaw",
      path: join(
        process.env.DSH_OPENCLAW_HOME || join(homedir(), ".openclaw"),
        "skills",
      ),
      label: "OpenClaw",
      mutable: false,
      toggleable: true,
      native: false,
    },
    {
      key: "clawdbot",
      path: join(
        process.env.DSH_CLAWDBOT_HOME || join(homedir(), ".clawdbot"),
        "skills",
      ),
      label: "OpenClaw 旧目录",
      mutable: false,
      toggleable: true,
      native: false,
    },
    {
      key: "roo",
      path: join(process.env.DSH_ROO_HOME || join(homedir(), ".roo"), "skills"),
      label: "Roo",
      mutable: false,
      toggleable: true,
      native: false,
    },
    {
      key: "codebuddy",
      path: join(
        process.env.DSH_CODEBUDDY_HOME || join(homedir(), ".codebuddy"),
        "skills",
      ),
      label: "CodeBuddy",
      mutable: false,
      toggleable: true,
      native: false,
    },
    {
      key: "workbuddy",
      localeKey: "workbuddy",
      path: join(
        process.env.DSH_WORKBUDDY_HOME || join(homedir(), ".workbuddy"),
        "skills",
      ),
      label: "WorkBuddy",
      mutable: false,
      toggleable: true,
      native: false,
    },
    {
      key: "qoder",
      localeKey: "qoder",
      path: join(process.env.DSH_QODER_HOME || join(homedir(), ".qoder"), "skills"),
      label: "Qoder",
      mutable: false,
      toggleable: true,
      native: false,
    },
    {
      key: "qoder-cn",
      localeKey: "qoderCn",
      path: join(
        process.env.DSH_QODER_CN_HOME || join(homedir(), ".qoder-cn"),
        "skills",
      ),
      label: "Qoder CN CLI",
      mutable: false,
      toggleable: true,
      native: false,
    },
    {
      key: "lingma",
      localeKey: "lingma",
      path: join(process.env.DSH_LINGMA_HOME || join(homedir(), ".lingma"), "skills"),
      label: "Qoder CN",
      mutable: false,
      toggleable: true,
      native: false,
    },
  ], 500);
}

export function projectIdentity(path: string) {
  const canonical = pathIdentity(path);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export function managerHomePath() {
  return join(resolveDshHome(), "skills-manager");
}

export function managerStatePath() {
  return join(managerHomePath(), "state.json");
}

export function trashRootPath() {
  return join(managerHomePath(), "trash");
}

export function logPath() {
  return join(resolveDshHome(), "dsh-custom-center-skills.log");
}

export function dshRootPath() {
  return userRoots().find((root) => root.key === "dsh")!.path;
}

export function rootDefinition(root: RootInput): SkillRoot | null {
  if (root && typeof root === "object" && typeof root.key === "string")
    return root;
  if (typeof root !== "string") return null;
  const resolved = resolve(root);
  return userRoots().find((item) => resolve(item.path) === resolved) || null;
}

export function rootByKey(key: string): SkillRoot | null | undefined {
  return userRoots().find((item) => item.key === key) || null;
}
