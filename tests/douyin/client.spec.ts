import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import baseline from './fixtures/upstream-contract.json'
import { apply, inject } from '../../src/douyin/client/index.js'
import { FIELDS } from '../../src/douyin/client/fields.js'
import { dictionaries } from '../../src/douyin/client/messages.js'
import { ConfigFields } from '../../src/douyin/client/controls.js'
import { groupVideos } from '../../src/douyin/client/WatchedVideos.js'
import { platformUrl, request, imageUrl } from '../../src/douyin/client/api.js'
import { TABS } from '../../src/douyin/contracts.js'
import { MARKER_HEADER } from '../../src/shared/request.js'

afterEach(() => vi.unstubAllGlobals())
describe('Douyin browser boundary and public UI contract', () => {
 it('covers every public setting once across seven tabs with balanced translations and labeled controls', () => {
  expect(FIELDS.map((field) => field.key).sort()).toEqual(baseline.config.filter((field) => field.name !== 'memory').map((field) => field.name).sort())
  expect(new Set(FIELDS.map((field) => field.key)).size).toBe(73)
  expect(TABS.map(([id]) => id)).toEqual(['daily','pref','like','dm','sticker','persona','adv'])
  expect(Object.keys(dictionaries['en-US']).sort()).toEqual(Object.keys(dictionaries['zh-CN']).sort())
  for (const [tab] of TABS) {
   const markup = renderToStaticMarkup(createElement(ConfigFields, { tab, draft: {}, set: () => {} }))
   expect((markup.match(/<label /g) || []).length).toBe(FIELDS.filter((field) => field.tab === tab).length)
   for (const field of FIELDS.filter((field) => field.tab === tab)) { expect(dictionaries['en-US'][field.label]).toBe(field.en); expect(markup).toContain(field.label) }
  }
 })
 it('registers independent page and conversation IDs and releases all effects', async () => {
  expect(inject).not.toContain('connection')
   const ctx = new Context(), entries: string[] = [], disposed: string[] = [], locales: string[] = []
   const active = new Set([baseline.settingsId, baseline.conversationViewId])
  ctx.provide('slots', { inject: (_key: string, run: () => () => void) => run(), register: (entry: { id: string }) => { if (active.has(entry.id)) throw new Error('duplicate slot: ' + entry.id); active.add(entry.id); entries.push(entry.id); return () => { active.delete(entry.id); disposed.push(entry.id) } } })
  ctx.provide('locale', { bind: () => (key: string) => key, register: (_ns: string, locale: string) => { locales.push(locale); return () => { locales.splice(locales.indexOf(locale), 1) } } })
  apply(ctx)
  expect(entries).toEqual(['custom-center-douyin', 'custom-center-douyin-watched']); expect(locales).toEqual(['zh-CN','en-US'])
  await ctx.fiber.dispose(); expect(disposed.sort()).toEqual(entries.sort()); expect(locales).toEqual([])
   expect([...active]).toEqual([baseline.settingsId, baseline.conversationViewId])
 })
 it('marks reads and writes, keeps credentials same-origin and preserves cancellation', async () => {
  const fetcher = vi.fn(async () => Response.json({ ok: true })); vi.stubGlobal('fetch', fetcher)
  const signal = new AbortController().signal
  await request('/status', undefined, signal); await request('/config', { patch: { perDay: 2 } }, signal)
  expect(fetcher.mock.calls[0]).toEqual(['/api/custom-center/douyin/status', expect.objectContaining({ method: 'GET', credentials: 'same-origin', headers: { [MARKER_HEADER]: '1' }, signal })])
  expect(fetcher.mock.calls[1]).toEqual(['/api/custom-center/douyin/config', expect.objectContaining({ method: 'POST', body: '{"patch":{"perDay":2}}', signal })])
 })
 it('shows explicit HTTP and application failures instead of treating them as success', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false, error: 'quota exhausted' })))
  await expect(request('/run', {})).rejects.toThrow('quota exhausted')
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'unauthorized' }, { status: 401 })))
  await expect(request('/status')).rejects.toThrow('unauthorized')
 })
 it('loads thumbnails with the same marker and rejects arbitrary asset addresses', async () => {
  const fetcher = vi.fn(async () => new Response(new Blob(['png'], { type: 'image/png' }), { headers: { 'content-type': 'image/png' } })); vi.stubGlobal('fetch', fetcher)
  const signal = new AbortController().signal, url = await imageUrl('1234567890123456789', 'thumb', signal)
  expect(fetcher.mock.calls[0]).toEqual(['/api/custom-center/douyin/thumb?id=1234567890123456789', expect.objectContaining({ headers: { [MARKER_HEADER]: '1' }, signal })]); URL.revokeObjectURL(url)
  await expect(imageUrl('../secret', 'cover', signal)).rejects.toThrow()
  expect(fetcher).toHaveBeenCalledOnce()
 })
 it('orders dates and accepts only safe platform work links', () => {
  expect(groupVideos([{ day: '2026-01-01' }, { day: '2026-02-01' }, { day: '2026-01-01' }]).map(([day, list]) => [day, list.length])).toEqual([['2026-02-01',1],['2026-01-01',2]])
  for (const url of ['javascript:alert(1)', 'https://evil.example/video/123', 'https://www.douyin.com@evil.example/video/123', 'https://www.douyin.com/settings']) expect(platformUrl(url, '')).toBeUndefined()
  expect(platformUrl('', '123456')).toBe('https://www.douyin.com/video/123456')
 })
})
