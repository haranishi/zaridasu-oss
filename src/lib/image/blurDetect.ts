// REQ-077 FR-077-03: 画像の解像度・blur チェック。
// Laplacian variance を使用し、低いほどブレ気味と判定。

export interface ImageCheckResult {
  width: number
  height: number
  isLowResolution: boolean
  isBlurry: boolean
  blurScore: number
}

const LOW_RES_PX = 200
const DEFAULT_BLUR_THRESHOLD = Number(
  process.env.NEXT_PUBLIC_AI_BLUR_THRESHOLD ?? '100',
)
const SAMPLE_SIZE = 128 // ダウンサンプリング先（計算コスト削減）

export async function checkImage(
  file: File | Blob,
  blurThreshold: number = DEFAULT_BLUR_THRESHOLD,
): Promise<ImageCheckResult | null> {
  if (typeof window === 'undefined' || !('createImageBitmap' in window)) return null
  try {
    const bmp = await createImageBitmap(file)
    const width = bmp.width
    const height = bmp.height
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_SIZE
    canvas.height = SAMPLE_SIZE
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      bmp.close()
      return null
    }
    ctx.drawImage(bmp, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
    bmp.close()
    const img = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data

    // グレースケール配列化
    const gray = new Float32Array(SAMPLE_SIZE * SAMPLE_SIZE)
    for (let i = 0; i < gray.length; i++) {
      const r = img[i * 4] ?? 0
      const g = img[i * 4 + 1] ?? 0
      const b = img[i * 4 + 2] ?? 0
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b
    }

    // Laplacian (4近傍) の分散を計算
    let sum = 0
    let sumSq = 0
    let count = 0
    for (let y = 1; y < SAMPLE_SIZE - 1; y++) {
      for (let x = 1; x < SAMPLE_SIZE - 1; x++) {
        const idx = y * SAMPLE_SIZE + x
        const v =
          (gray[idx - 1] ?? 0) +
          (gray[idx + 1] ?? 0) +
          (gray[idx - SAMPLE_SIZE] ?? 0) +
          (gray[idx + SAMPLE_SIZE] ?? 0) -
          4 * (gray[idx] ?? 0)
        sum += v
        sumSq += v * v
        count++
      }
    }
    const mean = sum / count
    const blurScore = sumSq / count - mean * mean

    return {
      width,
      height,
      isLowResolution: width < LOW_RES_PX || height < LOW_RES_PX,
      isBlurry: blurScore < blurThreshold,
      blurScore,
    }
  } catch {
    return null
  }
}
