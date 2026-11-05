import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveDouyinHome, douyinPaths, legacyRelativePath } from '../../src/douyin/server/paths'
import { createConfiguration } from '../../src/douyin/server/configuration'
import { clampPatch, normalizeConfig } from '../../src/douyin/server/config-rules'
import { DEFAULTS, Config } from '../../src/douyin/config'
import baseline from './fixtures/upstream-contract.json'

const home = () => mkdtempSync(join(tmpdir(), 'douyin-config-'))
describe('抖音路径与配置', () => {
  it('统一显式路径、DSH_HOME 和用户目录回退，不依赖 cwd', () => {
    expect(resolveDouyinHome({ DSH_CUSTOM_CENTER_DOUYIN_HOME: '/custom', DSH_DOUYIN_HOME: '/legacy', DSH_HOME: '/dsh' }, '/user')).toBe('/custom')
    expect(resolveDouyinHome({ DSH_HOME: '/dsh', DSH_DOUYIN_HOME: '/legacy' }, '/user')).toBe('/dsh/dsh-custom-center/douyin')
    expect(resolveDouyinHome({}, '/user')).toBe('/user/.dsh/dsh-custom-center/douyin')
    const paths = douyinPaths('/fixture')
    const base = { DSH_HOME: '/dsh', KEEP: 'yes' }
    expect(paths.childEnv(base)).toMatchObject({ DSH_DOUYIN_HOME: '/fixture',
      TMPDIR: '/fixture/cache/tmp', UV_CACHE_DIR: '/fixture/cache/uv', KEEP: 'yes' })
    expect(base).toEqual({ DSH_HOME: '/dsh', KEEP: 'yes' })
    expect(paths.browser).toBe('/fixture/browser')
    expect(paths.config).toBe('/fixture/config/config.json')
    expect(() => legacyRelativePath('../secret')).toThrow()
    expect(() => legacyRelativePath('/absolute')).toThrow()
  })

  it('保留上游公共字段并增加显式无限额配置', () => {
    expect(Object.keys(Config.dict ?? {}).sort()).toEqual([...baseline.config.filter((field) => field.name !== 'memory').map((field) => field.name), 'dmReplyPerContactUnlimited', 'dmReplyPerDayUnlimited'].sort())
    for (const field of Object.values(Config.dict ?? {})) expect(field.meta?.volatile).toBe(true)
    expect(normalizeConfig({ autoLike: { value: true }, perDay: -1, keywords: ['猫', 2] }))
      .toMatchObject({ autoLike: false, perDay: 5, keywords: ['猫'] })
    expect(clampPatch({ dmReplyPerContactUnlimited: true, dmReplyPerDayUnlimited: true, dmReplyPerContact: 0, dmReplyPerDay: 2000 })).toMatchObject({ dmReplyPerContactUnlimited: true, dmReplyPerDayUnlimited: true, dmReplyPerContact: 0, dmReplyPerDay: 2000 })
    expect(DEFAULTS.autoPublish).toBe(false)
    expect(DEFAULTS.publishDraft).toBe(true)
  })

  it('严格拒绝类型和未知字段，并保留原范围与零值规则', () => {
    for (const patch of [{ unknown: 1 }, { autoLike: 1 }, { perDay: '5' }, { keywords: [1] }, { cdpPort: -1 }]) {
      expect(() => clampPatch(patch)).toThrow()
    }
    expect(clampPatch({ perDay: 80, commentPerDay: 90, replyPerDay: 9999,
      comfyWaitSeconds: 0, watchSeconds: 0, cdpPort: 0, dmReplyPerDay: 0,
      reportLevel: 'bad', keywords: ['猫', ' ', '狗'], replyVideoIds: 'x123, abc456' }))
      .toMatchObject({ perDay: 50, commentPerDay: 50, replyPerDay: 1000,
        comfyWaitSeconds: 900, watchSeconds: 90, cdpPort: 9223, dmReplyPerDay: 0,
        reportLevel: 'full', keywords: ['猫', '狗'], replyVideoIds: '123, 456' })
  })

  it('宿主冲突时重取 revision，并在失败时保留本地优先键', async () => {
    const file = join(home(), 'config.json')
    const calls: number[] = []
    let fail = true
    const config = createConfiguration({ file, settings: {
      describe: () => [{ ns: 'custom-center-douyin', revision: calls.length + 1,
        value: DEFAULTS, user: { autoLike: false } }],
      async update(_ns, _patch, revision) {
        calls.push(revision!)
        if (fail) throw new Error(calls.length === 1 ? 'stale revision' : 'host offline')
      },
    } })
    const saved = await config.persist({ autoLike: true })
    expect(saved.host.ok).toBe(false)
    expect(calls).toEqual([1, 2])
    expect(config.refresh().autoLike).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf8'))._localOnly).toContain('autoLike')
    fail = false
    expect((await config.persist({ autoLike: false })).host.ok).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf8'))._localOnly).not.toContain('autoLike')
  })

  it('加载器初值作为回退，本地文件与宿主显式值依次优先', () => {
    const file = join(home(), 'config.json')
    writeFileSync(file, JSON.stringify({ perDay: 7 }))
    const config = createConfiguration({ file, initial: { perDay: 9, autoLike: true }, settings: {
      describe: () => [{ ns: 'custom-center-douyin', value: DEFAULTS, user: { perDay: 11 } }], async update() {},
    } })
    expect(config.refresh()).toMatchObject({ perDay: 11, autoLike: true })
  })

  it('串行持久化，保存中本地优先，完成后重取宿主缓存', async () => {
    const file = join(home(), 'config.json'), user = { perDay: 3 }
    const releases: (() => void)[] = [], calls: number[] = []
    const config = createConfiguration({ file, settings: {
      describe: () => [{ ns: 'custom-center-douyin', value: DEFAULTS, user: { ...user } }],
      async update(_ns, patch) { const value = (patch as { perDay: number }).perDay; calls.push(value); await new Promise<void>((done) => releases.push(done)); user.perDay = value },
    } })
    expect(config.refresh().perDay).toBe(3)
    const first = config.persist({ perDay: 8 }), second = config.persist({ perDay: 9 })
    await Promise.resolve(); expect(calls).toEqual([8]); expect(config.refresh().perDay).toBe(8)
    releases.shift()!(); await first
    await Promise.resolve(); expect(calls).toEqual([8, 9]); expect(config.refresh().perDay).toBe(9)
    releases.shift()!(); await second
    expect(config.refresh().perDay).toBe(9)
    await expect(config.persist({ unknown: true })).rejects.toThrow()
    const third = config.persist({ perDay: 10 }); await Promise.resolve(); releases.shift()!(); await third
    expect(config.refresh().perDay).toBe(10)
  })

  it('两套设置同时存在时只读写中心版行', async () => {
    const file = join(home(), 'config.json'), writes: unknown[][] = []
    const config = createConfiguration({ file, settings: {
      describe: () => [
        { ns: 'douyin-life', revision: 19, value: DEFAULTS, user: { perDay: 49 } },
        { ns: 'custom-center-douyin', revision: 7, value: DEFAULTS, user: { perDay: 6 } },
      ],
      async update(...args) { writes.push(args) },
    } })
    expect(config.refresh().perDay).toBe(6)
    expect((await config.persist({ perDay: 8 })).host.ok).toBe(true)
    expect(writes).toEqual([['custom-center-douyin', { perDay: 8 }, 7]])
  })

  it('仅读取同名设置行，配置对象身份保持稳定', () => {
    const directory = home()
    mkdirSync(join(directory, 'config'))
    const file = join(directory, 'config/config.json')
    writeFileSync(file, JSON.stringify({ perDay: 7 }))
    const config = createConfiguration({ file, settings: {
      describe: () => [{ ns: 'douyin-life', value: DEFAULTS, user: { perDay: 50 } }],
      async update() {},
    } })
    const identity = config.current
    expect(config.refresh().perDay).toBe(7)
    expect(config.current).toBe(identity)
  })
})
