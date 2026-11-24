/**
 * 画像処理 Web Worker
 * OffscreenCanvas を使ってメインスレッドをブロックせずに
 * EXIF削除 + 長辺1280pxリサイズ + JPEG変換を実行する
 */

const MAX_SIDE = 1280

interface ProcessRequest {
  id: string
  buffer: ArrayBuffer
  mimeType: string
  fileName: string
}

self.onmessage = async (event: MessageEvent<ProcessRequest>) => {
  const { id, buffer, mimeType } = event.data
  let bitmap: ImageBitmap | undefined
  try {
    const blob = new Blob([buffer], { type: mimeType })
    bitmap = await createImageBitmap(blob)
    const { width: w, height: h } = bitmap
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
    const canvas = new OffscreenCanvas(Math.round(w * scale), Math.round(h * scale))
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const outBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
    self.postMessage({ id, blob: outBlob })
  } catch {
    // フォールバック: メインスレッド側で処理するようエラーを返す
    self.postMessage({ id, error: 'processing failed' })
  } finally {
    bitmap?.close()
  }
}
