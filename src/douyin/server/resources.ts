import { existsSync, linkSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join, relative, resolve, sep } from 'node:path'
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

/** Reject links below the configured runtime root, including existing sidecars. */
function checkPath(root: string, target: string) {
  let current = resolve(root)
  for (const part of relative(current, resolve(target)).split(sep)) {
    if (part === '..') throw new Error('资源路径超出运行目录')
    if (!part) continue
    current = join(current, part)
    try { if (lstatSync(current).isSymbolicLink()) throw new Error('资源路径含符号链接') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
}
function publish(target: string, text: string, exclusive = false) {
  const temporary = `${target}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, text, { flag: 'wx', mode: 0o600 })
    if (exclusive) linkSync(temporary, target); else renameSync(temporary, target)
  } finally { if (existsSync(temporary)) unlinkSync(temporary) }
}
/** Only known unmodified assets upgrade automatically; custom text gets a sidecar. */
export function deployAsset(source: string, target: string, hashFile?: string, root = dirname(target)): 'fresh' | 'same' | 'upgraded' | 'kept' {
  for (const file of [target, target + '.bak', target + '.new', ...(hashFile ? [hashFile] : [])]) checkPath(root, file)
  const incoming = readFileSync(source, 'utf8')
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
  const previous = hashFile && existsSync(hashFile) ? readFileSync(hashFile, 'utf8').trim() : ''
  if (!existsSync(target)) {
    publish(target, incoming, true)
    if (hashFile) publish(hashFile, hash(incoming))
    return 'fresh'
  }
  const existing = readFileSync(target, 'utf8')
  if (existing === incoming) {
    if (hashFile) publish(hashFile, hash(incoming))
    return 'same'
  }
  if (hashFile && hash(existing) === previous) {
    publish(target + '.bak', existing)
    publish(target, incoming)
    publish(hashFile, hash(incoming))
    return 'upgraded'
  }
  if (!existsSync(target + '.new') || readFileSync(target + '.new', 'utf8') !== incoming) {
    publish(target + '.new', incoming)
  }
  return 'kept'
}

export function prepareRuntime(paths: DouyinPaths, resources = douyinResources()) {
  for (const directory of [paths.cache, paths.runtime, paths.logs, paths.memory, paths.reports, dirname(paths.python),
    join(paths.root, 'state', 'legacy'), paths.prompts, paths.file('.tmp')]) {
    checkPath(paths.root, directory)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
  }
  const script = paths.file('mcp_server.py')
  const deployed = deployAsset(resources.mcp, script, paths.file('mcp.sha256'), paths.root)
  deployAsset(resources.duty, paths.file('duty.md'), paths.file('charter.sha256'), paths.root)
  if (!existsSync(paths.file('persona.md'))) deployAsset(resources.persona, paths.file('persona.md'), undefined, paths.root)
  return {
    script, deployed,
    env(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
      return { ...paths.childEnv(base), DOUYIN_RESOURCE_ROOT: resources.root, DOUYIN_VIDEO_LAB: resources.video }
    },
  }
}
