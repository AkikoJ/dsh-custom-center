# dsh-custom-center

[中文](README.zh.md)

A standalone **DSH Web GUI plugin** that adds a dedicated **Customization
Center** page to the Settings sidebar. It reskins the DeepSeek Harness UI with
a custom image/video wallpaper whose palette is sampled
from the picture.

Unlike a General-settings row, the center registers its own first-level
`settings.section` entry, so it appears as a separate page in the settings
navigation (alongside General, Models, Plugins, ...).

## Features

- **Wallpaper library** — click the picture to open a library with an Images
  tab and a Videos tab. **Upload** (the dashed tile at the start of the grid) copies files into `<DSH home>/background/`
  (default `~/.dsh/background/`), sorted into `images/` and `videos/`; click a
  thumbnail to use it. Images up to 50 MB, videos up to 512 MB; the file
  content must match its extension.
- **Custom image wallpaper** — any PNG / JPG / WebP; the palette (surface,
  accent, interaction highlights) is derived from the image's dominant colours.
- **Video wallpaper** — MP4 / WebM looped as a live background; the first frame
  drives the palette.
- **Left and right veil sliders** — tune the wallpaper veil of the sidebar and of the main area separately, or tick the sync checkbox (next to the body enhancement one) to move both together. Hints show on hover.
- **Input opacity slider** — tune the composer/input well independently.
- **Emphasize body text** — an optional frosted scrim under assistant prose.
- **Preview and save** — edits (wallpaper, sliders, body-text toggle) only change
  a draft. **Preview** enters a preview mode where the draft is shown on the live UI and
  every further change takes effect immediately, without being stored. **Save**
  persists it, **Exit preview** returns to the saved look, **Discard** also drops
  the draft.
- **Restore default** — a button at the bottom of the page that clears the
  wallpaper, palette and every stored setting.
- **Context and compaction tab** — a second tab at the top of the page. It reads
  the current default model's maximum context and output reserve and lets you
  tune each agent preset's automatic compaction: threshold ratio, headroom,
  retention mode (window fraction or fixed tokens) and the auto switch. Saving
  goes through `configEditor` into the active profile's `cordis.patch.yml` and
  is hot-applied by the Loader; the preview uses the same threshold formula as
  DSH. A scope dropdown picks which models the window is written to: one
  model, every model of a provider, or all editable models at once. The host
  enumerates them through `llm.listProviders` / `llm.listModels`; the browser
  never sends a list of ids. **Restore recommended** fills in 256k maximum context, a 32768 output
  reserve, a 0.8 threshold ratio and 16384 headroom (not yet saved).

The palette engine keeps WCAG contrast against the skin's own surface by
construction (contrast-checked text, accent and focus colours).

Legibility over a photo is checked rather than assumed:

- The composer caret, slash-command chip, send button and hover rows use a
  contrast-checked version of the wallpaper accent, so a pale or grey accent
  no longer disappears into the input well.
- Solid accent fills (the selected settings row, primary buttons, switches)
  take a readable label colour, and fall back to a tinted wash when the accent
  cannot carry body text. An accent that is nearly the same as the panel is
  lifted just enough to be seen.
- The wallpaper's lightness profile is stored with the skin. When the host is
  in light appearance and the wallpaper is mostly too dark for dark text even
  under the veil, the palette switches to the dark one (light text, dark input
  well) and sets the host's dark attribute so its own dark styles apply. Other
  wallpapers keep the host appearance, and a dark host is never switched to
  light. Wallpapers saved earlier recover the profile automatically.

## How it mounts

| Part | State |
| --- | --- |
| Bundle manifest | `dsh.bundle.patch` points at `cordis.patch.yml` |
| Loader row | `ui-custom-center` -> package `dsh-custom-center` |
| Host half | `src/index.ts`: `Config.enabled` settings page plus the wallpaper library routes (`src/host/library.ts`) and the context/compaction routes (`src/host/tuning.ts`) |
| Browser half | `src/client/index.ts`: registers a `settings.section` page |
| Shared logic | `src/core/*` (colour, palette, sampling, library rules) with unit tests |
| Build | `tsc` declarations + `tsdown` host/client bundles |

The browser half registers into the `settings.section` slot (a full settings
page with its own nav entry), not `settings.general.item`.

## Layout

```text
dsh-custom-center/
  cordis.patch.yml          # profile bundle row (id ui-custom-center)
  icon.svg                  # plugin icon (display metadata)
  src/
    index.ts                # host half (Node / Cordis)
    host/
      library.ts            # loopback routes: list, upload, file
      tuning.ts             # loopback routes: read/write context + compaction
      env.ts                # narrow host service typings
    client/
      index.ts              # browser half: settings.section wiring
      dsh-env.ts            # narrow DSH service typings + SlotMap augmentation
      controller.ts         # imperative skin engine (tokens, wallpaper, persistence)
      wallpaper.ts          # DOM/localStorage/IndexedDB + image/video decode
      CustomCenterPage.tsx  # the settings page (React view, appearance and tuning tabs)
      TuningPanel.tsx       # context/compaction form
      Select.tsx            # themed dropdown (replaces native select)
      LibraryPicker.tsx     # image/video tabs, upload, thumbnails
      library.ts            # browser client of the library routes
      tuning.ts             # browser client of the tuning routes
      styles.ts             # injected stylesheet
    core/
      color.ts              # pure colour maths
      skins.ts              # seeds -> token map
      sample.ts             # pure colour sampling from a pixel grid
      media.ts              # file classes, name rules, range parsing
      config.ts             # shared host config defaults
      tuning.ts             # validation, budget formula, profile config transforms
  tests/                    # vitest: color, skins, sample, config, tuning
```

## Install for development

Requirements: Node.js 22+, pnpm, and a DSH host whose version satisfies
`>= 0.2.1-rc.2`.

```sh
cd /Users/mac/Documents/code/dsh/dsh-custom-center
pnpm install
pnpm build
dsh plugin --profile web add link:$(pwd)
# refresh the DSH Web GUI afterwards
```

After the refresh, open Settings — a **Customization Center** entry appears in
the sidebar. Choose an image/video wallpaper, press Preview to try it (changes apply live), then Save to keep it.
Restore default clears everything.

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

  The shell module table (`react`, `react/jsx-runtime`, ...) is external;
  everything else is inlined.
- `lib/types/**` — declaration files referenced by the package `exports`.

## Notes

- No DSH source patch. Uninstalling restores the native appearance; files in
  the library folder are yours and are never deleted by the plugin.
- Wallpapers never leave the machine. The chosen image persists in
  localStorage and the chosen video in IndexedDB; the library folder keeps the
  originals.
- The library routes (`/custom-center/list`, `/upload`, `/file`) accept only
  loopback sockets, go through the Connection Host/Origin fence and browser
  authentication, and `list` / `upload` also need a same-origin marker header.
  The browser never sends a path: files are addressed by `images/<name>` or
  `videos/<name>` and resolved against the server-owned folder; symlinks and
  hidden files are refused.
- The tuning routes (`GET` / `POST /custom-center/tuning`) accept only loopback
  sockets, the Connection fence and the same-origin marker header. They take
  model-window and compaction numbers, never a file path; writes go through
  `configEditor` into the active profile patch, are validated by the owning
  plugin, and reconcile through the Loader.
- The maximum context is the capacity declared by the model route, not a hard
  truncation of one conversation. The trigger threshold is
  `min(window × threshold ratio, window − output reserve − headroom)`, matching
  `compaction-basic`. Compaction is per agent preset, so edits apply to Agents
  created after the change.
- The skin is an orthogonal overlay on the host appearance. It never calls
  `theme.setTheme` (ui-theme owns light/dark); it re-applies its tokens after
  every `theme/change`.
- The installed SDK does not publish the renderer `SlotRegistry` or theme
  service types, so `src/client/dsh-env.ts` declares narrow structural faces
  and augments `SlotMap` with `settings.section`. Replace these with real
  imports if the public SDK widens.
- License: [MIT](LICENSE).
