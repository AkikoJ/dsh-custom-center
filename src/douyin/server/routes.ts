import type { IncomingMessage, ServerResponse } from 'node:http'
import { isLoopbackAddress, MARKER_HEADER } from '../../shared/request.ts'
import type { WebRoute } from '../../shared/host-env.ts'
import type { DouyinAction } from '../contracts.ts'
import type { DouyinLoginService } from './service.ts'

interface RouteOptions {
  service: DouyinLoginService
  reject(req: IncomingMessage): 401 | 403 | undefined
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(text)
}

/** No route accepts a path, URL, executable, script or credential payload. */
export function createDouyinRoutes(options: RouteOptions): WebRoute[] {
  return (['status', 'open', 'check', 'close'] as const).map((action: DouyinAction) => ({
    kind: 'exact', path: `/custom-center/douyin/${action}`,
    async handler(req, res) {
      try {
        if (!isLoopbackAddress(req.socket.remoteAddress)) { json(res, 403, { error: 'forbidden' }); return }
        const rejection = options.reject(req)
        if (rejection !== undefined) { json(res, rejection, { error: rejection === 401 ? 'unauthorized' : 'forbidden' }); return }
        if (req.headers[MARKER_HEADER] !== '1') { json(res, 403, { error: 'forbidden' }); return }
        if (req.method !== (action === 'status' ? 'GET' : 'POST')) { json(res, 405, { error: 'method-not-allowed' }); return }
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (url.search || req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0) !== 0) {
          json(res, 400, { error: 'invalid-input' }); return
        }
        json(res, 200, await options.service[action]())
      } catch {
        if (res.headersSent) res.destroy()
        else json(res, 503, { error: 'unavailable' })
      }
    },
  }))
}
