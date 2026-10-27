# dsh-custom-center

[中文](README.zh.md)

A standalone **DSH Web GUI plugin** that adds three dedicated pages to the
Settings sidebar: **Appearance**, **Context & Compaction** and **Skills**.
Appearance reskins the DeepSeek Harness UI with a custom image/video wallpaper
whose palette is sampled from the picture; Context & Compaction sets the model
context window and the automatic compaction policy; Skills manages DSH's own
skills and shows other agents' skills so you can sync them into DSH (derived
from [dsh-skills-manager](https://github.com/MichengAI/dsh-skills-manager)).

Unlike a General-settings row, the plugin registers its own first-level
`settings.section` entries, so they appear as separate pages in the settings
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
- **Context and compaction page** — a settings page next to Appearance. It reads
  the current default model's maximum context and output reserve and lets you
  tune each agent preset's automatic compaction: threshold ratio, headroom,
  retention mode (window fraction or fixed tokens) and the auto switch. Saving
  goes through `configEditor` into the active profile's `cordis.patch.yml` and
  is hot-applied by the Loader; the preview uses the same threshold formula as
  DSH. A scope dropdown picks which models the window is written to: one
  model, every model of a provider, or all editable models at once. The host
  enumerates them through `llm.listProviders` / `llm.listModels`; the browser
  never sends a list of ids. **Restore recommended** fills in 272k maximum context, a 32768 output
  reserve, a 0.8 threshold ratio and 16384 headroom (not yet saved).
- **Skills page** — derived from dsh-skills-manager 1.2.11, with one core
  change: other agents' skill folders (Codex, Claude Code, Copilot and the
  rest) are **view-and-sync only**. DSH no longer loads them directly.
  - The **Other agents** tab lists them read-only with a sync status: not
    synced, synced, source updated, or a same-name skill already in DSH.
  - **Sync to DSH** copies a skill (one, or all of a source) into
    `~/.dsh/skills`; on the project view it copies into that project's
    `.dsh/skills`. It is a one-time copy, never a link, and source files are
    never modified. Later edits to the source only flip the status to
    "source updated"; sync again by hand. A same-name skill in DSH is skipped
    unless you tick overwrite, and the old version goes to trash first.
  - Only skills in DSH's own folders are loaded by DSH, and only those have
    enable/disable switches (a local policy that never edits skill files).
  - Everything else is unchanged: create skills, import ZIP / folder /
    `SKILL.md`, trash, categories, an optional sidebar entry, and the
    `create_skill` tool (asks before running). The original plugin's
    Discover tab (GitHub repositories, ClawHub, skills.sh), self-update check
    and GitHub link buttons were left out. Turn the page off with the `skills` switch in the
    plugin settings.

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
| Host half | `src/index.ts`: `Config.enabled` / `Config.skills` settings page plus the wallpaper library routes (`src/host/library.ts`), the context/compaction routes (`src/host/tuning.ts`) and the skills child plugin (`src/skills/index.ts`, injects `skills`, `tools`, `sessions`) |
| Browser half | `src/client/index.ts`: registers the Appearance and Context & Compaction `settings.section` pages and mounts the Skills page as a child plugin (`src/skills/client.ts`, injects `locale`) |
| Shared logic | `src/core/*` (colour, palette, sampling, library rules) with unit tests |
| Build | `tsc` declarations + `tsdown` host/client bundles |

The browser half registers into the `settings.section` slot (full settings
pages, each with its own nav entry), not `settings.general.item`. The skills
module mounts as a separate Cordis child plugin on both halves: if the host
lacks a service it needs, only the Skills page is missing.

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
      AppearancePage.tsx    # appearance page (wallpaper, veils, preview/save)
      TuningPage.tsx        # context/compaction page (frame + form)
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
    skills/                 # skills management (ported from dsh-skills-manager, Apache-2.0)
      index.ts              # host: /api/dsh-custom-center/skills routes, skill provider, create_skill
      client.ts             # browser: Skills settings page
      core.ts               # skill scanning, toggle policy, sync from other agents, create/import/trash
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

After the refresh, open Settings — **Appearance**, **Context & Compaction** and
**Skills** entries appear in the sidebar. In Appearance, choose an image/video wallpaper,
press Preview to try it (changes apply live), then Save to keep it; Restore
default clears everything. In Context & Compaction, adjust the model window and
compaction values, then press Save. In Skills, open **Other agents** to
review another agent's skills and sync the ones you want into DSH.

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
- The skills routes (`/api/dsh-custom-center/skills/*`) keep the original
  checks: only loopback or DSH-trusted Hosts, no cross-site requests; writes
  also need the `x-dsh-custom-center-skills` marker header and JSON. Skill
  state lives in `$DSH_HOME/skills-manager/`, shared with the original plugin,
  so moving over from dsh-skills-manager keeps toggles and categories.
- Skills you have not synced are invisible to DSH. After upgrading from
  dsh-skills-manager, anything that only lived in another agent's folder must
  be synced once to keep working. Sync records are kept in
  `$DSH_HOME/skills-manager/sync-records.json`.
- Do not enable the Skills page alongside `@michengai/dsh-skills-manager`: both
  would register a skill provider and a `create_skill` tool. If you keep the
  original plugin, set this plugin's `skills` switch off.
- License: [MIT](LICENSE). `src/skills/` is ported from dsh-skills-manager under
  [Apache-2.0](LICENSE-skills-manager).
