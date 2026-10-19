# AGENTS.md — dsh-custom-center

Standalone DSH Web GUI plugin project. These rules apply to work under this
directory; they do not override system, developer or direct user instructions.

## Layout

- `src/index.ts` — host half (Node, Cordis). Owns routes, settings bridges,
  filesystem writes and agent tools.
- `src/client/index.ts` — browser half. Loaded through
  `window.__ModuleLoader__`; owns UI seats and reads host data.
- `src/core/` — pure logic shared by both halves and tests.

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
