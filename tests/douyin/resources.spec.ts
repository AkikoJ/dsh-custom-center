import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { douyinPaths } from '../../src/douyin/server/paths.js'
import { deployAsset, douyinResources, prepareRuntime } from '../../src/douyin/server/resources.js'
import { runCommand } from '../../src/douyin/server/process.js'

const resources = douyinResources()
describe('packaged resources and explicit child environments', () => {
  it('locates fixed-version resources and preserves modified scripts and persona', () => {
    expect(resources.upstream.version).toBe('0.2.9')
    const paths = douyinPaths(mkdtempSync(join(tmpdir(), 'douyin-resources-')))
    const runtime = prepareRuntime(paths)
    expect(runtime.deployed).toBe('fresh')
    expect(prepareRuntime(paths).deployed).toBe('same')
    writeFileSync(runtime.script, 'custom script')
    writeFileSync(paths.file('persona.md'), 'custom persona')
    expect(prepareRuntime(paths).deployed).toBe('kept')
    expect(readFileSync(runtime.script, 'utf8')).toBe('custom script')
    expect(readFileSync(runtime.script + '.new', 'utf8')).toContain('FastMCP')
    expect(readFileSync(paths.file('persona.md'), 'utf8')).toBe('custom persona')
    const owned = join(paths.runtime, 'owned'), hash = join(paths.runtime, 'owned.sha')
    deployAsset(resources.persona, owned, hash)
    expect(deployAsset(resources.duty, owned, hash)).toBe('upgraded')
    expect(readFileSync(owned + '.bak', 'utf8')).toBe(readFileSync(resources.persona, 'utf8'))
  })
  it('refuses linked runtime directories and deployment sidecars without touching their targets', () => {
    for (const kind of ['directory', 'target', 'hash', 'backup', 'new']) {
      const root = mkdtempSync(join(tmpdir(), 'douyin-resources-links-')), paths = douyinPaths(root)
      const outside = join(root, 'outside'); mkdirSync(outside)
      const external = join(outside, 'external'); writeFileSync(external, 'keep')
      if (kind === 'directory') { symlinkSync(outside, paths.runtime); expect(() => prepareRuntime(paths)).toThrow('符号链接') }
      else {
        mkdirSync(paths.runtime)
        const file = paths.file('mcp_server.py'), hash = paths.file('mcp.sha256')
        symlinkSync(external, kind === 'target' ? file : kind === 'hash' ? hash : file + (kind === 'backup' ? '.bak' : '.new'))
        expect(() => deployAsset(resources.mcp, file, hash, root)).toThrow('符号链接')
      }
      expect(readFileSync(external, 'utf8')).toBe('keep')
    }
  })
  it('Python and Node resolve identical explicit and DSH fallback roots', () => {
    const root = mkdtempSync(join(tmpdir(), 'douyin-python-path-'))
    const python = process.env.DOUYIN_TEST_PYTHON || 'python3'
    const code = 'import sys; sys.path.insert(0,sys.argv[1]); import runtime_paths as p; print(p.HOME); print(p.CONFIG); print(p.MODELS)'
    const result = execFileSync(python, ['-B', '-c', code, resources.root], {
      env: douyinPaths(root).childEnv(), encoding: 'utf8',
    }).trim().split('\n')
    // macOS resolves /var aliases in Python; compare canonical paths through Python.
    const physical = execFileSync(python, ['-B', '-c', 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).resolve())', root], { encoding: 'utf8' }).trim()
    expect(result).toEqual([physical, join(physical, 'config/config.json'), join(physical, 'cache/models')])
    const fallback = execFileSync(python, ['-B', '-c', code, resources.root], {
      env: { ...process.env, DSH_CUSTOM_CENTER_DOUYIN_HOME: '', DSH_DOUYIN_HOME: '/legacy', DSH_HOME: root }, encoding: 'utf8',
    }).trim().split('\n')[0]
    expect(fallback).toBe(join(physical, 'dsh-custom-center/douyin'))
  })
  it('runs the video doctor offline and compiles every packaged Python source', async () => {
    const paths = douyinPaths(mkdtempSync(join(tmpdir(), 'douyin-doctor-')))
    const runtime = prepareRuntime(paths)
    const python = process.env.DOUYIN_TEST_PYTHON || 'python3'
    const doctor = await runCommand(python, ['-B', join(resources.video, 'run.py'), 'doctor'], { env: runtime.env(), cwd: tmpdir() })
    expect(JSON.parse(doctor.output)).toMatchObject({ ok: true, automaticModelBackend: false })
    const compile = 'import pathlib,sys; files=list(pathlib.Path(sys.argv[1]).rglob("*.py")); [compile(p.read_text(encoding="utf-8"),str(p),"exec") for p in files]; print(len(files))'
    const result = await runCommand(python, ['-B', '-c', compile, resources.root], { env: runtime.env() })
    expect(Number(result.output.trim())).toBe(10)
    const registration = await runCommand(python, ['-B', join(import.meta.dirname, 'python-runtime.py'), resources.root], {
      env: runtime.env({ ...process.env, DOUYIN_ALLOW_WRITES: '', DOUYIN_MCP_TOOLS: '' }),
    })
    expect(JSON.parse(registration.output)).toMatchObject({ ok: true, writes: false })
  })
  it('passes only explicit process environment and handles errors, timeouts and cancellation', async () => {
    const env = { ...process.env, DSH_DOUYIN_HOME: 'isolated' }
    expect((await runCommand(process.execPath, ['-e', 'console.log(process.env.DSH_DOUYIN_HOME)'], { env })).output.trim()).toBe('isolated')
    await expect(runCommand(process.execPath, ['-e', 'process.exit(4)'], { env })).rejects.toThrow('4')
    await expect(runCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { env, timeoutMs: 20 })).rejects.toThrow('超时')
    const controller = new AbortController()
    controller.abort()
    await expect(runCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { env, signal: controller.signal })).rejects.toThrow('取消')
  })
})
