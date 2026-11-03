import { describe, expect, it } from 'vitest'
import baseline from './fixtures/upstream-contract.json'

describe('固定抖音来源合同', () => {
  it('记录完整源版本和文件清单', () => {
    expect(baseline.source.commit).toBe('aaf9f9a862afafd45a15acf32789da97688de695')
    expect(baseline.source.package).toBe('dsh-douyin-life')
    expect(baseline.source.version).toBe('0.2.9')
    expect(baseline.files).toHaveLength(52)
    expect(baseline.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true)
  })

  it('冻结全部工具、配置、路由和页面合同', () => {
    expect(baseline.tools).toHaveLength(35)
    expect(new Set(baseline.tools.map((tool) => tool.name)).size).toBe(35)
    expect(baseline.config).toHaveLength(74)
    expect(baseline.config.every((field) => field.expression.includes(".extra('volatile', true)"))).toBe(true)
    expect(baseline.routes).toHaveLength(32)
    expect(baseline.tabs).toHaveLength(7)
    expect(baseline.pluginId).toBe('douyin-life')
    expect(baseline.settingsId).toBe('douyin-life')
    expect(baseline.conversationViewId).toBe('douyin-watched')
  })
})
