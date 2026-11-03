import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { createImageFetcher, coverUrl, imageType, publicAddress } from '../../src/douyin/server/image-fetch.js'
import { createImageAccess } from '../../src/douyin/server/image-access.js'
import { douyinPaths } from '../../src/douyin/server/paths.js'
import { DEFAULTS } from '../../src/douyin/config.js'

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), url = 'https://p3.douyinpic.com/image.png'
const addresses = [{ address: '1.1.1.1', family: 4 }]
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true }) })
function response(data = png, type = 'image/png', status = 200, location?: string) {
  return { status, type, location, body: (async function* () { yield data })(), cancel: vi.fn() }
}
function imageFixture() {
  const root = mkdtempSync(join(tmpdir(), 'douyin-images-')); roots.push(root)
  const paths = douyinPaths(root), config = { ...DEFAULTS }
  const ref = { attachmentId: AttachmentId('a'.repeat(64)), bytes: png.length, width: 1, height: 1, mediaType: 'image/png' as const }
  const fetch = vi.fn(async () => ({ buffer: png, type: 'image/png' as const }))
  const saveImage = vi.fn(async () => ref), imageHostPath = vi.fn(() => '/external/attachment.png')
  const resolve = vi.fn<CredentialProvider['resolve']>(async () => ({ value: 'fake-secret', source: 'test' }))
  const request = vi.fn<typeof globalThis.fetch>(async () => Response.json({ choices: [{ message: { content: '画着一只猫' } }] }))
  const log = vi.fn()
  const images = createImageAccess({ paths, config: () => config, fetch, attachments: () => ({ saveImage, imageHostPath }), credentials: () => ({ resolve }), request, log })
  return { paths, config, ref, fetch, saveImage, resolve, request, log, images }
}

describe('trusted image downloads', () => {
  it('requires exact CDN suffixes and HTTPS without credentials or nonstandard ports', () => {
    expect(coverUrl(url).hostname).toBe('p3.douyinpic.com')
    for (const input of ['http://douyinpic.com/a', 'https://douyinpic.com.evil.example/a', 'https://evil-douyinpic.com/a', 'https://u:p@douyinpic.com/a', 'https://douyinpic.com:8443/a', 'https://127.0.0.1/a', 'file:///tmp/a']) expect(() => coverUrl(input)).toThrow()
  })
  it('rejects private, reserved, mapped and transition addresses', () => {
    for (const address of ['0.0.0.0', '10.1.2.3', '100.64.1.1', '127.0.0.1', '169.254.169.254', '172.16.1.1', '192.168.1.1', '192.0.2.1', '198.18.1.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fe80::1', 'fd00::1', '2001:db8::1', '2001:0000:4136:e378:8000:63bf:3fff:fdd2', '2002:7f00:1::', '3fff::1']) expect(publicAddress(address), address).toBe(false)
    for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111', '2001:4860:4860::8888']) expect(publicAddress(address)).toBe(true)
  })
  it('refuses mixed public/private DNS before a request and passes only validated addresses', async () => {
    const open = vi.fn<NonNullable<NonNullable<Parameters<typeof createImageFetcher>[0]>['open']>>(async () => response())
    const blocked = createImageFetcher({ lookup: async () => [...addresses, { address: '127.0.0.1', family: 4 }], open })
    await expect(blocked(url)).rejects.toThrow('非公开'); expect(open).not.toHaveBeenCalled()
    const image = await createImageFetcher({ lookup: async () => addresses, open })(url)
    expect(image).toEqual({ buffer: png, type: 'image/png' })
    expect(open.mock.calls[0][1].addresses).toEqual(addresses)
  })
  it('revalidates redirect hosts, DNS and redirect count and always cancels responses', async () => {
    const first = response(png, 'image/png', 302, '/next.png'), last = response(), open = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(last), dns = vi.fn(async () => addresses)
    expect(await createImageFetcher({ lookup: dns, open })(url)).toMatchObject({ type: 'image/png' }); expect(dns).toHaveBeenCalledTimes(2)
    expect(first.cancel).toHaveBeenCalled(); expect(last.cancel).toHaveBeenCalled()
    const outside = response(png, 'image/png', 302, 'https://localhost/private')
    await expect(createImageFetcher({ lookup: async () => addresses, open: async () => outside })(url)).rejects.toThrow('可信 CDN')
    const loop = response(png, 'image/png', 302, '/loop.png'), repeated = vi.fn(async () => loop)
    await expect(createImageFetcher({ lookup: async () => addresses, open: repeated })(url)).rejects.toThrow('重定向过多'); expect(repeated).toHaveBeenCalledTimes(5)
  })
  it('rejects bad MIME, signature mismatches and oversized headers or streams', async () => {
    for (const item of [response(png, 'text/html'), response(png, 'image/jpeg'), response(Buffer.from('<svg/>'), 'image/png'), { ...response(), length: '1000' }, response(Buffer.alloc(1000))]) {
      const fetch = createImageFetcher({ lookup: async () => addresses, open: async () => item, maxBytes: 64 })
      await expect(fetch(url)).rejects.toThrow(); expect(item.cancel).toHaveBeenCalled()
    }
    expect(imageType(Buffer.from('GIF89a'))).toBe('image/gif')
    expect(imageType(Buffer.from('RIFF0000WEBP'))).toBe('image/webp')
    expect(imageType(Buffer.from([255, 216, 255]))).toBe('image/jpeg')
  })
  it('cancels a stalled DNS lookup and a stalled image stream', async () => {
    const controller = new AbortController(), open = vi.fn(async () => response())
    const promise = createImageFetcher({ lookup: () => new Promise(() => {}), open })(url, controller.signal)
    controller.abort(new Error('cancel DNS')); await expect(promise).rejects.toThrow('cancel DNS'); expect(open).not.toHaveBeenCalled()
    let entered!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    const second = new AbortController(), cancel = vi.fn(), item = { ...response(), body: (async function* () { entered(); await new Promise(() => {}); yield png })(), cancel }
    const pending = createImageFetcher({ lookup: async () => addresses, open: async () => item })(url, second.signal)
    await started; second.abort(new Error('cancel stream'))
    await expect(pending).rejects.toThrow('cancel stream'); expect(cancel).toHaveBeenCalled()
  })
})

describe('official image attachments and vision fallback', () => {
  it('saves durable references, retains metadata and never writes secrets or image bytes to the index', async () => {
    const f = imageFixture()
    expect(await f.images.attach(url)).toEqual(f.ref); await f.images.attach(url)
    expect(f.saveImage).toHaveBeenCalledWith({ data: png, mediaType: 'image/png', name: 'douyin-image' })
    const index = JSON.parse(readFileSync(f.paths.file('dm-sticker-attachments.json'), 'utf8'))
    expect(index.items).toHaveLength(1); expect(index.items[0]).toMatchObject({ id: f.ref.attachmentId, path: '/external/attachment.png', bytes: png.length })
    expect(JSON.stringify(index)).not.toContain('fake-secret')
  })
  it('uploads verified bytes to fixed vision endpoints and re-resolves credentials each operation', async () => {
    const f = imageFixture(); expect(await f.images.describe(url)).toBe('画着一只猫')
    const [endpoint, options] = f.request.mock.calls[0], body = JSON.parse(String(options?.body))
    expect(endpoint).toBe('https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions')
    expect(body.messages[0].content[0].image_url.url).toBe('data:image/png;base64,' + png.toString('base64'))
    expect(JSON.stringify(body)).not.toContain(url)
    await f.images.describe(url); expect(f.resolve).toHaveBeenCalledTimes(2); expect(JSON.stringify(f.log.mock.calls)).not.toContain('fake-secret')
  })
  it('falls back to the second credential route but refuses unreadable images, disabled vision and large responses', async () => {
    const f = imageFixture(); f.request.mockResolvedValueOnce(new Response('', { status: 503 }))
    expect(await f.images.describe(url)).toBe('画着一只猫'); expect(f.resolve.mock.calls[1][0]).toBe('DASHSCOPE_API_KEY')
    f.config.dmFastVision = false; expect(await f.images.describe(url)).toBe(''); expect(f.request).toHaveBeenCalledTimes(2)
    f.config.dmFastVision = true; f.fetch.mockRejectedValueOnce(Error('invalid image')); expect(await f.images.describe(url)).toBe('')
    f.request.mockImplementation(async () => new Response('x'.repeat(65537))); expect(await f.images.describe(url)).toBe('')
  })
})
