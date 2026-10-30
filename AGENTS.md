# AGENTS.md — dsh-custom-center

Standalone DSH Web GUI plugin project. These rules apply to work under this
directory; they do not override system, developer or direct user instructions.

## Layout

- `src/index.ts` — host half (Node, Cordis). Owns routes, settings bridges,
  filesystem writes and agent tools.
- `src/client/index.ts` — browser half. Loaded through
  `window.__ModuleLoader__`; owns UI seats and reads host data.
- `src/appearance/` — appearance logic, browser UI and host library routes.
- `src/tuning/` — context/compaction logic, browser UI and host routes.
- `src/skills/` — Skills feature; retain its existing internal boundaries.
- `src/shared/` — cross-feature config, styles, environment adapters and request conventions.

## Rules

- Types come only from the official `@deepseek-ai/*` npm SDK packages. Do not
  point tsconfig paths at a DSH source checkout.
- Do not modify a DSH source checkout. Mount behavior through this bundle's
  `cordis.patch.yml` and the profile mechanism.
- The browser half stays pure: `@deepseek-ai/*` value imports only for the
  shell module table; cross-plugin collaboration goes through Cordis services
  or slots, not value imports.
- Any host route that reads or writes local assets must require a loopback
  socket and a same-origin browser marker, and must validate paths against a
  server-owned root. Never accept a file path or URL from the client.
- Keep the build self-contained. `tsdown.config.ts` emits both halves; if the
  project moves into `dsh-web`, replace it with `shared/tsdown.client.ts`
  instead of copying that preset here.
- Keep `README.md` and `README.zh.md` in sync when behavior changes.
- Do not use emoji in code, comments, documentation or commit messages.

## Before committing

```sh
pnpm typecheck
pnpm test
pnpm build
```

## Agent skills

### DSH development (Codex)

Project skills live in `.agents/skills/`, adapted from `../dsh-skills-export`.
The copies include their references and templates and work without that sibling
directory. Read the relevant `SKILL.md` when the task matches:

- Plugin implementation or review: `.agents/skills/cordis-plugin-development/SKILL.md`.
- Loader patches and plugin configuration: `.agents/skills/cordis-composition-reference/SKILL.md`.
- Agent preset declarations: `.agents/skills/editing-cordis-compositions/SKILL.md`.
- Model-facing tools, prompts and context workflows: `.agents/skills/agent-experience/SKILL.md`.

Harness runtime tools mentioned in these exports may be unavailable in Codex;
follow each skill's Codex project context and report unverified runtime behavior.

### Issue tracker

任务与规格存放在本地 `.scratch/`。操作任务前，读取 `docs/agents/issue-tracker.md`。

### Triage labels

使用五个默认分诊状态。分诊任务前，读取 `docs/agents/triage-labels.md`。

### Domain docs

采用 single-context 布局：根目录 `GLOSSARY.md` 和 `docs/adr/`。探索代码前，读取 `docs/agents/domain.md`。
