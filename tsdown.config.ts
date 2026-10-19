/**
 * Standalone build for the dsh-custom-center plugin.
 *
 * Two faces are emitted into lib/:
 * - lib/index.js: the Node host half, loaded by the Cordis loader.
 * - lib/client.js: the browser half, wrapped in the closure-factory handoff
 *   the DSH Web GUI's __ModuleLoader__ expects. The module table entries are
 *   external; everything else is inlined.
 *
 * CSS Modules and the shared dsh-web build preset are intentionally not wired
 * yet: this scaffold has no UI code. When the client half grows React views,
 * add a CSS-modules plugin (lightningcss) or move the project into the dsh-web
 * monorepo and use its shared/tsdown.client.ts preset instead of copying it.
 */
import type { UserConfig } from 'tsdown'

const ID = 'dsh-custom-center'

/** Browser modules the DSH shell shares through its frozen loader table. */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const host: UserConfig = {
  name: ID,
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  deps: {
    neverBundle: [
      '@deepseek-ai/cordis',
      '@deepseek-ai/schemastery',
    ],
  },
}

const client: UserConfig = {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: [...CLIENT_EXTERNALS],
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default (): UserConfig[] => [host, client]
