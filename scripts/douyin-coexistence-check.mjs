import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'

// Isolated real-entry mount check. Build first; pass the preserved legacy repository.
// No runtime profile changes, network, Python, browser or account actions.
const legacyRoot = process.argv[2]
if (!legacyRoot) throw new Error('usage: node scripts/douyin-coexistence-check.mjs /path/to/dsh_douyin_tools')
const project = fileURLToPath(new URL('../', import.meta.url))
const original = realpathSync(resolve(legacyRoot)), temporary = realpathSync(mkdtempSync(join(tmpdir(), 'douyin-coexistence-')))
assert.notEqual(original, project)
const savedEnv = new Map(['DSH_HOME', 'DSH_DOUYIN_HOME', 'DSH_CUSTOM_CENTER_DOUYIN_HOME', 'DSH_HOST_MODULES'].map((key) => [key, process.env[key]]))
process.env.DSH_HOME = temporary
process.env.DSH_DOUYIN_HOME = join(temporary, 'legacy')
process.env.DSH_CUSTOM_CENTER_DOUYIN_HOME = join(temporary, 'center')
process.env.DSH_HOST_MODULES = join(project, 'node_modules/@deepseek-ai')
const childProcess = createRequire(import.meta.url)('node:child_process'), savedSpawn = childProcess.spawn, savedFetch = globalThis.fetch
let subprocesses = 0, requests = 0
childProcess.spawn = () => { subprocesses++; throw new Error('unexpected subprocess during coexistence mount') }
syncBuiltinESMExports()
globalThis.fetch = async () => { requests++; throw new Error('unexpected network during coexistence mount') }
const tools = new Map(), routes = new Map(), contexts = []
const cfg = { perDay: 0, noon: false, night: false, peakValley: false, autoLike: false, autoComment: false, autoPublish: false, autoReply: false, autoClean: false, dmAutoReply: false, dmReply: false, msgAllowTo: '', streakNick: '', memory: false }
const settings = { describe: () => [], update: async () => { throw new Error('unexpected settings write') }, configure: () => () => {} }
const scoped = () => {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide('tools', { register(tool) {
    assert(!tools.has(tool.name), 'duplicate tool: ' + tool.name)
    tools.set(tool.name, tool)
    // Like the real service, the substitute also owns legacy direct registrations.
    const dispose = () => tools.delete(tool.name)
    ctx.effect(() => dispose)
    return dispose
  } })
  ctx.provide('webServer', { register(route) {
    for (const existing of routes.values()) {
      const overlaps = (existing.kind === 'prefix' && route.path.startsWith(existing.path)) || (route.kind === 'prefix' && existing.path.startsWith(route.path)) || route.path === existing.path
      assert(!overlaps, 'overlapping route: ' + route.path)
    }
    routes.set(route.path, route)
    return () => routes.delete(route.path)
  } })
  ctx.provide('connection', { requestRejection: () => undefined })
  ctx.provide('settings', settings)
  return ctx
}
try {
  const legacy = await import(pathToFileURL(join(original, 'index.js')).href)
  const center = await import(pathToFileURL(join(project, 'lib/douyin.js')).href)
  assert.equal(legacy.name, 'douyin-life')
  assert.equal(center.name, 'custom-center-douyin')
  const legacyCtx = scoped()
  legacy.apply(legacyCtx, cfg)
  const oldTools = [...tools.keys()], oldRoutes = [...routes.keys()]
  assert.equal(oldTools.length, 35)
  assert(oldTools.every((name) => name.startsWith('dy_')))
  assert.deepEqual(oldRoutes, ['/api/douyin-duty'])
  const centerCtx = scoped()
  center.apply(centerCtx, cfg)
  assert.equal(tools.size, 69)
  assert.equal(routes.size, 32)
  assert.equal([...tools.keys()].filter((name) => name.startsWith('cc_dy_')).length, 34)
  assert.equal([...routes.keys()].filter((path) => path.startsWith('/api/custom-center/douyin/')).length, 31)
  const status = await tools.get('cc_dy_status').execute({}, { signal: new AbortController().signal })
  assert.equal(status.ok, true)
  await centerCtx.fiber.dispose()
  assert.deepEqual([...tools.keys()], oldTools)
  assert.deepEqual([...routes.keys()], oldRoutes)
  // Verify that center registration also works when legacy starts second.
  await legacyCtx.fiber.dispose()
  assert.equal(tools.size, 0); assert.equal(routes.size, 0)
  const centerFirst = scoped(); center.apply(centerFirst, cfg)
  const legacySecond = scoped(); legacy.apply(legacySecond, cfg)
  assert.equal(tools.size, 69); assert.equal(routes.size, 32)
  assert.equal(subprocesses, 0); assert.equal(requests, 0)
  console.log(JSON.stringify({ ok: true, startupOrders: ['legacy then center', 'center then legacy'], tools: 69, routes: { legacyPrefix: 1, centerExact: 31 }, legacyRetainedOnCenterDisposal: true, subprocesses, requests, source: JSON.parse(readFileSync(join(original, 'package.json'), 'utf8')).version }, null, 2))
} finally {
  for (const ctx of contexts.reverse()) await ctx.fiber.dispose()
  childProcess.spawn = savedSpawn; syncBuiltinESMExports(); globalThis.fetch = savedFetch
  for (const [key, value] of savedEnv) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  assert(isAbsolute(temporary) && dirname(temporary) === realpathSync(tmpdir()) && temporary.split('/').at(-1).startsWith('douyin-coexistence-'))
  rmSync(temporary, { recursive: true, force: true })
}
