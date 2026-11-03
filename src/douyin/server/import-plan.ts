import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { legacyRelativePath, within } from './paths.js'

export interface ImportEntry {
  source: string
  target: string
  sourceHash: string
  targetHash: string
  size: number
  status: 'pending' | 'copied' | 'identical' | 'conflict' | 'skipped-environment'
}
export interface ImportManifest {
  version: 1
  source: string
  target: string
  startedAt: string
  completedAt?: string
  python: 'rebuild-required'
  entries: ImportEntry[]
}
export const sha256 = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')

export function canonicalImportRoot(path: string): string {
  const absolute = resolve(path)
  try {
    if (lstatSync(absolute).isSymbolicLink()) throw new Error(`Symbolic link is not allowed: ${absolute}`)
    return realpathSync(absolute)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return join(canonicalImportRoot(resolve(absolute, '..')), absolute.split(/[\\/]/).at(-1)!)
  }
}

export function assertNoSymlinks(path: string): void {
  const absolute = resolve(path)
  let current = absolute
  for (;;) {
    try { if (lstatSync(current).isSymbolicLink()) throw new Error(`Symbolic link is not allowed: ${current}`) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    const parent = resolve(current, '..')
    if (parent === current) break
    current = parent
  }
}

export function assertIdle(home: string): void {
  // Refuse ambiguous ownership too: importing is an offline operation.
  for (const name of ['.action-lock', '.login-browser', '.captcha', '.need-captcha',
    'state/.login-browser', 'state/.need-captcha',
    'browser/SingletonLock', 'browser/SingletonSocket', 'browser/lockfile']) {
    try { lstatSync(join(home, name)) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    throw new Error(`Legacy process or browser may still be active: ${name}`)
  }
  try {
    const state = JSON.parse(readFileSync(join(home, 'state.json'), 'utf8'))
    const pid = state.headless?.pid
    if (Number.isInteger(pid) && pid > 0) {
      try { process.kill(pid, 0) } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
        throw error
      }
      throw new Error(`Legacy headless process is still active: ${pid}`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
}

/** Only rewrite known app-owned settings; arbitrary text and external paths stay intact. */
export function importContent(sourceRoot: string, targetRoot: string, name: string, bytes: Buffer): Buffer {
  if (name !== 'config.json') return bytes
  const config: Record<string, unknown> = JSON.parse(bytes.toString('utf8'))
  const ownedKeys = ['pythonPath', 'workspace']
  for (const key of ownedKeys) {
    const value = config[key]
    if (typeof value !== 'string' || !within(sourceRoot, value)) continue
    const relative = value.slice(sourceRoot.length).replace(/^[/\\]+/, '').replaceAll('\\', '/')
    if (key === 'pythonPath') {
      // A copied virtualenv is not portable. Runtime setup must create a new one.
      if (relative.startsWith('.venv/')) config[key] = 'python'
    } else if (!relative) config[key] = targetRoot
    else if (['out', 'memory', '.tmp'].includes(relative.split('/')[0])) {
      config[key] = join(targetRoot, legacyRelativePath(relative))
    }
  }
  return Buffer.from(JSON.stringify(config, null, 2) + '\n')
}

export function planImport(source: string, target: string): ImportManifest {
  assertNoSymlinks(source)
  assertNoSymlinks(target)
  const root = realpathSync(source)
  if (within(root, target) || within(target, root)) throw new Error('Source and target must be separate directory trees')
  const entries: ImportEntry[] = []
  function scan(directory: string, prefix = ''): void {
    for (const name of readdirSync(directory).sort()) {
      const relative = prefix ? `${prefix}/${name}` : name
      const path = join(directory, name)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) throw new Error(`Legacy symbolic link is not allowed: ${relative}`)
      if (relative === '.venv' || relative.startsWith('.venv/')) {
        entries.push({ source: relative, target: 'python/.venv', sourceHash: '', targetHash: '',
          size: 0, status: 'skipped-environment' })
      } else if (stat.isDirectory()) scan(path, relative)
      else if (stat.isFile()) {
        const bytes = readFileSync(path)
        const content = importContent(root, target, relative, bytes)
        entries.push({ source: relative, target: legacyRelativePath(relative),
          sourceHash: sha256(bytes), targetHash: sha256(content), size: bytes.length, status: 'pending' })
      } else throw new Error(`Unsupported legacy file: ${relative}`)
    }
  }
  scan(root)
  return { version: 1, source: root, target: resolve(target), startedAt: new Date().toISOString(),
    python: 'rebuild-required', entries }
}
