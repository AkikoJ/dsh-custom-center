import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { browserResourcesDirectory } from '../src/douyin/server/browser-resources.ts'

const installer = fileURLToPath(new URL('../scripts/install-douyin-browser.mjs', import.meta.url))

describe('Douyin browser resource location', () => {
  it.each([
    {},
    { DSH_HOME: '/tmp/custom-dsh' },
    { DSH_PROFILE_DIR: '/tmp/profile-web' },
    { PLAYWRIGHT_BROWSERS_PATH: '/tmp/custom-browsers' },
    { PLAYWRIGHT_BROWSERS_PATH: 'relative-browsers' },
    { PLAYWRIGHT_BROWSERS_PATH: '0' },
    { DSH_HOME: '  ', PLAYWRIGHT_BROWSERS_PATH: '  ' },
  ])('installer and host agree for %j', (values) => {
    const env = { ...process.env }
    delete env.DSH_HOME
    delete env.DSH_PROFILE_DIR
    delete env.PLAYWRIGHT_BROWSERS_PATH
    Object.assign(env, values)
    expect(execFileSync(process.execPath, [installer, '--print-path'], { env, encoding: 'utf8' }).trim())
      .toBe(browserResourcesDirectory(env))
  })

  it('defaults to the DSH home rather than the system cache or account profile', () => {
    expect(browserResourcesDirectory({})).toBe(path.join(os.homedir(), '.dsh/vendor/playwright'))
    expect(browserResourcesDirectory({ DSH_HOME: '/tmp/dsh', DSH_PROFILE_DIR: '/tmp/profile' }))
      .toBe('/tmp/dsh/vendor/playwright')
  })
})
