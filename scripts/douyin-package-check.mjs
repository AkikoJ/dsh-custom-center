import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'

// Run after build. No profile changes, browser, network, dependency install or account access.
const project = fileURLToPath(new URL('../', import.meta.url))
const temporary = mkdtempSync(join(tmpdir(), 'douyin-package-check-'))
const manifest = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], {
  cwd: project, env: { ...process.env, npm_config_offline: 'true' }, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
}))[0]
const paths = new Set(manifest.files.map((file) => file.path))
for (const file of ['lib/douyin.js', 'lib/client.js', 'lib/douyin-import.js', 'lib/douyin-headless-guard.js', 'lib/types/douyin/index.d.ts', 'cordis.patch.yml', 'README.zh.md', 'docs/douyin-migration.md', 'docs/douyin-coexistence.md', 'docs/douyin-parity-repair.md', 'docs/adr/0003-douyin-runtime-and-import.md', 'LICENSE-douyin', 'resources/douyin/upstream.json', 'resources/douyin/mcp/mcp_server.py', 'resources/douyin/runtime_paths.py', 'resources/douyin/video-understanding/run.py', 'resources/douyin/prompts/duty.md']) assert(paths.has(file), `missing packaged file: ${file}`)
assert(![...paths].some((file) => /(^|\/)(?:__pycache__|node_modules|\.venv|vendor)(?:\/|$)|\.pyc$/.test(file)), 'development caches entered package')
execFileSync('tar', ['-xzf', join(temporary, manifest.filename), '-C', temporary])
const installed = join(temporary, 'package')
// Simulate the SDK/peer modules supplied by a host without installing or changing it.
symlinkSync(join(project, 'node_modules'), join(temporary, 'node_modules'), 'dir')
const source = join(temporary, 'legacy'), target = join(temporary, 'runtime')
mkdirSync(source)
writeFileSync(join(source, 'config.json'), JSON.stringify({ perDay: 0, noon: false, night: false }))
writeFileSync(join(source, 'mcp_server.py'), '# user script\n')
const runImport = () => JSON.parse(execFileSync(process.execPath, [join(installed, 'lib/douyin-import.js'), '--source', source, '--target', target, '--legacy-stopped'], { cwd: tmpdir(), encoding: 'utf8' }))
assert(runImport().completedAt)
assert(runImport().completedAt)
assert.equal(readFileSync(join(target, 'runtime/mcp_server.py'), 'utf8'), '# user script\n')
assert.equal(readFileSync(join(source, 'config.json'), 'utf8'), JSON.stringify({ perDay: 0, noon: false, night: false }))
assert.equal(readFileSync(join(source, 'mcp_server.py'), 'utf8'), '# user script\n')
assert.deepEqual(readdirSync(source).sort(), ['config.json', 'mcp_server.py'])
const require = createRequire(join(installed, 'package.json'))
const { Context } = require('@deepseek-ai/cordis')
const host = await import(pathToFileURL(join(installed, 'lib/douyin.js')).href)
const guard = await import(pathToFileURL(join(installed, 'lib/douyin-headless-guard.js')).href)
assert.equal(typeof guard.apply, 'function')
const ctx = new Context(), tools = new Map(), routes = new Map()
const previous = process.env.DSH_CUSTOM_CENTER_DOUYIN_HOME
process.env.DSH_CUSTOM_CENTER_DOUYIN_HOME = target
try {
  ctx.provide('tools', { register(tool) { assert(!tools.has(tool.name)); tools.set(tool.name, tool); return () => tools.delete(tool.name) } })
  ctx.provide('webServer', { register(route) { assert(!routes.has(route.path)); routes.set(route.path, route); return () => routes.delete(route.path) } })
  ctx.provide('connection', { requestRejection: () => undefined })
  host.apply(ctx, { perDay: 0, noon: false, night: false, peakValley: false, dmAutoReply: false, autoReply: false, msgAllowTo: '' })
  assert.equal(tools.size, 34); assert.equal(routes.size, 31)
  const status = await tools.get('cc_dy_status').execute({}, { signal: new AbortController().signal })
  assert.equal(status.build.upstream.commit, 'aaf9f9a862afafd45a15acf32789da97688de695')
  assert.equal(readFileSync(join(target, 'runtime/mcp_server.py'), 'utf8'), '# user script\n')
  assert(readFileSync(join(target, 'runtime/mcp_server.py.new'), 'utf8').includes('FastMCP'))
  await ctx.fiber.dispose()
  assert.equal(tools.size, 0); assert.equal(routes.size, 0)
} finally {
  await ctx.fiber.dispose()
  if (previous === undefined) delete process.env.DSH_CUSTOM_CENTER_DOUYIN_HOME; else process.env.DSH_CUSTOM_CENTER_DOUYIN_HOME = previous
}
let client
const modules = new Set()
runInNewContext(readFileSync(join(installed, 'lib/client.js'), 'utf8'), { window: { __ModuleLoader__: { load(payload) {
  assert.equal(payload.id, 'dsh-custom-center')
  client = payload.factory((id) => {
    modules.add(id)
    assert(['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'].includes(id), `unexpected browser dependency: ${id}`)
    // This module belongs to the shell module table; component rendering is not part of this offline check.
    return id === '@deepseek-ai/dsh-client-ui-primitives' ? { Input: () => null } : require(id)
  })
} } } })
assert.equal(typeof client.apply, 'function')
assert(modules.has('react'))
const resourceRoot = join(installed, 'resources/douyin')
const python = process.env.DOUYIN_TEST_PYTHON || 'python3'
const output = execFileSync(python, ['-B', join(resourceRoot, 'video-understanding/run.py'), 'doctor'], { cwd: tmpdir(), env: { ...process.env, DSH_CUSTOM_CENTER_DOUYIN_HOME: target, DOUYIN_RESOURCE_ROOT: resourceRoot }, encoding: 'utf8' })
assert.equal(JSON.parse(output).ok, true)
console.log(JSON.stringify({ ok: true, package: manifest.filename, files: manifest.files.length, tools: 34, routes: 31, imports: [...modules], temporary: realpathSync(temporary), runtimeFiles: readdirSync(join(target, 'runtime')), sourceStillPresent: existsSync(source) }, null, 2))
