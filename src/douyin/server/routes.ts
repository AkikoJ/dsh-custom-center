import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import type { VideoFile } from './comfy.js'

const videoToken = (file: VideoFile) => createHash('sha256').update(JSON.stringify([file.path, file.size, file.mtime])).digest('hex')
import { API_PREFIX } from '../contracts.js'
import { MARKER_HEADER, isLoopbackAddress } from '../../shared/request.js'
import type { WebRoute } from '../../shared/host-env.js'
import { DEFAULTS } from '../config.js'
import type { DouyinRuntime } from './runtime.js'
import { checkUpstreamUpdate } from './update.js'
import { withExecution } from './execution-context.js'
import { object } from './ledger-model.js'
import { errorMessage } from './storage.js'
import { createImageFetcher } from './image-fetch.js'
import { openDirectory, ownedTail, thumbnail } from './http-assets.js'

export const HTTP_METHODS: Readonly<Record<string, readonly string[]>> = {
  '/update/check': ['GET'], '/status': ['GET'], '/thumb': ['GET'], '/memory': ['GET'], '/watched': ['GET'], '/cover': ['GET'], '/comfy/list': ['GET'], '/dm': ['GET'], '/stickers': ['GET'], '/report/latest': ['GET'], '/setup/log': ['GET'], '/log/tail': ['GET'],
  '/config': ['GET', 'POST'], '/login/browser': ['POST'], '/login/browser/close': ['POST'], '/login/qr': ['POST'], '/login/poll': ['POST'], '/run': ['POST'], '/persona': ['POST'], '/publish': ['POST'], '/dm/seen/clear': ['POST'], '/dm/test': ['POST'], '/stickers/tags': ['POST'], '/stickers/test': ['POST'], '/reply/round': ['POST'], '/login/sms': ['POST'], '/login/sms/submit': ['POST'], '/setup': ['POST'], '/selfcheck': ['POST'], '/chrome/open': ['POST'], '/log': ['POST'], '/open': ['POST'],
}
class HttpFailure extends Error { constructor(readonly status: number, message: string) { super(message) } }
function json(res: ServerResponse, status: number, body: unknown) {
  if (res.destroyed || res.writableEnded) return
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(body))
}
async function body(req: IncomingMessage) {
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk)
    if (size > 128 * 1024) throw new HttpFailure(413, '请求超过大小限制')
    chunks.push(Buffer.from(chunk))
  }
  if (!size) return {}
  let value: unknown
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new HttpFailure(400, 'JSON 无效') }
  if (!object(value)) throw new HttpFailure(400, '请求必须是对象')
  return value
}
export function createDouyinRoutes(options: { runtime: DouyinRuntime; reject(req: IncomingMessage): 401 | 403 | undefined; checkUpdate?(): Promise<unknown> }): WebRoute[] {
  const r = options.runtime, fetchImage = createImageFetcher()
  const handlers: Record<string, (data: Record<string, unknown>, query: URLSearchParams, signal: AbortSignal) => unknown> = {
    '/update/check': (_data, _query, signal) => options.checkUpdate?.() ?? checkUpstreamUpdate(fetch, signal),
    '/status': r.status.snapshot,
    '/config': async (data) => {
      const patch = object(data.patch) ? data.patch : data
      if (!Object.keys(patch).length) return { ok: true, config: r.config(), defaults: DEFAULTS, home: r.paths.root }
      const saved = await r.configuration.persist(patch)
      return { ok: true, config: r.config(), saved: saved.clean, host: saved.host }
    },
    '/memory': () => ({ ok: true, lines: r.memory.read(60).reverse(), mdDir: r.paths.memory, persona: r.memory.persona(), personaPath: r.paths.file('persona.md') }),
    '/watched': (_data, query) => r.reports.watched(Number(query.get('days')) || 14),
    '/comfy/list': (_data, query) => { const list = r.comfy.list(Number(query.get('limit')) || undefined); return { ok: true, ...list, items: list.items.map((file) => ({ ...file, token: videoToken(file) })) } },
    '/dm': () => ({ ...r.dm.status(), watcher: r.watcher.state }),
    '/stickers': r.stickers.list,
    '/report/latest': () => ({ ok: true, report: r.reports.latest() }),
    '/setup/log': () => ({ ok: true, ...r.setup.state(), tail: ownedTail(r.paths, 'setup.log') }),
    '/log/tail': () => ({ ok: true, tail: ownedTail(r.paths, 'duty.log'), log: r.paths.file('duty.log') }),
    '/login/browser': () => r.browser.visible(true),
    '/login/browser/close': () => r.browser.visible(false),
    '/login/qr': r.browser.qr,
    '/login/poll': r.browser.poll,
    '/run': (data) => data.mode === 'headless' ? r.headless.run('http') : r.local.run({ manual: true }),
    '/persona': (data) => { const text = String(data.text || ''); if (!text.trim()) throw new HttpFailure(400, '人设不能为空'); return r.memory.savePersona(text) },
    '/publish': (data) => {
      if ('video_path' in data || 'path' in data || 'url' in data) throw new HttpFailure(400, '请从宿主输出列表选择视频')
      const index = data.index === undefined ? undefined : Number(data.index)
      if (index !== undefined && (!Number.isSafeInteger(index) || index < 0)) throw new HttpFailure(400, '视频索引无效')
      const selected = index === undefined ? undefined : r.comfy.list(200).items[index]
      if (index !== undefined && (!selected || data.token !== videoToken(selected))) throw new HttpFailure(409, '视频列表已变化，请刷新后重新选择')
      return r.publication.publish({ title: data.title, tags: data.tags, draft: data.draft, latest: index === undefined, video_path: selected?.path })
    },
    '/dm/seen/clear': r.dm.clearSeen,
    '/dm/test': (data) => r.dm.send({ nickname: r.config().msgAllowTo.split(/[,，、\n]/).map((name) => name.trim()).find(Boolean) || '', text: String(data.text || '测试：后台私信通道正常吗').slice(0, 100) }),
    '/stickers/tags': (data) => r.stickers.tags(data),
    '/stickers/test': (data) => r.dm.sticker({ nickname: r.config().msgAllowTo.split(/[,，、\n]/).map((name) => name.trim()).find(Boolean) || '', keyword: data.keyword, pick: data.pick, flip: data.flip }),
    '/reply/round': r.replies.round,
    '/login/sms': (data) => { const phone = String(data.phone || ''); if (phone && !/^\d{11}$/.test(phone)) throw new HttpFailure(400, '手机号需为 11 位数字'); return r.browser.sms(phone) },
    '/login/sms/submit': (data) => { const code = String(data.code || ''); if (!/^\d{4,6}$/.test(code)) throw new HttpFailure(400, '验证码需为 4 至 6 位数字'); return r.browser.submit(code) },
    '/setup': r.setup.start,
    '/selfcheck': r.status.selfcheck,
    '/chrome/open': (data) => r.browser.open(Number(data.port) || undefined),
    '/log': (data) => { r.log('前端：' + String(data.msg || '').replace(/[\r\n]/g, ' ').slice(0, 1500)); return { ok: true } },
    '/open': (data) => openDirectory(r.paths, data.what),
  }
  return Object.entries(HTTP_METHODS).map(([suffix, methods]): WebRoute => ({
    kind: 'exact', path: API_PREFIX + suffix,
    async handler(req, res) {
      const rejection = options.reject(req)
      if (!isLoopbackAddress(req.socket.remoteAddress) || rejection || req.headers[MARKER_HEADER] !== '1') { json(res, rejection || 403, { ok: false, error: '请求来源未授权' }); return }
      const method = req.method || 'GET'
      if (!methods.includes(method)) { res.setHeader('allow', methods.join(', ')); json(res, 405, { ok: false, error: '请求方法不支持' }); return }
      const controller = new AbortController(), abort = () => controller.abort(new Error('浏览器请求已取消'))
      req.once('aborted', abort)
      const close = () => { if (!res.writableEnded) abort() }; res.once('close', close)
      try {
        const query = new URL(req.url || '/', 'http://localhost').searchParams
        const data = method === 'POST' ? await body(req) : {}
        await r.track(() => withExecution({ origin: 'http', signal: controller.signal }, async () => {
          controller.signal.throwIfAborted()
          if (suffix === '/thumb' || suffix === '/cover') {
            if (query.has('u') || query.has('url') || query.has('path')) throw new HttpFailure(400, '资源接口只接受视频 ID')
            const id = query.get('id') || query.get('aweme_id') || ''
            if (!/^\d{6,24}$/.test(id)) throw new HttpFailure(400, '视频 ID 无效')
            const pick = Object.values(r.ledger.read().picks).find((item) => item.aweme_id === id)
            const cover = pick && String(pick.cover || pick.cover_url || '')
            const image = suffix === '/thumb' ? thumbnail(r.paths, id) : cover ? await fetchImage(cover, controller.signal) : null
            if (!image) throw new HttpFailure(404, '没有封面')
            if (!res.destroyed) { res.writeHead(200, { 'content-type': image.type, 'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff' }); res.end(image.buffer) }
          } else json(res, 200, await handlers[suffix](data, query, controller.signal))
        }))
      } catch (error) { json(res, error instanceof HttpFailure ? error.status : 500, { ok: false, error: errorMessage(error) }) }
      finally { req.off('aborted', abort); res.off('close', close) }
    },
  }))
}
