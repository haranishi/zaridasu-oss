import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { processImage } from '../imageProcessor'

// jsdom には OffscreenCanvas が無いため isWorkerAvailable() は false になり、
// processImage は必ずメインスレッドの stripExifMainThread フォールバックを通る。
// そこで Image / canvas / URL をモックして「EXIF 除去 + 長辺 1280 リサイズ + JPEG 変換」
// の実挙動（スケール計算・キャンバス寸法・.heic → .jpg 改名・onerror フォールバック）を検証する。

let imageBehavior: { width: number; height: number; fail: boolean }
let capturedCanvas: { width: number; height: number } | null
const drawImageSpy = vi.fn()

class MockImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 0
  naturalHeight = 0
  private _src = ''
  set src(v: string) {
    this._src = v
    // 実ブラウザの非同期デコードを模して microtask で onload/onerror を発火。
    queueMicrotask(() => {
      if (imageBehavior.fail) {
        this.onerror?.()
      } else {
        this.naturalWidth = imageBehavior.width
        this.naturalHeight = imageBehavior.height
        this.onload?.()
      }
    })
  }
  get src(): string {
    return this._src
  }
}

const origGetContext = HTMLCanvasElement.prototype.getContext
const origToBlob = HTMLCanvasElement.prototype.toBlob
const origImage = globalThis.Image
const origCreate = URL.createObjectURL
const origRevoke = URL.revokeObjectURL

beforeEach(() => {
  imageBehavior = { width: 2000, height: 1000, fail: false }
  capturedCanvas = null
  drawImageSpy.mockClear()

  globalThis.Image = MockImage as unknown as typeof Image
  URL.createObjectURL = vi.fn(() => 'blob:mock') as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL

  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => ({ drawImage: drawImageSpy }),
  ) as unknown as HTMLCanvasElement['getContext']
  HTMLCanvasElement.prototype.toBlob = function (
    this: HTMLCanvasElement,
    cb: BlobCallback,
    type?: string,
  ) {
    // コードが設定した canvas.width/height をここで捕捉してリサイズ結果を検証する。
    capturedCanvas = { width: this.width, height: this.height }
    cb(new Blob(['jpeg-bytes'], { type: type || 'image/jpeg' }))
  } as HTMLCanvasElement['toBlob']
})

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = origGetContext
  HTMLCanvasElement.prototype.toBlob = origToBlob
  globalThis.Image = origImage
  URL.createObjectURL = origCreate
  URL.revokeObjectURL = origRevoke
  vi.restoreAllMocks()
})

function makeFile(name = 'photo.jpg', type = 'image/jpeg'): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type })
}

describe('processImage — メインスレッドフォールバック', () => {
  it('横長の大画像を長辺 1280px にリサイズし、image/jpeg の File を返す', async () => {
    imageBehavior = { width: 2000, height: 1000, fail: false }
    const out = await processImage(makeFile())
    // scale = min(1, 1280/2000) = 0.64 → 1280 x 640
    expect(out).toBeInstanceOf(File)
    expect(out.type).toBe('image/jpeg')
    expect(capturedCanvas).toEqual({ width: 1280, height: 640 })
    expect(drawImageSpy).toHaveBeenCalledTimes(1)
  })

  it('縦長の大画像も長辺基準でリサイズする（640 x 1280）', async () => {
    imageBehavior = { width: 1000, height: 2000, fail: false }
    await processImage(makeFile())
    expect(capturedCanvas).toEqual({ width: 640, height: 1280 })
  })

  it('長辺が 1280px 以下の画像は拡大せず等倍のまま', async () => {
    imageBehavior = { width: 800, height: 600, fail: false }
    await processImage(makeFile())
    // scale = min(1, 1280/800) = 1
    expect(capturedCanvas).toEqual({ width: 800, height: 600 })
  })

  it('.HEIC 拡張子は .jpg に改名し、type も image/jpeg にする', async () => {
    imageBehavior = { width: 1000, height: 1000, fail: false }
    const out = await processImage(makeFile('IMG_0001.HEIC', 'image/heic'))
    expect(out.name).toBe('IMG_0001.jpg')
    expect(out.type).toBe('image/jpeg')
  })

  it('画像デコードに失敗（onerror）したら元の File をそのまま返す', async () => {
    imageBehavior = { width: 0, height: 0, fail: true }
    const input = makeFile('orig.jpg')
    const out = await processImage(input)
    // 変換せず元ファイルを返す（同一参照）。オブジェクト URL は解放される。
    expect(out).toBe(input)
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })

  it('canvasが使えない時も原本に戻してURLを解放する', async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null)
    const input = makeFile()
    expect(await processImage(input)).toBe(input)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('JPEG生成がnullでも不正な写真を作らない', async () => {
    HTMLCanvasElement.prototype.toBlob = (cb) => cb(null)
    const input = makeFile()
    expect(await processImage(input)).toBe(input)
  })

  it('描画例外で待ち続けない', async () => {
    drawImageSpy.mockImplementationOnce(() => { throw new Error('decode failure') })
    const input = makeFile()
    expect(await processImage(input)).toBe(input)
  })

  it('エンコードが応答しない時も30秒で戻る', async () => {
    vi.useFakeTimers()
    HTMLCanvasElement.prototype.toBlob = () => {}
    const input = makeFile()
    const pending = processImage(input)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await pending).toBe(input)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('PNG入力もJPEGに合わせた拡張子を返す', async () => {
    expect((await processImage(makeFile('photo.png', 'image/png'))).name).toBe('photo.jpg')
  })

  it('object URL生成が失敗しても原本を返す', async () => {
    URL.createObjectURL = vi.fn(() => { throw new Error('out of memory') })
    const input = makeFile()
    expect(await processImage(input)).toBe(input)
  })
})
