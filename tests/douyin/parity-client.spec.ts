import { afterEach, describe, expect, it, vi } from 'vitest'
import { pollLogin } from '../../src/douyin/client/login-poll.js'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConfigFields, Result } from '../../src/douyin/client/controls.js'
import type { Data } from '../../src/douyin/client/api.js'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('bounded sign-in polling', () => {
  it('waits three seconds, retries transient failures, stops after success and refreshes once', async () => {
    vi.useFakeTimers(); const success = vi.fn(), status = vi.fn()
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce(Response.json({ ok: true, loggedIn: false })).mockResolvedValueOnce(Response.json({ ok: true, loggedIn: true }))
    vi.stubGlobal('fetch', fetcher); pollLogin(success, status)
    expect(fetcher).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(3000); expect(status).toHaveBeenLastCalledWith(expect.stringContaining('重试'))
    await vi.advanceTimersByTimeAsync(3000); expect(success).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(3000); expect(success).toHaveBeenCalledOnce()
    expect(status).toHaveBeenLastCalledWith('登录成功'); expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(30000); expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('times out even with a hung request, aborts it, and allows a fresh session', async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url, options) => { signal = options.signal; return new Promise(() => {}) }))
    const success = vi.fn(), status = vi.fn(); pollLogin(success, status, 6000)
    await vi.advanceTimersByTimeAsync(6000)
    expect(signal?.aborted).toBe(true); expect(status).toHaveBeenLastCalledWith(expect.stringContaining('超时')); expect(success).not.toHaveBeenCalled()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true, loggedIn: true })))
    pollLogin(success, status); await vi.advanceTimersByTimeAsync(3000); expect(success).toHaveBeenCalledOnce()
  })
  it('cancels all timers on page exit and suppresses late replies from a replaced QR session', async () => {
    vi.useFakeTimers(); let release!: (value: Response) => void
    const success = vi.fn(), status = vi.fn(), fetcher = vi.fn(() => new Promise<Response>((resolve) => { release = resolve }))
    vi.stubGlobal('fetch', fetcher); const stop = pollLogin(success, status)
    await vi.advanceTimersByTimeAsync(3000); stop(); release(Response.json({ ok: true, loggedIn: true })); await vi.advanceTimersByTimeAsync(0)
    expect(success).not.toHaveBeenCalled(); expect(status).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
  })
})
describe('visible settings and diagnostics', () => {
  it('conditionally hides dependent controls and explains one-shot IDs separately from permanent deduplication', () => {
    const render = (draft: Data) => renderToStaticMarkup(createElement(ConfigFields, { tab: 'like', draft, set: () => {} }))
    const off = render({ autoReply: false, autoPublish: false, autoComment: false })
    expect(off).not.toContain('指定回复作品只用一次'); expect(off).not.toContain('每日投稿上限'); expect(off).not.toContain('要提及谁')
    const on = render({ autoReply: true }); expect(on).toContain('指定回复作品只用一次'); expect(on).toContain('不控制永久回复去重')
  })
  it('exposes failure details and fixes above the diagnostic disclosure', () => {
    const markup = renderToStaticMarkup(createElement(Result, { value: { ok: false, items: [{ name: 'Python', ok: false, detail: 'missing dependency', fix: '重新安装' }] } }))
    expect(markup.indexOf('missing dependency')).toBeLessThan(markup.indexOf('<details'))
    expect(markup.indexOf('重新安装')).toBeLessThan(markup.indexOf('<details'))
  })
})
