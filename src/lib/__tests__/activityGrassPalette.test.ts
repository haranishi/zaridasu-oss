// 活動の記録（草）の色。globals.css のトークンを読み、明暗それぞれで、枠と下地・段階どうしの差を計算で確かめる。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf-8')
const darkStart = css.indexOf('\n.dark {')

function token(part: string, name: string): string {
  // @theme の対応表（var(--…)）ではなく、色そのものの定義を取る
  const values = [...part.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, 'g'))].map(m => m[1]!.trim()).filter(v => !v.startsWith('var('))
  if (!values[0]) throw new Error(`--${name} が見つからない`)
  return values[0]
}

function rgbOf(value: string): [number, number, number] {
  const hex = value.match(/^#([0-9a-f]{6})$/i)
  if (hex) return [0, 2, 4].map(i => parseInt(hex[1]!.slice(i, i + 2), 16)) as [number, number, number]
  const hsl = value.match(/^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/)
  if (!hsl) throw new Error(`読めない色: ${value}`)
  const [h, s, l] = [Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100]
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [r, g, b].map(v => Math.round((v + m) * 255)) as [number, number, number]
}

function luminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(rgbOf(a)), luminance(rgbOf(b))].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const modes = [
  { name: '明るい配色', part: css.slice(0, darkStart) },
  { name: '暗い配色', part: css.slice(darkStart) },
]

describe.each(modes)('活動の記録の色（$name）', ({ part }) => {
  const surface = token(part, 'color-surface')
  const border = token(part, 'grass-border')
  const levels = [1, 2, 3, 4].map(n => token(part, `grass-${n}`))

  it('セルの枠と下地は 3:1 以上（塗りが薄くても、セルの位置が分かる）', () => {
    expect(contrast(border, surface)).toBeGreaterThanOrEqual(3)
  })

  it('段階が上がるほど、下地との差が大きくなる（濃さが一方向に並ぶ）', () => {
    const steps = levels.map(color => contrast(color, surface))
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeGreaterThan(steps[i - 1]!)
  })

  it('隣り合う段階は、見分けられる差がある（1.3倍以上）', () => {
    for (let i = 1; i < levels.length; i++) expect(contrast(levels[i]!, levels[i - 1]!)).toBeGreaterThanOrEqual(1.3)
  })

  it('選んだ日・フォーカスの輪郭と下地は 7:1 以上', () => {
    expect(contrast(token(part, 'grass-ring'), surface)).toBeGreaterThanOrEqual(7)
  })
})
