import { createHash } from 'node:crypto'
import { File as NodeFile } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { callApi, createSessionApi, MUTATION_HEADERS, parseApiResponse, resolveApiUrl } from '../src/skills/client/api-client.js'
import { buildUploadPayload, inspectUploadSelection, MAX_UPLOAD_ENTRY_BYTES } from '../src/skills/client/uploads.js'
import { DICT, translateError, summarizeSyncResult } from '../src/skills/client/messages.js'
import { CSS } from '../src/skills/client/styles.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Switch: 'host-switch' }))
afterEach(() => vi.unstubAllGlobals())
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

describe('Skills browser data contracts', () => {
  it('keeps reverse-proxy prefixes and leaves external or protocol-relative URLs intact', () => {
    expect(resolveApiUrl('/api/test')).toBe('/api/test')
    vi.stubGlobal('document', { baseURI: 'https://example.test/dsh' })
    expect(resolveApiUrl('/api/test')).toBe('https://example.test/dsh/api/test')
    expect(resolveApiUrl('//elsewhere/path')).toBe('//elsewhere/path')
    expect(resolveApiUrl('https://elsewhere/path')).toBe('https://elsewhere/path')
    vi.stubGlobal('document', { baseURI: 'not a URL' })
    expect(resolveApiUrl('/api/test')).toBe('/api/test')
  })

  it('unwraps success and preserves structured failures and invalid JSON status', async () => {
    await expect(parseApiResponse(Response.json({ ok: true, data: { enabled: false } })))
      .resolves.toEqual({ enabled: false })
    const error = { ok: false, code: 'error.skill.notFound', params: { name: 'a' } }
    await expect(parseApiResponse(Response.json(error, { status: 400 }))).rejects.toEqual(error)
    await expect(parseApiResponse(Response.json(error))).rejects.toEqual(error)
    await expect(parseApiResponse(new Response('offline', { status: 502 })))
      .rejects.toMatchObject({ code: 'error.proto.nonJson', params: { status: 502 } })
  })

  it('adds only session requests to the session and preserves mutation headers and body', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true, data: {} }))
    vi.stubGlobal('fetch', fetcher)
    const options = { method: 'POST', headers: MUTATION_HEADERS, body: '{"name":"alpha"}' }
    await createSessionApi('session-one')('/create', options)
    expect(fetcher).toHaveBeenLastCalledWith('/api/dsh-custom-center/skills/create', {
      ...options, headers: { ...MUTATION_HEADERS, 'x-dsh-skills-session': 'session-one' },
    })
    expect(options.headers).toEqual(MUTATION_HEADERS)
    fetcher.mockResolvedValueOnce(Response.json({ ok: true, data: { items: [] } }))
    await callApi('/workspaces')
    expect(fetcher).toHaveBeenLastCalledWith('/api/dsh-custom-center/skills/workspaces', undefined)
    fetcher.mockResolvedValueOnce(Response.json({ ok: true, data: {} }))
    await createSessionApi()('/state')
    expect(fetcher).toHaveBeenLastCalledWith('/api/dsh-custom-center/skills/state', { headers: {} })
  })

  it('keeps folder paths and binary bytes when preparing upload bodies', async () => {
    const doc = Object.assign(new NodeFile(['---\nname: alpha\n---'], 'SKILL.md'), { _dssmPath: 'alpha/SKILL.md' })
    const binary = Object.assign(new NodeFile([new Uint8Array([0, 128, 255])], 'data.bin'), { _dssmPath: 'alpha/data.bin' })
    // Node File is structurally the same upload contract as browser File.
    const files = [doc, binary] as unknown as File[]
    const selection = inspectUploadSelection(files)
    expect(selection).toMatchObject({ kind: 'folder', name: 'alpha', count: 2 })
    if (!selection || selection.error) throw new Error('valid fixture was rejected')
    expect(await buildUploadPayload(selection)).toEqual({
      name: 'alpha', entries: [
        { path: 'alpha/SKILL.md', data: Buffer.from(await doc.arrayBuffer()).toString('base64') },
        { path: 'alpha/data.bin', data: 'AID/' },
      ],
    })
    const zip = inspectUploadSelection([new NodeFile(['zip'], 'alpha.zip')] as unknown as File[])
    if (!zip || zip.error) throw new Error('valid ZIP fixture was rejected')
    expect(await buildUploadPayload(zip)).toEqual({ name: 'alpha.zip', zip: 'emlw' })
  })

  it('rejects invalid folders, multiple standalone files, and oversized documents before upload', () => {
    expect(inspectUploadSelection(null)).toBeNull()
    expect(inspectUploadSelection([
      { name: 'a.md', size: 1, webkitRelativePath: 'alpha/a.md' } as File,
    ])).toEqual({ error: { code: 'select.folder.invalid' } })
    expect(inspectUploadSelection([
      { name: 'SKILL.md', size: 1 } as File, { name: 'extra.md', size: 1 } as File,
    ])).toEqual({ error: { code: 'select.file.invalid' } })
    expect(inspectUploadSelection([{ name: 'SKILL.md', size: MAX_UPLOAD_ENTRY_BYTES + 1 } as File]))
      .toEqual({ error: { code: 'error.upload.tooLarge', params: { limit: MAX_UPLOAD_ENTRY_BYTES } } })
  })

  it('retains the pre-refactor CSS and final bilingual dictionary bytes', () => {
    expect(hash(CSS)).toBe('61cd43171ab7045da90dacc352e13173bc463018e61c76408a592dd7939d0bea')
    expect(hash(JSON.stringify(DICT))).toBe('c8e043712b82d1792cff49b98ef520295500795d1aa6b7291a70abd473a2a172')
  })

  it('preserves error fallback and mixed sync outcomes', () => {
    const t = (key: string) => key
    expect(translateError(t, { code: 'unknown', error: 'original error' })).toBe('original error')
    expect(translateError(t, new Error('offline'))).toBe('offline')
    expect(summarizeSyncResult(t, { synced: [{ name: 'a', source: 'a', overwritten: false }], skipped: [], failed: [{ name: 'b', source: 'b', error: 'bad' }] }))
      .toMatchObject({ ok: false, warning: true })
  })
})
