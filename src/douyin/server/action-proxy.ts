import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { isLoopbackAddress } from '../../shared/request.js'
import { errorMessage } from './storage.js'
import { object } from './ledger-model.js'
import type { ToolArgs } from './action-policy.js'

export interface ActionProxyOptions {
  allowed(): ReadonlySet<string>
  execute(name: string, args: ToolArgs): Promise<unknown>
}
/** One short-lived headless run owns the credential; account policy remains in the executor. */
export async function createActionProxy(options: ActionProxyOptions) {
  const token = randomBytes(32).toString('hex')
  const expected = Buffer.from(token)
  let closed = false
  const server = createServer(async (request, response) => {
    const send = (code: number, value: unknown) => {
      if (!response.writableEnded) {
        response.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        response.end(JSON.stringify(value))
      }
    }
    const supplied = Buffer.from(String(request.headers.authorization || '').replace(/^Bearer /, ''))
    if (closed || !isLoopbackAddress(request.socket.remoteAddress) || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(403, { ok: false, error: '代理凭据无效' })
    if (request.method !== 'POST' || request.url !== '/action') return send(404, { ok: false, error: '没有该代理接口' })
    try {
      const chunks: Buffer[] = []
      let bytes = 0
      for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        bytes += buffer.length
        if (bytes > 65536) return send(413, { ok: false, error: '请求过大' })
        chunks.push(buffer)
      }
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!object(body) || typeof body.name !== 'string' || !options.allowed().has(body.name)) return send(403, { ok: false, error: '工具未授权' })
      if (!object(body.args)) return send(400, { ok: false, error: '参数必须为对象' })
      const args = Object.fromEntries(Object.entries(body.args).filter(([key]) => !['force', '__proto__', 'constructor', 'prototype'].includes(key)))
      send(200, await options.execute(body.name, args))
    } catch (error) { send(500, { ok: false, status: 'unknown', error: errorMessage(error) }) }
  })
  server.requestTimeout = 30000
  server.headersTimeout = 10000
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  server.unref()
  const address = server.address()
  if (!address || typeof address === 'string') { server.close(); throw new Error('代理未绑定本地端口') }
  let closing: Promise<void> | undefined
  return {
    token, url: `http://127.0.0.1:${address.port}/action`,
    close(): Promise<void> {
      closed = true
      closing ??= new Promise<void>((resolve) => { server.close(() => resolve()); server.closeIdleConnections() })
      return closing
    },
  }
}
