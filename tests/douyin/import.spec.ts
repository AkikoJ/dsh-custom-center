import { mkdtempSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importLegacy } from '../../src/douyin/server/import-legacy'
import { readRequiredObject, writeJson } from '../../src/douyin/server/storage'

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'douyin-import-')))
  const source = join(root, 'legacy'), target = join(root, 'new')
  mkdirSync(source)
  return { source, target, legacyStopped: true }
}
const put = (root: string, path: string, content: string) => {
  const pieces = path.split('/')
  mkdirSync(join(root, ...pieces.slice(0, -1)), { recursive: true })
  writeFileSync(join(root, path), content)
}
describe('离线旧目录导入', () => {
  it('保留源与自定义内容，重组全部持久状态并要求重建虚拟环境', () => {
    const options = fixture()
    const config = { pythonPath: join(options.source, '.venv/bin/python'),
      workspace: options.source, dshBin: '/custom/dsh', comfyOutputDir: '/custom/videos' }
    put(options.source, 'config.json', JSON.stringify(config))
    for (const [path, content] of Object.entries({
      'ledger.json': '{"actions":{"key":{"status":"unknown"}}}',
      'state.json': '{}', 'memory/2026-11.md': '记忆', 'out/2026-11-03.md': '日报',
      'browser/Default/Cookies': 'fixture-cookie', 'dm-cursors.json': '{"Peer":{"status":"pending"}}',
      'mcp_server.py': '# custom script', 'persona.md': 'custom persona', 'custom.data': 'custom',
      '.venv/bin/python': 'unusable environment', 'thumbs/123.jpg': 'thumbnail',
    })) put(options.source, path, content)
    const result = importLegacy(options)
    expect(result.completedAt).toBeTruthy()
    expect(result.python).toBe('rebuild-required')
    expect(existsSync(join(options.target, 'python/.venv/bin/python'))).toBe(false)
    expect(JSON.parse(readFileSync(join(options.target, 'config/config.json'), 'utf8')))
      .toEqual({ ...config, pythonPath: 'python', workspace: options.target })
    expect(readFileSync(join(options.target, 'runtime/mcp_server.py'), 'utf8')).toBe('# custom script')
    expect(readFileSync(join(options.target, 'browser/Default/Cookies'), 'utf8')).toBe('fixture-cookie')
    expect(readFileSync(join(options.target, 'state/legacy/custom.data'), 'utf8')).toBe('custom')
    expect(JSON.parse(readFileSync(join(options.source, 'config.json'), 'utf8'))).toEqual(config)
    expect(importLegacy(options).completedAt).toBe(result.completedAt)
    writeFileSync(join(options.target, 'prompts/persona.md'), 'changed target')
    expect(importLegacy(options).completedAt).toBeUndefined()
    expect(existsSync(join(options.target, 'legacy-import.complete.json'))).toBe(false)
  })

  it('复制中断后从清单恢复，不覆盖目标冲突或提前写完成标记', () => {
    const options = fixture()
    put(options.source, 'a.txt', 'a')
    put(options.source, 'b.txt', 'b')
    expect(() => importLegacy({ ...options, afterCopy: () => { throw new Error('interrupted') } })).toThrow('interrupted')
    expect(existsSync(join(options.target, 'legacy-import.complete.json'))).toBe(false)
    put(options.target, 'state/legacy/b.txt', 'existing')
    const partial = importLegacy(options)
    expect(partial.entries.find((entry) => entry.source === 'a.txt')?.status).toBe('identical')
    expect(partial.entries.find((entry) => entry.source === 'b.txt')?.status).toBe('conflict')
    expect(partial.completedAt).toBeUndefined()
    expect(readFileSync(join(options.target, 'state/legacy/b.txt'), 'utf8')).toBe('existing')
  })

  it('拒绝活跃任务、浏览器、路径嵌套、符号链接和变化的源数据', () => {
    const active = fixture()
    mkdirSync(join(active.source, '.action-lock'))
    expect(() => importLegacy(active)).toThrow(/active/)
    const browser = fixture()
    put(browser.source, 'browser/SingletonLock', 'owner')
    expect(() => importLegacy(browser)).toThrow(/active/)
    const nested = fixture()
    expect(() => importLegacy({ ...nested, target: join(nested.source, 'child') })).toThrow(/separate/)
    expect(() => importLegacy({ ...fixture(), legacyStopped: false })).toThrow(/Stop/)
    const linked = fixture()
    symlinkSync('/etc/passwd', join(linked.source, 'link'))
    expect(() => importLegacy(linked)).toThrow(/symbolic/i)
    const changed = fixture()
    put(changed.source, 'a.txt', 'old')
    expect(() => importLegacy({ ...changed, afterCopy: () => { throw new Error('stop') } })).toThrow('stop')
    put(changed.source, 'a.txt', 'new')
    expect(() => importLegacy(changed)).toThrow(/changed/)
  })

  it('损坏账本必须阻止发送，原子写入产生受限的完整 JSON', () => {
    const options = fixture()
    const path = join(options.source, 'ledger.json')
    writeFileSync(path, '{broken')
    expect(() => readRequiredObject(path)).toThrow('账本损坏')
    writeJson(path, { actions: { a: { status: 'unknown' } } })
    expect(readRequiredObject(path)).toEqual({ actions: { a: { status: 'unknown' } } })
  })
})
