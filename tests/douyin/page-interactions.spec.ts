import { beforeEach, describe, expect, it, vi } from 'vitest'
const harness = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, disposers: [] as (() => void)[], resources: {} as Record<string, unknown>, refresh: vi.fn(), run: vi.fn() }))
vi.mock('react', async (original) => ({ ...await original<typeof import('react')>(),
 useState(initial: unknown) { const slot = harness.cursor++; if (!(slot in harness.values)) harness.values[slot] = initial; return [harness.values[slot], (value: unknown) => { harness.values[slot] = typeof value === 'function' ? value(harness.values[slot]) : value }] },
 useRef(initial: unknown) { const slot = harness.cursor++; if (!(slot in harness.values)) harness.values[slot] = { current: initial }; return harness.values[slot] },
 useId: () => 'page-', useContext: () => (key: string) => key,
 useEffect(effect: () => void | (() => void)) { const dispose = effect(); if (dispose) harness.disposers.push(dispose) },
}))
vi.mock('../../src/douyin/client/state.js', () => ({ useResource: (path: string) => ({ data: harness.resources[path] ?? null, error: '', refresh: harness.refresh }), useActions: () => ({ busy: '', error: '', result: null, run: harness.run }) }))
import { PersonaPanel } from '../../src/douyin/client/PersonaPanel.js'
import { Daily } from '../../src/douyin/client/Daily.js'
import { Home } from '../../src/douyin/client/Home.js'
import { AccountAvatar } from '../../src/douyin/client/AccountAvatar.js'
import { Publication } from '../../src/douyin/client/Publication.js'
import { WatchedVideos } from '../../src/douyin/client/WatchedVideos.js'
import { Environment } from '../../src/douyin/client/Environment.js'
type Node = { type?: unknown; props?: { children?: unknown; [key: string]: any } }
function nodes(value: unknown): Node[] { if (Array.isArray(value)) return value.flatMap(nodes); if (!value || typeof value !== 'object') return []; const node = value as Node; return [node, ...nodes(node.props?.children)] }
function text(value: unknown): string { if (Array.isArray(value)) return value.map(text).join(''); if (typeof value === 'string' || typeof value === 'number') return String(value); return value && typeof value === 'object' ? text((value as Node).props?.children) : '' }
function render<T>(component: () => T) { harness.cursor = 0; return component() }
function button(tree: unknown, label: string) { const value = nodes(tree).find((node) => node.type === 'button' && text(node) === label); if (!value) throw new Error('Button missing: ' + label); return value.props! }
beforeEach(() => { for (const dispose of harness.disposers.splice(0)) dispose(); harness.values = []; harness.cursor = 0; harness.resources = {}; harness.refresh.mockReset(); harness.run.mockReset() })
describe('visible page interactions', () => {
 it('loads and saves manual persona using only the independent persona API', async () => {
  harness.resources['/persona'] = { persona: '原始人设' }; harness.run.mockResolvedValue({ ok: true })
  render(PersonaPanel); let tree = render(PersonaPanel)
  expect(nodes(tree).find((node) => node.type === 'textarea')!.props!.value).toBe('原始人设')
  expect(button(tree, '保存角色设定').disabled).toBe(true)
  nodes(tree).find((node) => node.type === 'textarea')!.props!.onChange({ target: { value: '手动新设定' } })
  tree = render(PersonaPanel); expect(button(tree, '保存角色设定').disabled).toBe(false)
  await button(tree, '保存角色设定').onClick()
  expect(harness.run).toHaveBeenCalledExactlyOnceWith('/persona', { text: '手动新设定' })
  expect(harness.refresh).toHaveBeenCalledTimes(1)
 })
 it('opens actual report content, selects a historical day, and renders the historical response', () => {
  harness.resources['/status'] = { doing: {} }
  harness.resources['/report/latest'] = { dates: ['2026-11-04', '2026-11-01'], report: { text: 'LATEST-REPORT' } }
  harness.resources['/report/latest?date=2026-11-01'] = { dates: ['2026-11-04', '2026-11-01'], report: { text: 'OLD-REPORT' } }
  let tree = render(() => Daily({ dirty: false })); expect(text(tree)).not.toContain('LATEST-REPORT')
  button(tree, '查看日报').onClick(); tree = render(() => Daily({ dirty: false })); expect(text(tree)).toContain('LATEST-REPORT')
  const selector = nodes(tree).find((node) => node.type === 'select')!; expect(text(selector)).toContain('2026-11-01')
  selector.props!.onChange({ target: { value: '2026-11-01' } }); tree = render(() => Daily({ dirty: false }))
  expect(text(tree)).toContain('OLD-REPORT'); expect(text(tree)).not.toContain('LATEST-REPORT')
  button(tree, '收起日报').onClick(); expect(text(render(() => Daily({ dirty: false })))).not.toContain('OLD-REPORT')
 })
 it('uses GET for update checks and the saved default for manual runs; dirty configuration disables running', async () => {
  harness.resources['/status'] = {}; harness.run.mockResolvedValue({ ok: true })
  let tree = render(() => Daily({ dirty: true })); expect(button(tree, '立即刷一轮').disabled).toBe(true)
  tree = render(() => Daily({ dirty: false })); await button(tree, '检查更新').onClick(); await Promise.resolve()
  expect(harness.run).toHaveBeenLastCalledWith('/update/check', undefined)
  await button(tree, '立即刷一轮').onClick(); expect(harness.run).toHaveBeenLastCalledWith('/run', {})
 })
 it('shows the verified account name and online state on the homepage', () => {
  harness.resources['/status'] = { loggedIn: true, doing: {} }
  harness.resources['/account'] = { loggedIn: true, nickname: '真实昵称', hasAvatar: false }
  const tree = render(() => Home({ dirty: false, onConfigure: vi.fn() }))
  expect(text(tree)).toContain('真实昵称'); expect(text(tree)).toContain('在线'); expect(text(tree)).not.toContain('登录方式与验证')
   expect(text(tree)).not.toContain('手机号'); expect(text(tree)).not.toContain('截图登录'); expect(text(tree)).not.toContain('关闭前台登录并切回后台'); expect(text(tree)).not.toContain('正在处理登录'); expect(text(tree)).not.toContain('执行中')
   expect(text(tree)).not.toContain('今日概况'); expect(text(tree)).not.toContain('立即刷一轮'); expect(text(tree)).not.toContain('查看日报'); expect(text(tree)).not.toContain('连接与运行详情'); expect(text(tree)).not.toContain('最近刷过的视频')
   expect(nodes(tree).filter((node) => node.type === AccountAvatar)).toHaveLength(1)
   expect(text(tree)).not.toContain('关闭登录窗口')
 })
   it('shows login methods only while signed out', () => {
   harness.resources['/status'] = { loggedIn: false }
   harness.resources['/account'] = { loggedIn: false, nickname: '未登录账号', hasAvatar: false }
   const tree = render(() => Home({ dirty: false, onConfigure: vi.fn() }))
   expect(text(tree)).toContain('登录方式与验证'); expect(text(tree)).toContain('手机号'); expect(text(tree)).toContain('浏览器登录')
  })
  it('renders only abnormal environment items with official downloads and hides a healthy result', () => {
  harness.resources['/environment'] = { ok: false, issues: [{ id: 'chrome', name: 'Chrome 浏览器与 MCP 连接', fix: '下载 Chrome', download: { label: '下载 Chrome', url: 'https://www.google.com/chrome/' } }] }
  const configure = vi.fn(), tree = render(() => Environment({ dirty: false, onConfigure: configure }))
  expect(text(tree)).toContain('Chrome 浏览器与 MCP 连接'); expect(text(tree)).toContain('下载 Chrome')
  expect(nodes(tree).find((node) => node.type === 'a')!.props!.href).toBe('https://www.google.com/chrome/')
  harness.values = []; harness.resources['/environment'] = { ok: true, issues: [] }
  expect(render(() => Environment({ dirty: false, onConfigure: configure }))).toBeNull()
 })
 it('shows publication counts and the last post from the status doing envelope', () => {
  harness.resources['/status'] = { doing: { todayPublished: 3, lastPublished: { awemeId: '123456' } } }
  harness.resources['/comfy/list'] = { items: [] }
  const tree = render(() => Publication({ draft: {}, dirty: false }))
  expect(text(tree)).toContain('今日投稿：3'); expect(text(tree)).toContain('上次投稿：123456')
 })
 it('collapses the daily video view and expands it with its dated item while the conversation view stays visible', () => {
  harness.resources['/watched?days=14'] = { items: [{ aweme_id: '123456', title: 'WATCHED-VIDEO', day: '2026-11-04' }] }
  let tree = render(() => WatchedVideos({ collapsible: true })); expect(text(tree)).not.toContain('WATCHED-VIDEO')
  const toggle = nodes(tree).find((node) => node.type === 'button' && text(node).includes('看它刷过的视频'))!
  toggle.props!.onClick(); tree = render(() => WatchedVideos({ collapsible: true })); expect(text(tree)).toContain('WATCHED-VIDEO'); expect(text(tree)).toContain('2026-11-04')
  harness.values = []; expect(text(render(() => WatchedVideos({})))).toContain('WATCHED-VIDEO')
 })
})
