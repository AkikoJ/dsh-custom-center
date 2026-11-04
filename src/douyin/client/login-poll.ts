import { request } from './api.js'

/** One bounded polling session owns its request and both timers. */
export function pollLogin(onSuccess: () => void, onStatus: (value: string) => void, timeoutMs = 180000) {
  let stopped = false, timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined
  const stop = () => { stopped = true; clearTimeout(timer); clearTimeout(deadline); controller?.abort() }
  const deadline = setTimeout(() => { if (stopped) return; stop(); onStatus('二维码等待超时，请重新获取') }, timeoutMs)
  const check = async () => {
    if (stopped) return
    controller = new AbortController()
    try {
      const value = await request('/login/poll', {}, controller.signal)
      if (stopped) return
      if (value.loggedIn === true) { stop(); onStatus('登录成功'); onSuccess(); return }
      onStatus('等待扫码确认')
    } catch { if (!stopped) onStatus('暂时读不到登录状态，稍后重试') }
    if (!stopped) timer = setTimeout(() => void check(), 3000)
  }
  timer = setTimeout(() => void check(), 3000)
  return stop
}
