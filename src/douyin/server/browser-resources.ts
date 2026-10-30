import os from 'node:os'
import path from 'node:path'

/** DSH-wide third-party resources, shared across plugins and profiles. */
export function browserResourcesDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PLAYWRIGHT_BROWSERS_PATH?.trim()
  if (override) return override === '0' ? override : path.resolve(override)
  return path.resolve(env.DSH_HOME?.trim() || path.join(os.homedir(), '.dsh'), 'vendor', 'playwright')
}

export function configureBrowserResources(): void {
  // Playwright captures this value when its registry is first imported.
  process.env.PLAYWRIGHT_BROWSERS_PATH = browserResourcesDirectory()
}
