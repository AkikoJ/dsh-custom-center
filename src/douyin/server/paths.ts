import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export interface PathEnvironment {
  DSH_DOUYIN_HOME?: string;
  DSH_HOME?: string;
}

/** Resolve without creating directories or changing process.env. */
export function resolveDouyinHome(
  env: PathEnvironment = process.env,
  userHome = homedir(),
): string {
  const explicit = env.DSH_DOUYIN_HOME?.trim();
  if (explicit) return resolve(explicit);
  return resolve(
    env.DSH_HOME?.trim() || join(userHome, ".dsh"),
    "dsh-custom-center",
    "douyin",
  );
}

const directories: Record<string, string> = {
  out: "reports",
  memory: "memory",
  browser: "browser",
  ".venv": "python/.venv",
  thumbs: "cache/thumbs",
  media: "cache/media",
  models: "cache/models",
  ".tmp": "cache/tmp",
  ".uv-cache": "cache/uv",
  shots: "cache/shots",
  stickers: "cache/stickers",
  "sticker-cache": "cache/sticker-cache",
  "dm-log": "state/dm-log",
  "day-ledger": "ledger/days",
  ledger: "ledger/days",
  "uv-cache": "cache/uv",
  "uv-tools": "cache/uv-tools",
  "uv-python": "cache/uv-python",
};
const files: Record<string, string> = {
  "config.json": "config/config.json",
  "ledger.json": "ledger/ledger.json",
  "state.json": "state/state.json",
  "dm-cursors.json": "state/dm-cursors.json",
  "dm-sent.json": "state/dm-sent.json",
  "replied-cids.jsonl": "ledger/replied-cids.jsonl",
  "replied-users.jsonl": "ledger/replied-users.jsonl",
  "duty.md": "prompts/duty.md",
  "duty.md.new": "prompts/duty.md.new",
  "persona.md": "prompts/persona.md",
  "persona.md.bak": "prompts/persona.md.bak",
  "charter.sha256": "prompts/charter.sha256",
  "mcp_server.py": "runtime/mcp_server.py",
  "mcp_server.py.new": "runtime/mcp_server.py.new",
  "mcp_server.py.bak": "runtime/mcp_server.py.bak",
  "mcp.sha256": "runtime/mcp.sha256",
  "headless-overlay.yml": "runtime/headless-overlay.yml",
  "duty.log": "logs/duty.log",
  "duty.log.1": "logs/duty.log.1",
  "install.log": "logs/install.log",
  "login-qr.png": "cache/login-qr.png",
  ".action-lock": ".action-lock",
  "replied-cids.txt": "ledger/replied-cids.txt",
  "replied-users.txt": "ledger/replied-users.txt",
  "reply-allow.txt": "state/reply-allow.txt",
  "dm-sticker-attachments.json": "state/dm-sticker-attachments.json",
  "setup-state.json": "state/setup-state.json",
  "setup.log": "logs/setup.log",
  ".need-captcha": "state/.need-captcha",
  ".login-browser": "state/.login-browser",
};

export function within(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

/** Map old app-owned names to the new layout; unknown persistent files are retained. */
export function legacyRelativePath(name: string): string {
  if (
    isAbsolute(name) ||
    name.includes("\\") ||
    name.split("/").some((part) => part === "..")
  ) {
    throw new Error(`Invalid legacy path: ${name}`);
  }
  if (files[name]) return files[name];
  const [first, ...rest] = name.split("/");
  return directories[first]
    ? [directories[first], ...rest].join("/")
    : `state/legacy/${name}`;
}

export function douyinPaths(home = resolveDouyinHome()) {
  const root = resolve(home);
  const file = (legacyName: string) =>
    join(root, legacyRelativePath(legacyName));
  return {
    root,
    file,
    config: file("config.json"),
    ledger: file("ledger.json"),
    state: file("state.json"),
    reports: file("out"),
    memory: file("memory"),
    prompts: join(root, "prompts"),
    cache: join(root, "cache"),
    browser: file("browser"),
    runtime: join(root, "runtime"),
    python: file(".venv"),
    logs: join(root, "logs"),
    childEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
      const tmp = file(".tmp");
      return {
        ...base,
        DSH_DOUYIN_HOME: root,
        DOUYIN_CACHE_HOME: join(root, "cache"),
        TEMP: tmp,
        TMP: tmp,
        TMPDIR: tmp,
        UV_CACHE_DIR: file(".uv-cache"),
        HF_HOME: file("models"),
        PYTHONUTF8: "1",
        PYTHONUNBUFFERED: "1",
      };
    },
  };
}
export type DouyinPaths = ReturnType<typeof douyinPaths>;
