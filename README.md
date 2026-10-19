# dsh-custom-center

[中文](README.zh.md)

A standalone **DSH Web GUI plugin** scaffold for a customization center: one
place to manage personalization assets such as skins, themes, backgrounds,
fonts and presets.

This repository is intentionally small. It is a working plugin skeleton, not
the finished center: the host half already exposes a schema-backed `enabled`
switch, the browser half loads but renders nothing yet, and both halves build
without depending on the `dsh-web` checkout.

## Status

| Part | State |
| --- | --- |
| Bundle manifest | `dsh.bundle.patch` points at `cordis.patch.yml` |
| Loader row | `ui-custom-center` -> package `dsh-custom-center` |
| Host half | `src/index.ts`: `Config.enabled` generated settings page |
| Browser half | `src/client/index.ts`: loader-compatible no-op |
| Shared logic | `src/core/config.ts` with unit tests |
| Build | `tsc` declarations + `tsdown` host/client bundles |
| UI / routes / assets | Not implemented yet |

## Layout

```text
dsh-custom-center/
  cordis.patch.yml       # profile bundle row (id ui-custom-center)
  src/
    index.ts             # host half (Node / Cordis)
    client/index.ts      # browser half (__ModuleLoader__ closure factory)
    core/config.ts       # shared defaults and normalization
  tests/config.spec.ts   # pure configuration tests
  tsdown.config.ts       # host ESM build + browser CJS closure factory
  tsconfig.json          # typecheck program (src + tests)
  tsconfig.build.json    # declaration-only build into lib/types
```

## Install for development

Requirements: Node.js 22+, pnpm, and a DSH host whose version satisfies
`>= 0.2.1-rc.2`.

```sh
cd /Users/mac/Documents/code/dsh/dsh-custom-center
pnpm install
pnpm build
dsh plugin --profile web add link:$(pwd)
# restart dsh web afterwards
```

After the restart the plugin row is mounted. The host auto-generates this
entry's settings form from the `enabled` schema, so the switch is already
visible even though the center has no page yet.

Verify the composed profile:

```sh
dsh --profile web --dump-config
```

Remove it again:

```sh
dsh plugin --profile web remove dsh-custom-center
```

## Commands

```sh
pnpm typecheck   # tsc -p tsconfig.json --noEmit
pnpm test        # vitest run
pnpm build       # declarations + lib/index.js + lib/client.js
pnpm watch       # rebuild bundles while developing
```

## What the build emits

- `lib/index.js` — host half, ESM, Node platform; Cordis and Schemastery stay
  external because the host provides them.
- `lib/client.js` — browser half wrapped as:

  ```js
  window.__ModuleLoader__.load({ id: 'dsh-custom-center', factory: (require) => { ... } })
  ```

  The shell module table (`react`, `@deepseek-ai/cordis`, slot/store
  primitives, ...) is external; everything else is inlined.
- `lib/types/**` — declaration files referenced by the package `exports`.

## Next steps

1. Register a first-level `settings.section` (or a sidebar seat) in
   `src/client/index.ts` and render the center's cards.
2. Add same-origin loopback routes under `/api/dsh-custom-center/*` in the
   host half for asset inventory and writes; never trust client-supplied
   paths.
3. Define the asset registry contract (discovery roots, manifest validation,
   atomic install/remove) in `src/core/` so both halves share it.
4. Add tests for the registry, route fences and failure paths before writing
   files.
5. If this project later moves into the `dsh-web` monorepo, use
   `shared/tsdown.client.ts`, register the package in `aggregate.yml`, and let
   the aggregate generator own the `web-ui-*` row id. Do not copy the shared
   preset into the package.

## Notes

- No DSH source checkout is required to typecheck or build this scaffold; the
  official `@deepseek-ai/*` npm SDK packages are the only type source.
- The client half is side-effect free today, so loading it cannot break the
  GUI if the plugin row is enabled before the UI exists.
- License: `UNLICENSED` (private project). Choose and add a license before
  publishing.
