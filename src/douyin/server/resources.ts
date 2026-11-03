import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import type { DouyinPaths } from './paths.js'

export function douyinResources(moduleUrl = import.meta.url) {
  // Bundled host entries live in lib/, source modules live in src/douyin/server/.
  const candidates = [new URL('../resources/douyin/', moduleUrl), new URL('../../../resources/douyin/', moduleUrl)]
  const root = candidates.map((url) => fileURLToPath(url)).find((path) => existsSync(join(path, 'upstream.json')))
  if (!root) throw new Error('Packaged Douyin resources are missing')
  return {
    root, mcp: join(root, 'mcp', 'mcp_server.py'), requirements: join(root, 'mcp', 'requirements.txt'),
    pythonPaths: join(root, 'runtime_paths.py'), video: join(root, 'video-understanding'),
    duty: join(root, 'prompts', 'duty.md'), persona: join(root, 'prompts', 'persona.md'),
    upstream: JSON.parse(readFileSync(join(root, 'upstream.json'), 'utf8')) as { version: string; commit: string },
    identity: JSON.parse(readFileSync(join(root, '../../package.json'), 'utf8')) as { name: string; version: string },
  }
}
export type DouyinResources = ReturnType<typeof douyinResources>
const hash = (text: string) => createHash('sha256').update(text).digest('hex')

/** Only known unmodified assets upgrade automatically; custom text gets a sidecar. */
export function deployAsset(source: string, target: string, hashFile?: string): 'fresh' | 'same' | 'upgraded' | 'kept' {
  const incoming = readFileSync(source, 'utf8')
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
  const previous = hashFile && existsSync(hashFile) ? readFileSync(hashFile, 'utf8').trim() : ''
  if (!existsSync(target)) {
    writeFileSync(target, incoming, { flag: 'wx', mode: 0o600 })
    if (hashFile) writeFileSync(hashFile, hash(incoming), { mode: 0o600 })
    return 'fresh'
  }
  const existing = readFileSync(target, 'utf8')
  if (existing === incoming) {
    if (hashFile) writeFileSync(hashFile, hash(incoming), { mode: 0o600 })
    return 'same'
  }
  if (hashFile && hash(existing) === previous) {
    writeFileSync(target + '.bak', existing, { mode: 0o600 })
    writeFileSync(target, incoming, { mode: 0o600 })
    writeFileSync(hashFile, hash(incoming), { mode: 0o600 })
    return 'upgraded'
  }
  if (!existsSync(target + '.new') || readFileSync(target + '.new', 'utf8') !== incoming) {
    writeFileSync(target + '.new', incoming, { mode: 0o600 })
  }
  return 'kept'
}

export function prepareRuntime(paths: DouyinPaths, resources = douyinResources()) {
  for (const directory of [paths.cache, paths.runtime, paths.logs, paths.memory, paths.reports, dirname(paths.python),
    join(paths.root, 'state', 'legacy'), paths.prompts, paths.file('.tmp')]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
  }
  const script = paths.file('mcp_server.py')
  const deployed = deployAsset(resources.mcp, script, paths.file('mcp.sha256'))
  deployAsset(resources.duty, paths.file('duty.md'), paths.file('charter.sha256'))
  if (!existsSync(paths.file('persona.md'))) deployAsset(resources.persona, paths.file('persona.md'))
  return {
    script, deployed,
    env(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
      return { ...paths.childEnv(base), DOUYIN_RESOURCE_ROOT: resources.root, DOUYIN_VIDEO_LAB: resources.video }
    },
  }
}
