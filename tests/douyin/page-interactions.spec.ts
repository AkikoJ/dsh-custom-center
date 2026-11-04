import { beforeEach, describe, expect, it, vi } from 'vitest'
const harness = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, disposers: [] as (() => void)[], resources: {} as Record<string, unknown>, refresh: vi.fn(), run: vi.fn() }))
vi.mock('react', async (original) => ({ ...await original<typeof import('react')>(),
 useState(initial: unknown) { const slot = harness.cursor++; if (!(slot in harness.values)) harness.values[slot] = initial; return [harness.values[slot], (value: unknown) => { harness.values[slot] = typeof value === 'function' ? value(harness.values[slot]) : value }] },
 useRef(initial: unknown) { const slot = harness.cursor++; if (!(slot in harness.values)) harness.values[slot] = { current: initial }; return harness.values[slot] },
 useId: () => 'page-', useContext: () => (key: string) => key,
 useEffect(effect: () => void | (() => void)) { const dispose = effect(); if (dispose) harness.disposers.push(dispose) },
}))
vi.mock('../../src/douyin/client/state.js', () => ({ useResource: (path: string) => ({ data: harness.resources[path] ?? null, error: '', refresh: harness.refresh }), useActions: () => ({ busy: '', error: '', result: null, run: harness.run }) }))
import { Daily } from '../../src/douyin/client/Daily.js'
import { Publication } from '../../src/douyin/client/Publication.js'
import { WatchedVideos } from '../../src/douyin/client/WatchedVideos.js'
type Node = { type?: unknown; props?: { children?: unknown; [key: string]: any } }
function nodes(value: unknown): Node[] { if (Array.isArray(value)) return value.flatMap(nodes); if (!value || typeof value !== 'object') return []; const node = value as Node; return [node, ...nodes(node.props?.children)] }
function text(value: unknown): string { if (Array.isArray(value)) return value.map(text).join(''); if (typeof value === 'string' || typeof value === 'number') return String(value); return value && typeof value === 'object' ? text((value as Node).props?.children) : '' }
function render<T>(component: () => T) { harness.cursor = 0; return component() }
function button(tree: unknown, label: string) { const value = nodes(tree).find((node) => node.type === 'button' && text(node) === label); if (!value) throw new Error('Button missing: ' + label); return value.props! }
beforeEach(() => { for (const dispose of harness.disposers.splice(0)) dispose(); harness.values = []; harness.cursor = 0; harness.resources = {}; harness.refresh.mockReset(); harness.run.mockReset() })
describe('visible page interactions', () => {
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
