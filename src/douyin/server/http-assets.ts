import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { spawn } from 'node:child_process'
import type { DouyinPaths } from './paths.js'
import { within } from './paths.js'
import { imageType } from './image-fetch.js'

/** Open a physical regular descendant and read a bounded region. */
export function readOwned(root: string, file: string, maxBytes: number, tail = false): Buffer {
  const base = resolve(root), target = resolve(file)
  if (target === base || !within(base, target)) throw new Error('资源不在插件目录中')
  const physical = realpathSync(base)
  let current = base
  for (const part of relative(base, target).split(sep)) { current = resolve(current, part); if (lstatSync(current).isSymbolicLink()) throw new Error('资源路径含符号链接') }
  if (!within(physical, realpathSync(target))) throw new Error('资源路径超出插件目录')
  const expected = lstatSync(target), location = realpathSync(target)
  const descriptor = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = fstatSync(descriptor)
    if (stat.dev !== expected.dev || stat.ino !== expected.ino || realpathSync(target) !== location || !within(physical, location)) throw new Error('资源在打开期间发生变化')
    if (!stat.isFile()) throw new Error('资源不是普通文件')
    if (!tail && stat.size > maxBytes) throw new Error('资源超过大小限制')
    const size = Math.min(maxBytes, stat.size), data = Buffer.alloc(size)
    const read = readSync(descriptor, data, 0, size, tail ? Math.max(0, stat.size - size) : 0)
    return data.subarray(0, read)
  } finally { closeSync(descriptor) }
}
export function ownedTail(paths: DouyinPaths, name: 'duty.log' | 'setup.log') {
  try { return readOwned(paths.root, paths.file(name), 8000, true).toString('utf8') } catch { return '' }
}
export function thumbnail(paths: DouyinPaths, id: string) {
  if (!/^\d{6,24}$/.test(id)) throw new Error('视频 ID 无效')
  const buffer = readOwned(paths.root, resolve(paths.file('thumbs'), id + '.jpg'), 8 * 1024 * 1024)
  return { buffer, type: imageType(buffer) }
}
export async function openDirectory(paths: DouyinPaths, what: unknown) {
  if (what !== undefined && what !== 'home' && what !== 'out') throw new Error('只能打开家目录或报告目录')
  const target = what === 'out' ? paths.reports : paths.root
  if (!within(realpathSync(paths.root), realpathSync(target))) throw new Error('目录超出插件目录')
  const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  await new Promise<void>((done, reject) => {
    const child = spawn(command, [target], { detached: true, stdio: 'ignore', shell: false, windowsHide: true })
    child.once('error', reject); child.once('spawn', () => { child.unref(); done() })
  })
  return { ok: true, path: target }
}
