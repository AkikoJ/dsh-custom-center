import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createController, type SkinController } from '../src/appearance/client/controller.ts'
import { defaultConfig, idbLoadBlob, loadSaved, persist } from '../src/appearance/client/storage.ts'
import { createHostAppearance } from '../src/appearance/client/host-appearance.ts'
import type { SkinConfig } from '../src/appearance/client/model.ts'
import type { SkinSeeds } from '../src/appearance/skins.ts'
import type { ThemeService } from '../src/shared/browser-env.ts'

vi.mock('../src/appearance/client/storage.ts', async (original) => ({
  ...await original<typeof import('../src/appearance/client/storage.ts')>(),
  loadSaved: vi.fn(), persist: vi.fn(), idbLoadBlob: vi.fn(),
}))
vi.mock('../src/appearance/client/host-appearance.ts', () => ({ createHostAppearance: vi.fn() }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const seeds: SkinSeeds = { accent: '#456789', secondary: '#abcdef', surface: '#ffffff', text: '#111111', tones: [1] }
let controllers: SkinController[]
let render: ReturnType<typeof vi.fn<(config: SkinConfig) => void>>
let offTheme: ReturnType<typeof vi.fn<() => void>>
let themeChanged: () => void

function controller() {
  const theme: ThemeService = { getTheme: () => ({ themes: [] }), register: () => () => {} }
  const result = createController(theme, (listener) => { themeChanged = listener; return offTheme })
  controllers.push(result)
  return result
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('document', {})
  controllers = []
  render = vi.fn()
  offTheme = vi.fn()
  vi.mocked(createHostAppearance).mockReturnValue({ render })
  vi.mocked(loadSaved).mockReturnValue(defaultConfig())
  vi.mocked(persist).mockReset().mockResolvedValue(undefined)
  vi.mocked(idbLoadBlob).mockReset().mockResolvedValue(null)
})
afterEach(() => {
  controllers.forEach((item) => item.dispose())
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('appearance controller lifecycle', () => {
  it('keeps edits in the draft, renders preview edits, and restores saved settings on exit or discard', () => {
    const c = controller()
    const changed = vi.fn()
    c.subscribe(changed)
    c.setImage(seeds, 'data:image/test', 0.4, 'images/test')
    expect(c.getSnapshot()).toMatchObject({ kind: 'image', dirty: true, previewing: false, bgOpacity: 40 })
    expect(render).toHaveBeenCalledTimes(1)
    c.preview()
    c.setOpacity('both', 61.6)
    expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'image', bg: 62, side: 62 }))
    themeChanged()
    expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'image', bg: 62 }))
    c.exitPreview()
    expect(render).toHaveBeenLastCalledWith(defaultConfig())
    expect(c.getSnapshot()).toMatchObject({ kind: 'image', dirty: true, previewing: false })
    c.discard()
    expect(c.getSnapshot()).toMatchObject({ kind: 'none', dirty: false, previewing: false })
    expect(changed).toHaveBeenCalledTimes(6)
  })

  it('publishes and renders the saved draft before video persistence completes', async () => {
    const pending = deferred<void>()
    vi.mocked(persist).mockReturnValueOnce(pending.promise)
    const c = controller()
    const video = new Blob(['video'])
    c.setVideo(seeds, video, 0.4, 'videos/test')
    c.preview()
    const saving = c.save()
    expect(c.getSnapshot()).toMatchObject({ video, dirty: false, previewing: false })
    expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ video, kind: 'video' }))
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ video }), defaultConfig())
    c.setOpacity('bg', 80)
    c.discard()
    expect(c.getSnapshot().bgOpacity).toBe(40)
    pending.resolve()
    await saving
  })

  it('retains saved state and resolves save when asynchronous persistence fails', async () => {
    const error = new Error('quota')
    vi.mocked(persist).mockRejectedValueOnce(error)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = controller()
    c.setImage(seeds, 'data:image/test', 0.4, 'images/test')
    await expect(c.save()).resolves.toBeUndefined()
    expect(c.getSnapshot()).toMatchObject({ kind: 'image', dirty: false })
    expect(logged).toHaveBeenCalledWith('[dsh-custom-center] saving the video failed', error)
  })

  it('restores the native look immediately but propagates reset persistence failures', async () => {
    vi.mocked(loadSaved).mockReturnValue({ ...defaultConfig(), kind: 'image', seeds, image: 'data:image/saved' })
    const pending = deferred<void>()
    vi.mocked(persist).mockReturnValueOnce(pending.promise)
    const c = controller()
    const resetting = c.reset()
    expect(c.getSnapshot()).toMatchObject({ kind: 'none', dirty: false, previewing: false })
    expect(render).toHaveBeenLastCalledWith(defaultConfig())
    const error = new Error('database unavailable')
    pending.reject(error)
    await expect(resetting).rejects.toBe(error)
  })

  it('unsubscribes theme changes and suppresses the delayed repaint after disposal', () => {
    const c = controller()
    const changed = vi.fn()
    c.subscribe(changed)
    c.dispose()
    controllers = []
    const renders = render.mock.calls.length
    vi.advanceTimersByTime(300)
    expect(offTheme).toHaveBeenCalledOnce()
    expect(render).toHaveBeenCalledTimes(renders)
    expect(render).toHaveBeenLastCalledWith(defaultConfig())
    expect(changed).not.toHaveBeenCalled()
  })

  it('hydrates a saved video and preserves unsaved opacity edits', async () => {
    vi.mocked(loadSaved).mockReturnValue({ ...defaultConfig(), kind: 'video', seeds })
    const pending = deferred<Blob | null>()
    vi.mocked(idbLoadBlob).mockReturnValueOnce(pending.promise)
    const c = controller()
    c.setOpacity('bg', 75)
    const video = new Blob(['saved'])
    pending.resolve(video)
    await pending.promise
    expect(c.getSnapshot()).toMatchObject({ video, bgOpacity: 75, dirty: true })
    expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ video, bg: 25 }))
  })

  it('ignores saved video hydration after reset or disposal', async () => {
    vi.mocked(loadSaved).mockReturnValue({ ...defaultConfig(), kind: 'video', seeds })
    const pending = deferred<Blob | null>()
    vi.mocked(idbLoadBlob).mockReturnValue(pending.promise)
    const reset = controller()
    const disposed = controller()
    await reset.reset()
    disposed.dispose()
    controllers = [reset]
    const renders = render.mock.calls.length
    pending.resolve(new Blob(['stale']))
    await pending.promise
    expect(reset.getSnapshot()).toMatchObject({ kind: 'none', video: null })
    expect(disposed.getSnapshot().video).toBeNull()
    expect(render).toHaveBeenCalledTimes(renders)
  })
})
