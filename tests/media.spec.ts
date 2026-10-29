import { describe, expect, it } from 'vitest'
import {
  contentTypeOf,
  kindOfName,
  matchesSignature,
  parseRange,
  sanitizeFileName,
  uniqueName,
} from '../src/appearance/media.ts'
import { isLoopbackAddress } from '../src/shared/request.ts'

describe('classification', () => {
  it('sorts files into image and video classes by extension', () => {
    expect(kindOfName('a.PNG')).toBe('image')
    expect(kindOfName('a.jpeg')).toBe('image')
    expect(kindOfName('a.webp')).toBe('image')
    expect(kindOfName('clip.mp4')).toBe('video')
    expect(kindOfName('clip.WebM')).toBe('video')
  })

  it('rejects unsupported or extension-less names', () => {
    expect(kindOfName('notes.txt')).toBeUndefined()
    expect(kindOfName('a.svg')).toBeUndefined()
    expect(kindOfName('png')).toBeUndefined()
    expect(kindOfName('.png')).toBeUndefined()
    expect(kindOfName('trailing.')).toBeUndefined()
  })

  it('serves each class with its content type', () => {
    expect(contentTypeOf('a.jpg')).toBe('image/jpeg')
    expect(contentTypeOf('a.mp4')).toBe('video/mp4')
  })
})

describe('sanitizeFileName', () => {
  it('keeps a plain name', () => {
    expect(sanitizeFileName('sea.jpg')).toBe('sea.jpg')
    expect(sanitizeFileName('海边 日落.png')).toBe('海边 日落.png')
  })

  it('drops directories in either separator style', () => {
    expect(sanitizeFileName('../../etc/passwd.png')).toBe('passwd.png')
    expect(sanitizeFileName('C:\\Users\\me\\x.webp')).toBe('x.webp')
  })

  it('replaces reserved and control characters', () => {
    expect(sanitizeFileName('a<b>c:d"e|f?g*h.png')).toBe('a_b_c_d_e_f_g_h.png')
    expect(sanitizeFileName('tab\tname.png')).toBe('tab_name.png')
  })

  it('never produces a hidden or empty stem', () => {
    expect(sanitizeFileName('...hidden.png')).toBe('hidden.png')
    expect(sanitizeFileName('   .png')).toBe('wallpaper.png')
    expect(sanitizeFileName('.. .jpg')).toBe('wallpaper.jpg')
  })

  it('refuses unsupported types', () => {
    expect(sanitizeFileName('evil.exe')).toBeUndefined()
    expect(sanitizeFileName('page.html')).toBeUndefined()
  })

  it('caps very long names', () => {
    const name = sanitizeFileName(`${'a'.repeat(400)}.png`)
    expect(name?.length).toBe(104)
  })
})

describe('uniqueName', () => {
  it('returns the name when free', () => {
    expect(uniqueName('a.png', new Set())).toBe('a.png')
  })

  it('numbers collisions and ignores case', () => {
    const taken = new Set(['a.png', 'a (1).png'])
    expect(uniqueName('a.png', taken)).toBe('a (2).png')
    expect(uniqueName('A.PNG', taken)).toBe('A (2).PNG')
  })
})

describe('parseRange', () => {
  it('serves the whole file without a usable range', () => {
    expect(parseRange(undefined, 100)).toBeUndefined()
    expect(parseRange('bytes=0-1,5-9', 100)).toBeUndefined()
    expect(parseRange('items=0-1', 100)).toBeUndefined()
  })

  it('parses closed, open and suffix ranges', () => {
    expect(parseRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 })
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 })
  })

  it('flags ranges outside the file', () => {
    expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable')
    expect(parseRange('bytes=-0', 100)).toBe('unsatisfiable')
  })
})

describe('matchesSignature', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
  const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
  const mp4 = Uint8Array.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0])
  const webm = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])

  it('accepts matching content', () => {
    expect(matchesSignature('png', png)).toBe(true)
    expect(matchesSignature('jpg', jpeg)).toBe(true)
    expect(matchesSignature('jpeg', jpeg)).toBe(true)
    expect(matchesSignature('webp', webp)).toBe(true)
    expect(matchesSignature('mp4', mp4)).toBe(true)
    expect(matchesSignature('webm', webm)).toBe(true)
  })

  it('rejects content that disagrees with the extension', () => {
    expect(matchesSignature('png', jpeg)).toBe(false)
    expect(matchesSignature('mp4', png)).toBe(false)
    expect(matchesSignature('jpg', new TextEncoder().encode('<html>not an image</html>'))).toBe(false)
    expect(matchesSignature('png', new Uint8Array(0))).toBe(false)
  })
})

describe('isLoopbackAddress', () => {
  it('accepts only local sockets', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('::1')).toBe(true)
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('192.168.1.5')).toBe(false)
    expect(isLoopbackAddress('::ffff:10.0.0.1')).toBe(false)
    expect(isLoopbackAddress(undefined)).toBe(false)
  })
})
