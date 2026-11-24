// REQ-077 FR-077-05: AI 判定用に画像を長辺 1024px / JPEG q=85 に圧縮。
// Storage の別 path (<name>.ai.jpg) にアップロードする派生バリアント向け。

const DEFAULT_MAX_EDGE = 1024
const DEFAULT_QUALITY = 0.85

export async function compressToAiVariant(
  file: File | Blob,
  maxEdge: number = DEFAULT_MAX_EDGE,
  quality: number = DEFAULT_QUALITY,
): Promise<Blob | null> {
  if (typeof window === 'undefined' || !('createImageBitmap' in window)) return null
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bmp.close()
      return null
    }
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    return await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), 'image/jpeg', quality),
    )
  } catch {
    return null
  }
}
