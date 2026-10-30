/**
 * The wallpaper library picker: an image tab and a video tab listing the files
 * kept in the host-side library folder, plus an upload button. Choosing a file
 * downloads it from the host, runs the usual decode + colour sampling and hands
 * the result to the controller as the draft wallpaper.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MediaItem, MediaKind } from '../media.ts'
import type { SkinController } from './controller.ts'
import { LibraryError, fileUrl, listLibrary, loadLibraryFile, uploadToLibrary } from './library.ts'
import { processImage, processVideo } from "./wallpaper.js";

/** Props of {@link LibraryPicker}. */
export interface LibraryPickerProps {
  controller: SkinController
  /** Library id of the wallpaper currently in the draft. */
  selectedId: string
  /** Kind of the wallpaper currently in the draft, used to pick the first tab. */
  selectedKind: MediaKind | 'none'
  /** Called after a wallpaper was chosen. */
  onChosen: () => void
}

const ACCEPT = 'image/png,image/jpeg,image/webp,video/mp4,video/webm,.png,.jpg,.jpeg,.webp,.mp4,.webm'

/** User-facing text for a failed library request. */
function messageFor(error: unknown): string {
  const code = error instanceof LibraryError ? error.code : 'failed'
  switch (code) {
    case 'unsupported':
      return '不支持的文件类型，请选择 PNG / JPG / WebP 图片或 MP4 / WebM 视频'
    case 'too-large':
      return '文件过大：图片最大 50 MB，视频最大 512 MB'
    case 'bad-content':
      return '文件内容与扩展名不符，无法作为壁纸'
    case 'unavailable':
      return '壁纸库服务未启动，请重启 DeepSeek Harness 后重试'
    case 'unreachable':
    case 'unauthorized':
    case 'forbidden':
      return '无法访问壁纸库，请重新加载窗口后重试'
    default:
      return '操作失败，请稍后重试'
  }
}

/** Picker for files already in the library, with upload. */
export function LibraryPicker(props: LibraryPickerProps): JSX.Element {
  const { controller, selectedId, selectedKind, onChosen } = props
  const [tab, setTab] = useState<MediaKind>(selectedKind === 'video' ? 'video' : 'image')
  const [items, setItems] = useState<MediaItem[]>([])
  const [folder, setFolder] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(true)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const listing = await listLibrary()
      if (!alive.current) return
      setItems(listing.items)
      setFolder(listing.folder)
      setError('')
    } catch (err) {
      if (alive.current) setError(messageFor(err))
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const choose = async (item: MediaItem): Promise<void> => {
    if (busyId !== null) return
    setBusyId(item.id)
    setError('')
    try {
      const file = await loadLibraryFile(item)
      if (item.kind === 'video') {
        const result = await processVideo(file)
        controller.setVideo(result.seeds, file, result.veil, item.id)
      } else {
        const result = await processImage(file)
        controller.setImage(result.seeds, result.image, result.veil, item.id)
      }
      if (alive.current) onChosen()
    } catch (err) {
      console.error('[dsh-custom-center] choosing a wallpaper failed', err)
      if (alive.current) setError(err instanceof LibraryError ? messageFor(err) : '无法读取这个文件，可能已损坏')
    } finally {
      if (alive.current) setBusyId(null)
    }
  }

  const upload = async (files: FileList | null): Promise<void> => {
    const list = files ? Array.from(files) : []
    if (list.length === 0) return
    setUploading(true)
    setError('')
    let last: MediaItem | undefined
    const failures: string[] = []
    for (const file of list) {
      try {
        last = await uploadToLibrary(file)
      } catch (err) {
        failures.push(list.length > 1 ? `${file.name}：${messageFor(err)}` : messageFor(err))
      }
    }
    if (!alive.current) return
    if (last) setTab(last.kind)
    await refresh()
    if (!alive.current) return
    setUploading(false)
    if (failures.length > 0) setError(failures.join('\n'))
  }

  const shown = items.filter((item) => item.kind === tab)
  const count = (kind: MediaKind): number => items.filter((item) => item.kind === kind).length
  const emptyText = tab === 'image' ? '还没有图片，点击「上传」添加' : '还没有视频，点击「上传」添加'

  return (
    <div className="dsh-cc-picker">
      <div className="dsh-cc-tabs" role="tablist" aria-label="壁纸类型">
        {(['image', 'video'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            role="tab"
            id={`dsh-cc-tab-${kind}`}
            aria-selected={tab === kind}
            aria-controls="dsh-cc-gallery"
            className={`dsh-cc-tab${tab === kind ? ' dsh-cc-tab-active' : ''}`}
            onClick={() => setTab(kind)}
          >
            {kind === 'image' ? '图片' : '视频'}
            <span className="dsh-cc-tab-count">{count(kind)}</span>
          </button>
        ))}
      </div>

      <div className="dsh-cc-gallery" id="dsh-cc-gallery" role="tabpanel" aria-labelledby={`dsh-cc-tab-${tab}`}>
        <button
          type="button"
          className="dsh-cc-upload"
          disabled={uploading}
          aria-label="上传图片或视频"
          onClick={() => fileInput.current?.click()}
        >
          <span className="dsh-cc-upload-plus" aria-hidden="true">
            +
          </span>
          <span>{uploading ? '上传中…' : '上传'}</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT}
          className="dsh-cc-file-input"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const input = event.currentTarget
            void upload(input.files).finally(() => {
              input.value = ''
            })
          }}
        />
        {loading && <p className="dsh-cc-empty">加载中…</p>}
        {!loading && shown.length === 0 && <p className="dsh-cc-empty">{emptyText}</p>}
        {shown.map((item) => {
          const selected = item.id === selectedId
          return (
            <button
              key={item.id}
              type="button"
              className={`dsh-cc-item${selected ? ' dsh-cc-item-selected' : ''}`}
              aria-pressed={selected}
              aria-label={item.name}
              title={item.name}
              disabled={busyId !== null}
              onClick={() => void choose(item)}
            >
              {item.kind === 'image' ? (
                <img className="dsh-cc-item-media" src={fileUrl(item)} alt="" loading="lazy" decoding="async" />
              ) : (
                <video
                  className="dsh-cc-item-media"
                  src={`${fileUrl(item)}#t=0.5`}
                  preload="metadata"
                  muted
                  playsInline
                  aria-hidden="true"
                />
              )}
              <span className="dsh-cc-item-name">{busyId === item.id ? '处理中…' : item.name}</span>
            </button>
          )
        })}
      </div>

      {error !== '' && (
        <p className="dsh-cc-error" role="alert">
          {error}
        </p>
      )}
      {folder !== '' && <p className="dsh-cc-hint">{`文件保存在 ${folder}/images 和 ${folder}/videos，上传时按类型自动归类`}</p>}
    </div>
  )
}
