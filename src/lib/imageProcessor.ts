/**
 * 画像処理ライブラリ
 *
 * OffscreenCanvas 対応ブラウザでは Web Worker でメインスレッドをブロックせずに処理。
 * 非対応ブラウザ（一部モバイル・jsdom テスト環境）では既存の Canvas API にフォールバック。
 */

const MAX_SIDE = 1280
const WORKER_TIMEOUT_MS = 30_000
const MAX_PENDING = 10
const jpegName = (name: string) => name.replace(/\.[^.]+$/, '') + '.jpg'

// ── Worker シングルトン（モジュールスコープで一度だけ生成） ──────────────────
type PendingEntry = { resolve: (file: File) => void; originalFile: File }

let _worker: Worker | null = null
let _workerAvailable: boolean | null = null
const _pending = new Map<string, PendingEntry>()

function isWorkerAvailable(): boolean {
  if (_workerAvailable !== null) return _workerAvailable
  _workerAvailable =
    typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
  return _workerAvailable
}

function getWorker(): Worker | null {
  if (!isWorkerAvailable()) return null
  if (!_worker) {
    try {
      _worker = new Worker(
        new URL('../workers/imageProcessor.worker.ts', import.meta.url),
        { type: 'module' }
      )
      _worker.onmessage = (event: MessageEvent) => {
        const { id, blob, error } = event.data
        const pending = _pending.get(id)
        if (!pending) return
        _pending.delete(id)
        if (error || !blob) {
          // Worker処理失敗 → メインスレッドでリトライ
          stripExifMainThread(pending.originalFile).then(pending.resolve)
        } else {
          const file = new File(
            [blob as Blob],
            jpegName(pending.originalFile.name),
            { type: 'image/jpeg', lastModified: Date.now() }
          )
          pending.resolve(file)
        }
      }
      _worker.onerror = () => {
        _workerAvailable = false
        _worker?.terminate()
        _worker = null
        // 全 pending をフォールバックで解決
        _pending.forEach((p) =>
          stripExifMainThread(p.originalFile).then(p.resolve)
        )
        _pending.clear()
      }
    } catch {
      _workerAvailable = false
      return null
    }
  }
  return _worker
}

// ── メインスレッドのフォールバック実装 ─────────────────────────────────────
function stripExifMainThread(file: File): Promise<File> {
  return new Promise<File>((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    let settled = false
    const finish = (result: File) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      img.onload = null
      img.onerror = null
      URL.revokeObjectURL(url)
      resolve(result)
    }
    const timer = setTimeout(() => finish(file), WORKER_TIMEOUT_MS)
    img.onload = () => {
      try {
        const { naturalWidth: w, naturalHeight: h } = img
        if (!w || !h) { finish(file); return }
        const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(w * scale))
        canvas.height = Math.max(1, Math.round(h * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) { finish(file); return }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => finish(blob
          ? new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: Date.now() })
          : file), 'image/jpeg', 0.85)
      } catch {
        finish(file)
      }
    }
    img.onerror = () => finish(file)
    try { img.src = url } catch { finish(file) }
  }).catch(() => file)
}

// ── 公開API ────────────────────────────────────────────────────────────────
/**
 * EXIF削除 + 長辺1280pxリサイズ + JPEG変換
 *
 * OffscreenCanvas 対応環境では Worker で並列処理、非対応ではメインスレッドで処理。
 */
export function processImage(file: File): Promise<File> {
  const worker = getWorker()
  if (!worker) return stripExifMainThread(file)

  const id = crypto.randomUUID()
  return new Promise<File>((resolve) => {
    const timer = setTimeout(() => {
      _pending.delete(id)
      stripExifMainThread(file).then(resolve)
    }, WORKER_TIMEOUT_MS)

    // LRU eviction: 古いエントリを削除してメモリリーク防止
    if (_pending.size >= MAX_PENDING) {
      const oldest = _pending.keys().next().value!
      const oldEntry = _pending.get(oldest)!
      _pending.delete(oldest)
      stripExifMainThread(oldEntry.originalFile).then(oldEntry.resolve)
    }

    _pending.set(id, {
      originalFile: file,
      resolve: (result: File) => {
        clearTimeout(timer)
        resolve(result)
      },
    })

    file
      .arrayBuffer()
      .then((buffer) => {
        worker.postMessage(
          { id, buffer, mimeType: file.type, fileName: file.name },
          [buffer] // ArrayBuffer をゼロコピー転送
        )
      })
      .catch(() => {
        _pending.delete(id)
        clearTimeout(timer)
        stripExifMainThread(file).then(resolve)
      })
  })
}
