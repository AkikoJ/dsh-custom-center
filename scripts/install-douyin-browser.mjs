import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

// Keep this standalone installer usable before building the plugin.
// Its path convention is shared with server/browser-resources.ts.
const override = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim()
const directory = override
  ? override === '0' ? override : path.resolve(override)
  : path.resolve(process.env.DSH_HOME?.trim() || path.join(os.homedir(), '.dsh'), 'vendor', 'playwright')

if (process.argv.includes('--print-path')) {
  process.stdout.write(`${directory}\n`)
} else {
  const require = createRequire(import.meta.url)
  const cli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js')
  const result = spawnSync(process.execPath, [cli, 'install', 'chromium', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: directory },
  })
  if (result.error) {
    process.stderr.write(`Unable to start the browser installer: ${result.error.message}\n`)
  }
  process.exitCode = result.status ?? 1
}
