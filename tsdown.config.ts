/**
 * Standalone build for the dsh-custom-center plugin.
 *
 * Two faces are emitted into lib/:
 * - lib/index.js: the Node host half, loaded by the Cordis loader.
 * - lib/client.js: the browser half, wrapped in the closure-factory handoff
 *   the DSH Web GUI's __ModuleLoader__ expects. The module table entries are
 *   external; everything else is inlined.
 *
 * Feature styles are scoped strings registered by their browser components.
 * The standalone client shares React and shell modules through the loader table.
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
  entry: { index: 'src/index.ts', douyin: 'src/douyin/index.ts', 'douyin-import': 'src/douyin/import-cli.ts', 'douyin-headless-guard': 'src/douyin/headless-guard.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  deps: {
    onlyBundle: ['@deepseek-ai/dsh-brand', '@deepseek-ai/dsh-credentials', '@deepseek-ai/dsh-llm'],
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
