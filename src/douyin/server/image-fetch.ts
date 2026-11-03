import { lookup } from 'node:dns/promises'
import type { LookupAddress } from 'node:dns'
import { request } from 'node:https'
import { isIP } from 'node:net'
import type { ImageMediaType } from '@deepseek-ai/dsh-attachment'

const DOMAINS = ['douyinpic.com', 'douyin.com', 'byteimg.com', 'pstatp.com', 'ibytedtos.com', 'imagex.bytedanceapi.com']
export function coverUrl(input: string): URL {
  const url = new URL(input), host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !DOMAINS.some((domain) => host === domain || host.endsWith('.' + domain))) throw new Error('图片仅支持可信 CDN 的 HTTPS 地址')
  return url
}
export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
  }
  if (isIP(address) !== 6) return false
  const normalized = new URL(`https://[${address}]/`).hostname.slice(1, -1)
  return /^[23][0-9a-f]{3}:/i.test(normalized) && !/^(2001:(:|0:|db8:|2:|10:|20:)|2002:|3ffe:|3fff:)/i.test(normalized)
}
export function imageType(data: Buffer): ImageMediaType {
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg'
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (/^GIF8[79]a$/.test(data.subarray(0, 6).toString('ascii'))) return 'image/gif'
  if (data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  throw new Error('响应不是受支持的图片')
}
interface ImageResponse {
  status: number
  type?: string
  location?: string
  length?: string
  body: AsyncIterable<Uint8Array>
  cancel(): void
}
type OpenImage = (url: URL, options: { addresses: LookupAddress[]; signal: AbortSignal }) => Promise<ImageResponse>
const openImage: OpenImage = (url, { addresses, signal }) => new Promise((resolve, reject) => {
  const req = request(url, { signal, headers: { referer: 'https://www.douyin.com/' }, lookup(host, options, callback) {
    if (host !== url.hostname) { callback(new Error('图片请求主机不匹配'), '', 4); return }
    if (options.all) callback(null, addresses)
    else callback(null, addresses[0].address, addresses[0].family)
  } }, (response) => resolve({ status: response.statusCode || 0, type: response.headers['content-type'], location: response.headers.location, length: response.headers['content-length'], body: response, cancel: () => response.destroy() }))
  req.on('error', reject)
  req.end()
})
export async function untilAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) { void promise.catch(() => {}); throw signal.reason }
  let abort!: () => void
  const interrupted = new Promise<never>((_resolve, reject) => { abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true }) })
  try { return await Promise.race([promise, interrupted]) } finally { signal.removeEventListener('abort', abort) }
}
export interface ImageBytes { buffer: Buffer; type: ImageMediaType }
export function createImageFetcher(deps: { lookup?: (host: string) => Promise<LookupAddress[]>; open?: OpenImage; timeoutMs?: number; maxBytes?: number } = {}) {
  const dns = deps.lookup ?? ((host) => lookup(host, { all: true, verbatim: true }))
  const open = deps.open ?? openImage, maxBytes = deps.maxBytes ?? 8 * 1024 * 1024
  return async (input: string, signal?: AbortSignal): Promise<ImageBytes> => {
    let url = coverUrl(input)
    const deadline = AbortSignal.timeout(deps.timeoutMs ?? 12000), abort = signal ? AbortSignal.any([signal, deadline]) : deadline
    for (let redirects = 0; redirects <= 4; redirects++) {
      const addresses = await untilAbort(dns(url.hostname), abort)
      if (!addresses.length || addresses.some((entry) => !publicAddress(entry.address))) throw new Error('图片域名解析到非公开地址')
      const response = await untilAbort(open(url, { addresses, signal: abort }), abort)
      try {
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (!response.location) throw new Error('图片重定向缺少地址')
          url = coverUrl(new URL(response.location, url).href)
          continue
        }
        const type = response.type?.split(';')[0].trim().toLowerCase()
        if (response.status !== 200 || !/^image\/(jpeg|png|gif|webp)$/.test(type || '')) throw new Error('图片状态或类型无效')
        if (Number(response.length) > maxBytes) throw new Error('图片超过大小限制')
        return await untilAbort((async () => {
          const chunks: Buffer[] = []; let size = 0
          for await (const chunk of response.body) { size += chunk.byteLength; if (size > maxBytes) throw new Error('图片超过大小限制'); chunks.push(Buffer.from(chunk)) }
          const buffer = Buffer.concat(chunks), actual = imageType(buffer)
          if (actual !== type) throw new Error('图片格式与响应类型不一致')
          return { buffer, type: actual }
        })(), abort)
      } finally { response.cancel() }
    }
    throw new Error('图片重定向过多')
  }
}
export type FetchImage = ReturnType<typeof createImageFetcher>
