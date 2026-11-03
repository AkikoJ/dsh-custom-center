import type { DouyinPaths } from './paths.js'
import { readRequiredObject, writeJson } from './storage.js'
import { withActionLock } from './actions.js'
import { object } from './ledger-model.js'

const fileName = (value: unknown) => value === 'favorites.json' ? 'favorites.json' : 'favorites2.json'
export function createStickers(paths: DouyinPaths) {
  const read = (file: string) => { const data = readRequiredObject(paths.file(file)); return { ...data, items: Array.isArray(data.items) ? data.items.filter(object) : [] } }
  const list = () => {
    const custom = read('favorites2.json').items, emoji = read('favorites.json').items
    const item = (value: Record<string, unknown>) => ({ index: value.index, key: value.key, tags: Array.isArray(value.tags) ? value.tags.filter((tag) => typeof tag === 'string') : [] })
    return { ok: true, custom: custom.map(item), emojiCount: emoji.length, emoji: emoji.map(item) }
  }
  const tags = (input: Record<string, unknown>) => withActionLock(paths.root, async () => {
    const file = fileName(input.file), data = read(file), index = Number(input.index)
    const item = data.items.find((value) => Number(value.index) === index)
    if (!item || !Number.isSafeInteger(index) || index < 0) return { ok: false, error: '没有这一张' }
    const tags = [...new Set((Array.isArray(input.tags) ? input.tags : []).map((tag) => String(tag || '').trim().slice(0, 40)).filter(Boolean))].slice(0, 8)
    item.tags = tags; writeJson(paths.file(file), data)
    return { ok: true, tags }
  })
  return { list, tags }
}
export type Stickers = ReturnType<typeof createStickers>
