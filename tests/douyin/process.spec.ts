import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runCommand } from '../../src/douyin/server/process.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
describe('owned command termination', () => {
  it('waits for delayed SIGTERM cleanup before rejecting cancellation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'douyin-command-')); roots.push(root)
    const ready = join(root, 'ready'), closed = join(root, 'closed'), controller = new AbortController()
    const script = `const fs=require('node:fs');process.on('SIGTERM',()=>setTimeout(()=>{fs.writeFileSync(process.argv[2],'done');process.exit(0)},60));fs.writeFileSync(process.argv[1],String(process.pid));console.log('ready');setInterval(()=>{},1000)`
    const task = runCommand(process.execPath, ['-e', script, ready, closed], { env: { ...process.env }, signal: controller.signal, onData: () => controller.abort() })
    await expect(task).rejects.toThrow('取消')
    expect(existsSync(closed)).toBe(true)
    expect(() => process.kill(Number(readFileSync(ready, 'utf8')), 0)).toThrow()
  })
  it('retains the bounded output and reports spawn failures', async () => {
    expect(await runCommand(process.execPath, ['-e', 'process.stdout.write("a".repeat(11000))'], { env: { ...process.env } })).toMatchObject({ code: 0, output: 'a'.repeat(10000) })
    await expect(runCommand('/missing/douyin-command', [], { env: {} })).rejects.toThrow('ENOENT')
    const abort = new AbortController(); abort.abort()
    await expect(runCommand(process.execPath, [], { env: {}, signal: abort.signal })).rejects.toThrow('取消')
  })
})
