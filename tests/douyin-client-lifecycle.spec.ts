import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DouyinAction, DouyinStatus } from '../src/douyin/contracts.ts'
import { createAccountController } from '../src/douyin/client/controller.ts'

const initial: DouyinStatus = {
  window: 'closed', phase: 'idle', browserAuth: 'unverified', persistence: 'none', observation: 'idle', http: { state: 'unverified' },
}
const controllers: Array<ReturnType<typeof createAccountController>> = []
afterEach(() => { controllers.splice(0).forEach((controller) => controller.dispose()); vi.useRealTimers() })

function setup() {
  const requests: Array<{ action: DouyinAction; signal: AbortSignal; resolve(value: DouyinStatus): void }> = []
  const controller = createAccountController((action, signal) => new Promise<DouyinStatus>((resolve) => {
    requests.push({ action, signal: signal!, resolve })
  }))
  controllers.push(controller)
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
  return { controller, requests, flush }
}

describe('抖音账号页面请求生命周期', () => {
  it('挂载仅查询状态；卸载中止请求，迟到结果不更新页面也不重启轮询', async () => {
    vi.useFakeTimers()
    const { controller, requests, flush } = setup()
    const updates = vi.fn()
    controller.subscribe(updates)
    controller.mount()
    expect(requests.map((request) => request.action)).toEqual(['status'])
    controller.dispose()
    expect(requests[0]!.signal.aborted).toBe(true)
    requests[0]!.resolve(initial)
    await flush()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(updates).not.toHaveBeenCalled()
    expect(requests).toHaveLength(1)
  })

  it('旧状态查询不能覆盖开窗结果；重挂载只建立一条刷新链', async () => {
    vi.useFakeTimers()
    const { controller, requests, flush } = setup()
    controller.mount()
    const opening = controller.act('open')
    requests[1]!.resolve({ ...initial, window: 'open', browserAuth: 'waiting' })
    await opening
    requests[0]!.resolve(initial)
    await flush()
    expect(controller.snapshot().status?.window).toBe('open')
    controller.dispose()
    controller.mount()
    controller.mount()
    expect(requests).toHaveLength(3)
    requests[2]!.resolve(initial)
    await flush()
    await vi.advanceTimersByTimeAsync(3_000)
    expect(requests).toHaveLength(4)
    requests[3]!.resolve(initial)
    await flush()
    await vi.advanceTimersByTimeAsync(3_000)
    expect(requests).toHaveLength(5)
  })

  it('检查进行中仍可关闭，旧检查结果不能覆盖关闭结果', async () => {
    const { controller, requests, flush } = setup()
    controller.mount()
    requests[0]!.resolve({ ...initial, window: 'open' })
    await flush()
    const checking = controller.act('check')
    const closing = controller.act('close')
    expect(requests.map((request) => request.action)).toEqual(['status', 'check', 'close'])
    requests[2]!.resolve(initial)
    await closing
    requests[1]!.resolve({ ...initial, window: 'open', browserAuth: 'verified' })
    await checking
    expect(controller.snapshot()).toMatchObject({ busy: false, status: { window: 'closed', browserAuth: 'unverified' } })
  })
})
