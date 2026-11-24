import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

// REQ-326: 比較図の「池」が用紙に対して 1.08:1 しかなく、WCAG 1.4.11（意味を持つ非テキストは 3:1）を
// 大きく下回っていた。図の主語である池が視覚的に届いていなかったため、輪郭を濃くして描き直した。
// **画像を差し替えたときにコントラストが戻っていないか**を機械で見張る。
const FIGURE = join(process.cwd(), 'public/images/intro/intro-02-map-coarse-vs-fine.webp')

type Rgb = readonly [number, number, number]

function relLuminance([r, g, b]: Rgb): number {
  const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function contrast(a: Rgb, b: Rgb): number {
  const la = relLuminance(a)
  const lb = relLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}
/** "r,g,b" を組に戻す。長さが足りない入力は呼び出し側で作らない前提だが、型のために固める。 */
function toRgb(key: string): Rgb {
  const [r = 0, g = 0, b = 0] = key.split(',').map(Number)
  return [r, g, b]
}

describe('オンボーディング4画面目の比較図', () => {
  it('池の輪郭が用紙に対して 3:1 以上ある（WCAG 1.4.11）', async () => {
    const { data, info } = await sharp(readFileSync(FIGURE)).raw().toBuffer({ resolveWithObject: true })
    const px = info.channels
    const counts = new Map<string, number>()
    for (let i = 0; i < data.length; i += px) {
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
    const top = sorted[0]
    expect(top).toBeDefined()
    const paper = toRgb(top![0])

    // 青系（青が赤より明確に大きい）のうち、3:1 を超える画素がどれだけあるか
    let blue = 0
    let readable = 0
    for (const [key, n] of counts) {
      const rgb = toRgb(key)
      if (rgb[2] - rgb[0] <= 8) continue
      blue += n
      if (contrast(rgb, paper) >= 3) readable += n
    }
    expect(blue).toBeGreaterThan(0)
    // 輪郭は塗りより細いので全体比では小さいが、消えていれば 0 になる
    expect(readable / blue).toBeGreaterThan(0.05)
  })

  // REQ-327: 右（みんなの地図）の点は青と橙の 2 色あったが、意味の違いはどこにも書かれておらず、
  // alt も「池ひとつひとつに小さな点」としか言っていなかった。1 色へ揃えて図と alt を一致させた。
  // **凡例を足すのではなく、説明するものを無くす**という判断なので、色が増えたらここで落とす。
  it('右パネルの点が 1 色で、橙が残っていない', async () => {
    const { data, info } = await sharp(readFileSync(FIGURE)).raw().toBuffer({ resolveWithObject: true })
    const px = info.channels
    // 左（国の地図）の区画は橙のまま＝粗さの表現。右半分だけを見る。
    const half = Math.floor(info.width / 2)
    let orange = 0
    for (let y = 0; y < info.height; y++) {
      for (let x = half; x < info.width; x++) {
        const i = (y * info.width + x) * px
        const r = data[i] ?? 0
        const g = data[i + 1] ?? 0
        const b = data[i + 2] ?? 0
        if (r > 170 && g > 60 && g < 150 && b < 90) orange++
      }
    }
    expect(orange).toBe(0)
  })
})
