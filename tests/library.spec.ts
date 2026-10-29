import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { MARKER_HEADER } from '../src/shared/request.ts'
import { createLibraryRoutes } from '../src/appearance/server/library.ts'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)])
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]), Buffer.alloc(64, 9)])

let root = ''
let server: Server
let base = ''
let rejectWith: 401 | 403 | undefined

const marked = { [MARKER_HEADER]: '1' }

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'dsh-cc-lib-'))
  const routes = createLibraryRoutes({ root, reject: (_req: IncomingMessage) => rejectWith })
  server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://x').pathname
    const route = routes.find((candidate) => candidate.path === pathname)
    if (!route) {
      res.writeHead(404)
      res.end()
      return
    }
    void route.handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/custom-center`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(root, { recursive: true, force: true })
})

beforeEach(async () => {
  rejectWith = undefined
  await rm(root, { recursive: true, force: true })
  await mkdir(root, { recursive: true })
})

async function upload(name: string, body: Buffer, headers: Record<string, string> = marked): Promise<Response> {
  return fetch(`${base}/upload?name=${encodeURIComponent(name)}`, { method: 'POST', body, headers })
}

describe('upload and classification', () => {
  it('files an image under images/ and a video under videos/', async () => {
    const image = await upload('sea.png', PNG)
    expect(image.status).toBe(201)
    expect(((await image.json()) as { item: { id: string; kind: string } }).item).toMatchObject({
      id: 'images/sea.png',
      kind: 'image',
    })
    const video = await upload('clip.mp4', MP4)
    expect(((await video.json()) as { item: { id: string } }).item.id).toBe('videos/clip.mp4')
    expect(await readdir(path.join(root, 'images'))).toEqual(['sea.png'])
    expect(await readdir(path.join(root, 'videos'))).toEqual(['clip.mp4'])
  })

  it('keeps both files when the name is taken', async () => {
    await upload('sea.png', PNG)
    const second = await upload('sea.png', PNG)
    expect(((await second.json()) as { item: { name: string } }).item.name).toBe('sea (1).png')
    expect((await readdir(path.join(root, 'images'))).sort()).toEqual(['sea (1).png', 'sea.png'])
  })

  it('rejects an unsupported type', async () => {
    const response = await upload('notes.txt', Buffer.from('hello'))
    expect(response.status).toBe(415)
    expect(((await response.json()) as { error: string }).error).toBe('unsupported')
  })

  it('rejects content that does not match the extension and leaves no file behind', async () => {
    const response = await upload('fake.png', Buffer.from('<html>not an image at all</html>'))
    expect(response.status).toBe(415)
    expect(((await response.json()) as { error: string }).error).toBe('bad-content')
    expect(await readdir(path.join(root, 'images'))).toEqual([])
  })

  it('strips directories from the uploaded name', async () => {
    const response = await upload('../../escape.png', PNG)
    expect(((await response.json()) as { item: { id: string } }).item.id).toBe('images/escape.png')
    expect(await readdir(root)).toEqual(expect.arrayContaining(['images', 'videos']))
  })
})

describe('listing', () => {
  it('lists uploaded files and ignores stray entries', async () => {
    await upload('a.png', PNG)
    await upload('b.mp4', MP4)
    await writeFile(path.join(root, 'images', 'readme.txt'), 'x')
    await writeFile(path.join(root, 'images', '.hidden.png'), PNG)
    const response = await fetch(`${base}/list`, { headers: marked })
    const body = (await response.json()) as { folder: string; items: Array<{ id: string }> }
    expect(body.items.map((item) => item.id).sort()).toEqual(['images/a.png', 'videos/b.mp4'])
    expect(body.folder.length).toBeGreaterThan(0)
  })

  it('creates the folders on first use', async () => {
    const response = await fetch(`${base}/list`, { headers: marked })
    expect(response.status).toBe(200)
    expect(await readdir(root)).toEqual(['images', 'videos'])
  })
})

describe('serving files', () => {
  it('serves the bytes with the right type and supports ranges', async () => {
    await upload('a.png', PNG)
    const full = await fetch(`${base}/file?id=${encodeURIComponent('images/a.png')}`)
    expect(full.status).toBe(200)
    expect(full.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await full.arrayBuffer()).equals(PNG)).toBe(true)

    const part = await fetch(`${base}/file?id=${encodeURIComponent('images/a.png')}`, { headers: { range: 'bytes=0-7' } })
    expect(part.status).toBe(206)
    expect(part.headers.get('content-range')).toBe(`bytes 0-7/${PNG.length}`)
    expect(Buffer.from(await part.arrayBuffer()).equals(PNG.subarray(0, 8))).toBe(true)

    const beyond = await fetch(`${base}/file?id=${encodeURIComponent('images/a.png')}`, { headers: { range: 'bytes=9999-' } })
    expect(beyond.status).toBe(416)
  })

  it('refuses ids that escape the library or name the wrong folder', async () => {
    await writeFile(path.join(root, 'secret.png'), PNG)
    const ids = ['../secret.png', 'images/../secret.png', '/etc/passwd', 'images/%2e%2e/secret.png', 'secret.png', 'videos/a.png', 'images/', '']
    for (const id of ids) {
      const response = await fetch(`${base}/file?id=${encodeURIComponent(id)}`)
      expect(response.status, id).toBe(404)
    }
  })

  it('does not follow a symlink out of the library', async () => {
    await mkdir(path.join(root, 'images'), { recursive: true })
    const outside = path.join(root, 'outside.png')
    await writeFile(outside, PNG)
    await symlink(outside, path.join(root, 'images', 'link.png'))
    const response = await fetch(`${base}/file?id=${encodeURIComponent('images/link.png')}`)
    expect(response.status).toBe(404)
  })
})

describe('access control', () => {
  it('requires the marker header on list and upload', async () => {
    expect((await fetch(`${base}/list`)).status).toBe(403)
    expect((await upload('a.png', PNG, {})).status).toBe(403)
  })

  it('passes the Connection rejection through', async () => {
    rejectWith = 401
    expect((await fetch(`${base}/list`, { headers: marked })).status).toBe(401)
    rejectWith = 403
    expect((await fetch(`${base}/file?id=images%2Fa.png`)).status).toBe(403)
  })

  it('enforces the HTTP method', async () => {
    const response = await fetch(`${base}/list`, { method: 'POST', headers: marked })
    expect(response.status).toBe(405)
  })
})
