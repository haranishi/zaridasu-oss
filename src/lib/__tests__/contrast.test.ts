/**
 * REQ-318 FR-318-05: 配色コントラストの自動テスト。
 *
 * ■ なぜ要るのか
 * `docs/brand/design-guide/02-color-accessibility.md` は「テキスト 4.5:1 / UI 部品 3:1」を
 * 基準として明記しているのに、検証手順が「WebAIM Contrast Checker 等で確認」＝**人手だけ**
 * だった。その結果、ランキングの選択タブ（白 on #10B981 = 2.54:1）や
 * 投稿の編集/削除アイコン（#D1D5DB on 白 = 1.47:1）のような
 * 「基準の半分も無い」配色が REQ-224 の是正後も素通りしていた。
 * 基準を文章ではなく**落ちるテスト**として置き直すのが本ファイルの役割。
 *
 * ■ 色の出どころ（単一の正）
 * 値をこのファイルに直書きすると「CSS を変えたのにテストが緑のまま」になるため、
 * **`src/app/globals.css` を実際に読んで解決する**。
 *  - Tailwind の既定パレット（red-600 等）は globals.css の 2 つめの `@theme` が
 *    v3 の hex に固定している値を使う（Tailwind v4 既定の OKLCH ではない。globals.css:102-113 参照）。
 *  - デザイントークン（--color-surface 等）は `:root` / `.dark` の値を使い、`var()` は追跡する。
 * したがって globals.css 側でトークンを薄くすると、このテストが落ちる。
 *
 * ■ 列挙の範囲（意図的に全網羅ではない）
 * REQ-318 で是正した組と、その土台になる基幹トークンの組だけを列挙する。
 * コード全体では約 189 箇所が不合格（`.agent-harness/runs/2026-08-16-uiux-loop/round0-contrast-audit.md`）で、
 * 残り（admin 画面・`text-gray-400` の生クラス約 180 箇所）は REQ-319 でこの表に追記していく。
 *
 * ■ 配色ルール（REQ-325 FR-325-04・このファイルが守る「1 つの決まり」）
 * **白 / ページ背景（#f9fafb）以外の「色の付いた面」に載せるテキストは、
 *   `--color-text-muted`（#5d636f）以上の濃さにする。`--color-text-faint`（#6b7280）は白地専用。**
 *
 * 根拠（faint = #6b7280 の実測）:
 *     白 #ffffff        4.83:1 ✅   ページ背景 #f9fafb 4.63:1 ✅
 *     淡い面 #f8f6f6    4.49:1 ❌   gray-100 #f3f4f6  4.39:1 ❌
 *     red-50 #fef2f2    4.42:1 ❌   blue-50  #eff6ff  4.44:1 ❌
 * 面が 2% 暗くなるだけで割る余裕しか無く、しかも 4.3〜4.5 という「ほぼ合っている」値なので
 * 目視レビューでは絶対に見つからない。同じことは赤にも起きる
 * （brand-600 は白地 4.83:1 だが red-50 上 4.41:1 / red-100 上 3.95:1 → 淡赤面では brand-700 以上）。
 * 個別の組を PAIRS に足すだけでは「まだ画面に無い面」を守れないので、
 * 末尾の FR-325-04 で **面のトークン一覧 × テキストのトークン一覧を総当たり**する。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { SPECIES, SURVEY_STATUS } from '@/lib/constants'

// ---------------------------------------------------------------------------
// globals.css のパース
// ---------------------------------------------------------------------------

// vitest は vitest.config.ts のあるディレクトリ（＝リポジトリルート）で走る。
// import.meta.url は jsdom 環境では file: にならないため cwd 起点で解決する。
const CSS = readFileSync(resolvePath(process.cwd(), 'src/app/globals.css'), 'utf8')
  // コメント内にも `--foo: #bar` 風の記述があるため先に落とす
  .replace(/\/\*[\s\S]*?\*\//g, '')

/** `{ ... }` ブロックの中身から `--name: value;` を拾う。 */
function parseDecls(body: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1]!.trim(), m[2]!.trim())
  }
  return out
}

/** トップレベルのセレクタブロック（`\n}` で閉じる前提の整形済み CSS）。 */
function blockBody(selector: string): string {
  const re = new RegExp(`(?:^|\\n)${selector}\\s*\\{([\\s\\S]*?)\\n\\}`)
  return CSS.match(re)?.[1] ?? ''
}

const rootVars = parseDecls(blockBody(':root'))
const darkVars = parseDecls(blockBody('\\.dark'))

/**
 * Tailwind 既定パレット（`--color-red-600: #dc2626` 等）。
 * 1 つめの `@theme` は `--color-brand-600: var(--color-brand-600)` のような
 * 自己参照エイリアスなので、**hex リテラルの宣言だけ**を採る（循環を作らない）。
 */
const palette = new Map<string, string>()
for (const m of CSS.matchAll(/@theme\s*\{([\s\S]*?)\n\}/g)) {
  for (const [name, value] of parseDecls(m[1]!)) {
    if (/^#[0-9a-f]{3,8}$/i.test(value)) palette.set(name, value)
  }
}

// ---------------------------------------------------------------------------
// 色の解決と WCAG 相対輝度
// ---------------------------------------------------------------------------

type Theme = 'light' | 'dark'
type Rgb = [number, number, number]

/**
 * `hsl()` を RGB へ。**8bit へ丸めて返す**のが重要な点。
 *
 * ブラウザは `hsl()` をチャンネル 8bit の sRGB にラスタライズしてから合成するので、
 * 画面に出るのは丸めた後の色である。ここで小数のまま比を取ると、実際に描画される色より
 * 有利な値が出て**基準割れを見逃す**。
 * 実例: `--color-text-faint`(hsl(220 9% 46%)) on `--color-surface-2`(hsl(0 14% 97%)) は
 * 小数のままだと 4.52:1 で AA を通るが、描画される #6b7280 on #f8f6f6 は 4.49:1 で割る。
 * REQ-324 以前はこの 0.03 の差だけで空状態の副文の違反がテストをすり抜けていた。
 */
function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const m = l - c / 2
  const [r, g, b]: Rgb =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
      : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

function parseLiteral(value: string): Rgb | null {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const raw = hex[1]!
    const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ]
  }
  // `hsl(220 9% 46%)`（Tailwind v4 で使うスペース区切りのモダン構文）
  const hsl = value.match(/^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/i)
  if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100)
  return null
}

/**
 * 色指定を RGB へ解決する。
 *  - `#rrggbb` … そのまま
 *  - `white` / `black` … Tailwind の同名ユーティリティ
 *  - `red-600` `slate-800` … globals.css の `@theme` が固定したパレット
 *  - `--color-surface` … `:root` / `.dark` のトークン（`var()` を再帰的に追跡）
 */
function resolve(spec: string, theme: Theme, seen = new Set<string>()): Rgb {
  if (spec === 'white') return [255, 255, 255]
  if (spec === 'black') return [0, 0, 0]

  const literal = parseLiteral(spec)
  if (literal) return literal

  const name = spec.startsWith('--') ? spec : `--color-${spec}`
  if (seen.has(name)) throw new Error(`CSS 変数が循環しています: ${name}`)
  seen.add(name)

  const value =
    (theme === 'dark' ? darkVars.get(name) : undefined) ?? rootVars.get(name) ?? palette.get(name)
  if (value === undefined) throw new Error(`globals.css に ${name} が見つかりません（${theme}）`)

  const varRef = value.match(/^var\(\s*(--[\w-]+)\s*\)$/)
  if (varRef) return resolve(varRef[1]!, theme, seen)

  const parsed = parseLiteral(value)
  if (!parsed) throw new Error(`解決できない色指定です: ${name} = ${value}`)
  return parsed
}

/** WCAG 2.x の相対輝度。 */
function relativeLuminance([r, g, b]: Rgb): number {
  const lin = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }) as Rgb
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

/** WCAG 2.x のコントラスト比（1〜21）。 */
export function contrastRatio(fg: Rgb, bg: Rgb): number {
  const a = relativeLuminance(fg)
  const b = relativeLuminance(bg)
  const [hi, lo] = a >= b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

function ratioOfHex(fgHex: string, bgHex: string): number {
  return contrastRatio(parseLiteral(fgHex)!, parseLiteral(bgHex)!)
}

/** REQ-323 FR-323-05: 解決した RGB を `#rrggbb` に戻す（constants の hex と突き合わせる用）。 */
function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

// ---------------------------------------------------------------------------
// 検証する組み合わせ
// ---------------------------------------------------------------------------

/** 本文・ラベルなどの可読テキスト。 */
const TEXT_MIN = 4.5
/** アイコン・境界線・グラフのバーなど、意味を担う非テキスト要素（WCAG 1.4.11）。 */
const UI_MIN = 3

interface Pair {
  where: string
  fg: string
  bg: string
  min: number
  theme: Theme
}

const PAIRS: Pair[] = [
  // ── 基幹トークン（themeClasses.ts のヘルパーが返す色）──────────────────
  { where: '本文（--color-text on カード面）', fg: '--color-text', bg: '--color-surface', min: TEXT_MIN, theme: 'light' },
  { where: '本文（--color-text on カード面）', fg: '--color-text', bg: '--color-surface', min: TEXT_MIN, theme: 'dark' },
  { where: '見出し heading()', fg: '--color-heading', bg: '--color-surface', min: TEXT_MIN, theme: 'light' },
  { where: '見出し heading()', fg: '--color-heading', bg: '--color-surface', min: TEXT_MIN, theme: 'dark' },
  { where: '補足 muted()', fg: '--color-text-muted', bg: '--color-surface', min: TEXT_MIN, theme: 'light' },
  { where: '補足 muted()', fg: '--color-text-muted', bg: '--color-surface', min: TEXT_MIN, theme: 'dark' },
  { where: '最弱 faint()', fg: '--color-text-faint', bg: '--color-surface', min: TEXT_MIN, theme: 'light' },
  { where: '最弱 faint()', fg: '--color-text-faint', bg: '--color-surface', min: TEXT_MIN, theme: 'dark' },
  { where: '最弱 faint()（ページ背景の上）', fg: '--color-text-faint', bg: '--color-bg', min: TEXT_MIN, theme: 'light' },
  { where: '最弱 faint()（ページ背景の上）', fg: '--color-text-faint', bg: '--color-bg', min: TEXT_MIN, theme: 'dark' },

  // ── 状態色（色 + アイコン + テキストの 3 点セットの「色」側）────────────
  { where: '状態: success', fg: '--color-success-fg', bg: '--color-success', min: TEXT_MIN, theme: 'light' },
  { where: '状態: success', fg: '--color-success-fg', bg: '--color-success', min: TEXT_MIN, theme: 'dark' },
  { where: '状態: warning', fg: '--color-warning-fg', bg: '--color-warning', min: TEXT_MIN, theme: 'light' },
  { where: '状態: warning', fg: '--color-warning-fg', bg: '--color-warning', min: TEXT_MIN, theme: 'dark' },
  { where: '状態: error', fg: '--color-error-fg', bg: '--color-error', min: TEXT_MIN, theme: 'light' },
  { where: '状態: error', fg: '--color-error-fg', bg: '--color-error', min: TEXT_MIN, theme: 'dark' },
  { where: '状態: info', fg: '--color-info-fg', bg: '--color-info', min: TEXT_MIN, theme: 'light' },
  { where: '状態: info', fg: '--color-info-fg', bg: '--color-info', min: TEXT_MIN, theme: 'dark' },

  // ── FR-318-01: 地図クラスタ（白の件数 on ブランド赤の円）────────────────
  { where: 'FR-318-01 地図クラスタの件数', fg: 'white', bg: '--color-brand-600', min: TEXT_MIN, theme: 'light' },

  // ── FR-318-02: 種別データ色（Wong 青×オレンジ。グラフのバー＝UI 部品）──
  { where: 'FR-318-02 種別色 american', fg: '--species-american', bg: '--color-surface', min: UI_MIN, theme: 'light' },
  { where: 'FR-318-02 種別色 american', fg: '--species-american', bg: 'slate-800', min: UI_MIN, theme: 'dark' },
  { where: 'FR-318-02 種別色 bullfrog', fg: '--species-bullfrog', bg: '--color-surface', min: UI_MIN, theme: 'light' },
  { where: 'FR-318-02 種別色 bullfrog', fg: '--species-bullfrog', bg: 'slate-800', min: UI_MIN, theme: 'dark' },

  // ── FR-318-03/04: RankingPage の選択中タブ（旧 emerald-500 = 2.54:1）──
  { where: 'FR-318-03 ranking 選択中タブの白文字', fg: 'white', bg: '--color-brand-600', min: TEXT_MIN, theme: 'light' },

  // ── FR-318-04: IntroPrompt［今後表示しない］（旧 gray-400 = 2.54:1）───
  { where: 'FR-318-04 ホームモーダル［今後表示しない］', fg: '--color-text-faint', bg: 'white', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-318-04 ホームモーダル［今後表示しない］', fg: '--color-text-faint', bg: 'slate-900', min: TEXT_MIN, theme: 'dark' },

  // ── FR-318-04 → REQ-322 FR-322-03: ranking の市町村チップ。
  //    amber 3 値（500/600/800）をこのチップだけのために抱えており、枠線の amber-600(#d97706) は
  //    種別色の橙 #d55e00 と見分けがつかなかった。「押せる＝ブランド赤」の規則へ合流させる。
  { where: 'FR-322-03 ranking 市町村チップのラベル', fg: '--color-brand-700', bg: '--color-surface', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-322-03 ranking 市町村チップの枠線', fg: '--color-brand-600', bg: '--color-surface', min: UI_MIN, theme: 'light' },
  { where: 'FR-322-03 ranking 市町村チップのラベル（ダーク）', fg: 'red-400', bg: 'slate-900', min: TEXT_MIN, theme: 'dark' },

  // ── FR-318-04: trends の棒グラフ
  //    REQ-322 FR-322-07 で --chart-neutral（非強調バー）と最新月バーのグラデ端は廃止した。
  //    バーは全月ブランド赤の 1 色になり、下の「FR-321-04 trends のバー」がその検証を担う。

  // ── FR-318-04: ラベル無しアイコンボタン（旧 gray-300 = 1.47:1）─────────
  { where: 'FR-318-04 投稿の編集/削除アイコン', fg: '--color-text-faint', bg: '--color-surface', min: UI_MIN, theme: 'light' },
  { where: 'FR-318-04 投稿の編集/削除アイコン', fg: '--color-text-faint', bg: '--color-surface', min: UI_MIN, theme: 'dark' },

  // ── FR-318-09: LP マーキーの一時停止ボタン（不透明背景・独立配置）──────
  { where: 'FR-318-09 LP マーキー停止ボタンのラベル', fg: 'gray-700', bg: 'white', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-318-09 LP マーキー停止ボタンのラベル', fg: 'slate-200', bg: 'slate-900', min: TEXT_MIN, theme: 'dark' },
  { where: 'FR-318-09 LP マーキー停止ボタンの枠線', fg: 'gray-500', bg: 'white', min: UI_MIN, theme: 'light' },
  { where: 'FR-318-09 LP マーキー停止ボタンの枠線', fg: 'slate-500', bg: 'slate-900', min: UI_MIN, theme: 'dark' },

  // ══ REQ-320 FR-320-09: FR-320-04（赤の一本化）で直した組 ══════════════════
  //
  // 旧: `bg-red-500 text-white` = #ffffff on #ef4444 = 3.76:1（AA 未満）が 24 箇所。
  //     内訳は round0-contrast-audit.md の「P1 の内訳」。
  //     主ボタン（再試行・録音開始・写真追加・空状態 CTA・ページ再読み込み）、
  //     タブ（ranking 期間切替・area 種フィルタ・DrawerMenu 言語切替）、
  //     バッジ（FilterBar の ON / 件数）がすべてこの 1 組に集約されていた。
  // 新: `bg-brand-600 text-white`（= --color-brand-600 = #dc2626 = 4.83:1）。
  //     ダークでもブランド段は据え置き（globals.css の .dark にブランド段の上書きが無い）なので
  //     light/dark 両方を同じ値で検証する。
  { where: 'FR-320-04 主ボタン/タブ/バッジ（bg-brand-600 + 白文字）', fg: 'white', bg: '--color-brand-600', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-320-04 主ボタン/タブ/バッジ（bg-brand-600 + 白文字）', fg: 'white', bg: '--color-brand-600', min: TEXT_MIN, theme: 'dark' },
  { where: 'FR-320-04 主ボタン hover（bg-brand-700 + 白文字）', fg: 'white', bg: '--color-brand-700', min: TEXT_MIN, theme: 'light' },

  // 旧: AudioRecorder の録音/アップロード切替タブは `bg-white text-red-500` = 3.76:1（同値）。
  // 新: `text-brand-700`（#b91c1c = 6.47:1）。
  { where: 'FR-320-04 白地タブの選択中ラベル（text-brand-700）', fg: '--color-brand-700', bg: 'white', min: TEXT_MIN, theme: 'light' },

  // 主 CTA（btnPrimaryCls）。
  // 旧: from #ef4444（3.76:1・AA 未満）→ to #e11d48。**上端が基準割れ**していたうえ、
  //     ベタ塗りの #dc2626 と並ぶと「押せる赤」が 2 色に見えていた（REQ-320 で上端を修正）。
  // REQ-322 FR-322-03: 残っていた下端 #e11d48（rose-600）も廃止し、グラデ自体をやめて単色にした。
  //     検証する値は --color-accent と --color-accent-hover の 2 つだけになる。
  { where: 'FR-322-03 主CTA（--color-accent 単色）', fg: 'white', bg: '--color-accent', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-322-03 主CTA hover（--color-accent-hover）', fg: 'white', bg: '--color-accent-hover', min: TEXT_MIN, theme: 'light' },

  // ── FR-320-08: EarlyStageNote（「まだ少ない」注記）────────────────────────
  // 淡い面（--color-surface-2）の上に muted テキストとブランド赤の CTA が乗る。
  { where: 'FR-320-08 まだ少ない注記の本文', fg: '--color-text-muted', bg: '--color-surface-2', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-320-08 まだ少ない注記の本文', fg: '--color-text-muted', bg: '--color-surface-2', min: TEXT_MIN, theme: 'dark' },
  { where: 'FR-320-08 まだ少ない注記の CTA', fg: 'white', bg: '--color-brand-600', min: TEXT_MIN, theme: 'light' },

  // ── REQ-324: 空状態（EmptyState）の副文 = description ─────────────────────
  // EarlyStageNote の `title` 版は EmptyState を淡い面（--color-surface-2 = #f8f6f6）で包む。
  // 副文はここだけ白カードではない面に載るため、白基準で選んだ faint() では届かない
  // （#6b7280 on #f8f6f6 = 4.49:1）。上の「注記の本文」と fg/bg は同じだが、
  // **別のコンポーネントの別の要素**がこの値に依存していることを行として残す。
  { where: 'REQ-324 空状態の副文（EmptyState description on 淡い面）', fg: '--color-text-muted', bg: '--color-surface-2', min: TEXT_MIN, theme: 'light' },
  { where: 'REQ-324 空状態の副文（EmptyState description on 淡い面）', fg: '--color-text-muted', bg: '--color-surface-2', min: TEXT_MIN, theme: 'dark' },
  // 同じ副文は白カード／ページ背景の上にも出る（EmptyState 単体の置かれ方）。
  { where: 'REQ-324 空状態の副文（ページ背景上）', fg: '--color-text-muted', bg: '--color-bg', min: TEXT_MIN, theme: 'light' },
  { where: 'REQ-324 空状態の副文（ページ背景上）', fg: '--color-text-muted', bg: '--color-bg', min: TEXT_MIN, theme: 'dark' },
  // マスコット線画は装飾（aria-hidden）だが faint() のまま淡い面に残るので、非テキスト 3:1 側で見張る。
  { where: 'REQ-324 空状態のマスコット線画（faint on 淡い面）', fg: '--color-text-faint', bg: '--color-surface-2', min: UI_MIN, theme: 'light' },
  { where: 'REQ-324 空状態のマスコット線画（faint on 淡い面）', fg: '--color-text-faint', bg: '--color-surface-2', min: UI_MIN, theme: 'dark' },

  // ══ REQ-321 FR-321-08: FR-321-03（緑の廃止）で直した組 ══════════════════════
  //
  // 旧: RankingPage の Sparkles・🏅・「あなた」が `text-emerald-500`（#10B981）。
  //     白面 2.54:1 で AA の 6 割弱、かつ REQ-224 が禁じた「赤いナビと同一画面の緑」だった。
  //     カバレッジバーの `bg-emerald-500` は gray-200 のトラック上で 1.87:1（UI 部品 3:1 未満）。
  // 新: ライト = ブランド赤 #dc2626 / ダーク = red-400 #f87171。
  //     ダークで #dc2626 のままだと暗いカード面で 2.4:1 に落ちるため、テーマごとに解決する。
  { where: 'FR-321-03 ranking の強調テキスト（ACCENT・ライト）', fg: '--color-brand-600', bg: '--color-surface', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-321-03 ranking の強調テキスト（ACCENT・ダーク）', fg: 'red-400', bg: '--color-surface', min: TEXT_MIN, theme: 'dark' },
  { where: 'FR-321-03 カバレッジバー（gray-200 トラック上）', fg: '--color-brand-600', bg: 'gray-200', min: UI_MIN, theme: 'light' },
  { where: 'FR-321-03 カバレッジバー（slate-700 トラック上）', fg: 'red-400', bg: 'slate-700', min: UI_MIN, theme: 'dark' },

  // ══ REQ-321 FR-321-08: FR-321-04（trends の赤の一本化）で直した組 ═══════════
  //
  // 旧: 同じ trends 画面に 3 種類の赤が同居していた。いずれもグラデで、
  //     帯の途中がブランド赤ではない色（評価者の実測 #F7636B / #F05E5C）になっていた。
  //       - BarChart 最新月バー   … from-red-600 to-red-500
  //       - 情報種別バー           … from-red-400 to-rose-500
  //       - 市区町村バー           … from-red-400 to-red-600
  // 新: 3 本とも単色の `bg-brand-600`。バーは「データそのもの」なので UI 部品 3:1 で判定する。
  //     ダークの下地は TrendsPage のカード（`bg-slate-800`）。3.03:1 と余裕は小さいが基準内。
  { where: 'FR-321-04 trends のバー（白カード上）', fg: '--color-brand-600', bg: '--color-surface', min: UI_MIN, theme: 'light' },
  { where: 'FR-321-04 trends のバー（ダークカード slate-800 上）', fg: '--color-brand-600', bg: 'slate-800', min: UI_MIN, theme: 'dark' },

  // ══ REQ-322 FR-322-09: 本周（FR-322-03 / FR-322-04）で変えた色 ═══════════════════
  //
  // FR-322-03: 状態色の青を種別色の青へ統合した（#0369a1 → #0072b2 / dark #38bdf8 → #56b4e9）。
  // 「白文字を載せる面としての info」は上の『状態: info』が見ているので、ここでは
  // **文字色として使う info**（about の「飼育は可」表示）を見る。
  // REQ-323 FR-323-05: 外来生物法カードの下地を red-50 / orange-50 から無彩色へ移したので、
  // 下地も白（ライト）／slate-800 相当（ダーク）に更新する。
  { where: 'FR-322-03 about 許可表示（text-info on 白カード）', fg: '--color-info', bg: 'white', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-322-03 about 許可表示（text-info on slate-900）', fg: '--color-info', bg: 'slate-900', min: TEXT_MIN, theme: 'dark' },

  // FR-322-04(1): パンくずのリンク。灰背景ページ（--color-bg）と白背景ページの両方で通す値にする。
  { where: 'FR-322-04 パンくずのリンク（gray-600 on ページ背景）', fg: 'gray-600', bg: '--color-bg', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-322-04 パンくずのリンク（gray-600 on 白）', fg: 'gray-600', bg: 'white', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-322-04 パンくずのリンク（slate-400 on slate-950）', fg: 'slate-400', bg: 'slate-950', min: TEXT_MIN, theme: 'dark' },

  // FR-322-04(2): 検索・入力欄のプレースホルダ（::placeholder）。
  { where: 'FR-322-04 プレースホルダ（gray-500 on 白）', fg: 'gray-500', bg: 'white', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-322-04 プレースホルダ（slate-400 on slate-800）', fg: 'slate-400', bg: 'slate-800', min: TEXT_MIN, theme: 'dark' },

  // FR-322-04(3): LP の「SCROLL」。下地はヒーロー画像の明るいグレー（評価者の実測 #ececec）。
  { where: 'FR-322-04 LP SCROLL（gray-600 on ヒーロー画像の明部）', fg: 'gray-600', bg: '#ececec', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-322-04 LP SCROLL（slate-400 on slate-950）', fg: 'slate-400', bg: 'slate-950', min: TEXT_MIN, theme: 'dark' },

  // FR-322-08: 地図上のパネル切替（黒 60% の半透明ピル）。
  // 下地が真っ白なタイルのときが最も薄くなる＝ #666666 相当。そこで白文字が通れば
  // どのタイルでも通る（タイルが暗いほど比は上がる）。
  { where: 'FR-322-08 地図の表示切替ピル（白文字 on 黒60%の最悪ケース）', fg: 'white', bg: '#666666', min: TEXT_MIN, theme: 'light' },

  // ══ REQ-323 FR-323-12: 本周（FR-323-02 / 05 / 06）で変えた色 ═══════════════════
  //
  // FR-323-02: LP 最終CTA（ブランド赤のグラデ面）。評価者が実測した帯の中間色 #C93636 と、
  // 帯の最も明るい端 = --color-brand-600 の両方で通ることを見る（どこを切っても AA）。
  { where: 'FR-323-02 LP 最終CTA の eyebrow（白 on 赤グラデの中間）', fg: 'white', bg: '#c93636', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-323-02 LP 最終CTA の eyebrow（白 on 帯の最明部）', fg: 'white', bg: '--color-brand-600', min: TEXT_MIN, theme: 'light' },
  // 白 80% を #c93636 に重ねた実効色（= rgb(244,215,215)）。border-white/80 の実体。
  { where: 'FR-323-02 LP 最終CTA の副CTA枠線（白80% on 赤グラデ）', fg: '#f4d7d7', bg: '#c93636', min: UI_MIN, theme: 'light' },
  // FR-323-02: マーキー帯。縁取り文字（-webkit-text-stroke）と英字ラベルの 2 系統。
  { where: 'FR-323-02 LP マーキーの縁取り（--lp-stroke on 白）', fg: '--color-brand-600', bg: 'white', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-323-02 LP マーキーの縁取り（ダーク）', fg: 'red-400', bg: 'slate-950', min: TEXT_MIN, theme: 'dark' },
  { where: 'FR-323-02 LP マーキーの英字ラベル', fg: 'gray-600', bg: 'white', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-323-02 LP マーキーの英字ラベル（ダーク）', fg: 'slate-400', bg: 'slate-950', min: TEXT_MIN, theme: 'dark' },

  // FR-323-06: 「量」を表すデータバー。トラック（gray-200 / slate-700）とカード面の両方で
  // UI 部品 3:1 を満たすことを見る。第1周の #D6D9DF（1.1:1）へ戻さないためのゲート。
  { where: 'FR-323-06 データバー（白カード上）', fg: '--chart-quantity', bg: '--color-surface', min: UI_MIN, theme: 'light' },
  { where: 'FR-323-06 データバー（gray-100 トラック上）', fg: '--chart-quantity', bg: 'gray-100', min: UI_MIN, theme: 'light' },
  { where: 'FR-323-06 データバー（gray-200 トラック上）', fg: '--chart-quantity', bg: 'gray-200', min: UI_MIN, theme: 'light' },
  { where: 'FR-323-06 データバー（ダークカード slate-800 上）', fg: '--chart-quantity', bg: 'slate-800', min: UI_MIN, theme: 'dark' },
  { where: 'FR-323-06 データバー（slate-700 トラック上）', fg: '--chart-quantity', bg: 'slate-700', min: UI_MIN, theme: 'dark' },

  // FR-323-03: 地図ホームのヘッダーに常設した説明行（11px＝小さい文字なので余裕を見る）。
  { where: 'FR-323-03 ヘッダーの説明行', fg: 'gray-600', bg: 'white', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-323-03 ヘッダーの説明行（ダーク）', fg: 'slate-300', bg: 'slate-950', min: TEXT_MIN, theme: 'dark' },

  // FR-323-01: デスクトップ水平ナビ。非選択（gray-600）／選択（brand-600 on red-50）／投稿（白 on accent）。
  { where: 'FR-323-01 デスクトップナビの非選択ラベル', fg: 'gray-600', bg: 'white', min: TEXT_MIN, theme: 'light' },
  // 選択中は red-50 の淡赤地に載る。brand-600 だと 4.41:1 で AA を割るため brand-700。
  { where: 'FR-323-01 デスクトップナビの選択中ラベル', fg: '--color-brand-700', bg: 'red-50', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-323-01 デスクトップナビの投稿ボタン', fg: 'white', bg: '--color-accent', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-323-01 デスクトップナビの非選択ラベル（ダーク）', fg: 'slate-300', bg: 'slate-950', min: TEXT_MIN, theme: 'dark' },

  // ══ REQ-325 FR-325-01/02: 「色の付いた面に載せる文字は muted 以上」で直した組 ══════
  //
  // ■ 潰した構造（個別の色の問題ではない）
  // 二次テキストの既定 `--color-text-faint`（= gray-500 #6b7280）は **白地専用の余裕**しか無い:
  //     白 #ffffff         4.83:1 ✅
  //     ページ背景 #f9fafb  4.63:1 ✅
  //     淡い面 #f8f6f6      4.49:1 ❌（REQ-324 で発覚した空状態の副文）
  //     gray-100 #f3f4f6    4.39:1 ❌（本周: ranking タブ / InstallBanner hover）
  //     red-50   #fef2f2    4.42:1 ❌（本周: ranking「あなた」の行）
  //     blue-50  #eff6ff    4.44:1 ❌（本周: 公式コメントの日時）
  // ＝**面が 2% 暗くなるだけで割る**。だから「白地で選んだ色を、色の付いた面に流用しない」。
  // 同じことが赤にも起きる: brand-600(#dc2626) は白地 4.83:1 だが red-50 上 4.41:1 / red-100 上 3.95:1。
  // 総当たりの検証は下の「FR-325-04」の describe が担い、ここは**実際に直した箇所**を残す。

  // FR-325-01(1): ranking / AudioRecorder のタブトラック（gray-100）に載る非選択ラベル。
  { where: 'FR-325-01 タブトラックの非選択ラベル', fg: 'gray-600', bg: 'gray-100', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-325-01 タブトラックの非選択ラベル（ダーク）', fg: 'slate-400', bg: 'slate-800', min: TEXT_MIN, theme: 'dark' },

  // FR-325-01(2): InstallBanner［今はしない］。hover でだけ下地が gray-100 に変わる＝
  // 「押している最中だけ AA 未満」で、静止画のレビューでは絶対に見つからない類の欠陥。
  { where: 'FR-325-01 InstallBanner［今はしない］（平常時 = 白カード）', fg: 'gray-600', bg: 'white', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-325-01 InstallBanner［今はしない］（hover = gray-100）', fg: 'gray-600', bg: 'gray-100', min: TEXT_MIN, theme: 'light' },

  // FR-325-01(3): ranking の「あなた」の行（red-50）に載る副文・順位・単位。
  { where: 'FR-325-01 ranking 自分の行の副文（muted on red-50）', fg: '--color-text-muted', bg: 'red-50', min: TEXT_MIN, theme: 'light' },
  // 品質タブの自分の行は sky-50。faint でも 4.54:1 で基準内なので**触っていない**ことの記録。
  { where: 'FR-325-01 ranking 品質タブ 自分の行（faint on sky-50・据え置き）', fg: '--color-text-faint', bg: 'sky-50', min: TEXT_MIN, theme: 'light' },

  // FR-325-01(4): 公式コメント（blue-50）の日時・確認文。通常のコメントは gray-50。
  { where: 'FR-325-01 公式コメントの日時（gray-600 on blue-50）', fg: 'gray-600', bg: 'blue-50', min: TEXT_MIN, theme: 'light' },

  // FR-325-01(5): 淡赤面に載る赤。ブランド赤ではなく brand-700 を使う（HeaderDesktopNav と同じ規則）。
  { where: 'FR-325-01 red-50 面の赤い文字（いいね済み・フィルタ ON・ドロワー）', fg: '--color-brand-700', bg: 'red-50', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-325-01 red-100 面の赤い文字（手順番号・却下バッジ）', fg: '--color-brand-700', bg: 'red-100', min: TEXT_MIN, theme: 'light' },

  // FR-325-01(6): gray-100 のチップ・バッジ（MyPosts の AI 判定 / 調査依頼のステータス）。
  { where: 'FR-325-01 gray-100 チップのラベル', fg: 'gray-600', bg: 'gray-100', min: TEXT_MIN, theme: 'light' },

  // FR-325-02: LP ヒーローの eyebrow。下地は白ではなく `bg-primary-500/15` のオーブが乗った
  // 淡赤（実効 #fde3e3。評価者の実測は #FDE5E5〜#FDE9E9）。ここに brand-600 だと 4.0:1 しか無い。
  { where: 'FR-325-02 LP hero eyebrow（brand-800 on オーブの最濃部）', fg: '--color-brand-800', bg: '#fde3e3', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-325-02 LP hero eyebrow（brand-800 on 評価者実測 #FDE5E5）', fg: '--color-brand-800', bg: '#fde5e5', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-325-02 LP hero eyebrow（オーブの外＝素の白地）', fg: '--color-brand-800', bg: 'white', min: TEXT_MIN, theme: 'light' },
  // ダークの LP は反転面（slate-950）。brand-800 のままだと 1.9:1 なので明側の red-400 へ振る。
  { where: 'FR-325-02 LP hero eyebrow（ダーク red-400 on slate-950）', fg: 'red-400', bg: 'slate-950', min: TEXT_MIN, theme: 'dark' },

  // ══ REQ-326 FR-326-01: StatsBar の前月比（赤×緑の取りこぼし）═══════════════════
  //
  // 下地は白ではなく StatsBar 自身の帯（ライト = bg-red-50 / ダーク = bg-slate-900）。
  // 隣の「今月」「件」と同じ二次テキスト色に揃えたので、検証もその 2 組で行う。
  { where: 'FR-326-01 StatsBar 前月比（gray-600 on red-50 の帯）', fg: 'gray-600', bg: 'red-50', min: TEXT_MIN, theme: 'light' },
  { where: 'FR-326-01 StatsBar 前月比（slate-400 on slate-900 の帯）', fg: 'slate-400', bg: 'slate-900', min: TEXT_MIN, theme: 'dark' },
]

/**
 * REQ-325 FR-325-04: **面 × 二次テキストの総当たり**。
 *
 * ■ なぜ PAIRS だけでは足りないのか
 * PAIRS は「実際に画面にあった組」を 1 行ずつ足す表なので、**まだ画面に無い組**は守れない。
 * 本周の不合格 3 件（ranking タブ・LP eyebrow・InstallBanner hover）は 3 つとも
 * 「既に有る色を、新しい面へ持って行っただけ」で生まれている。個別の行を足しても、
 * 次に誰かが別の面へ同じ色を持って行けば同じ事故が起きる。
 * そこで「この面にこの文字を載せてよい」という**組み合わせの許可リスト**自体を固定する。
 *
 * ■ ルール（これが本体）
 * 白 / ページ背景（#f9fafb）以外の**色の付いた面**に載せるテキストは、
 * `--color-text-muted`（#5d636f）以上の濃さにする。`--color-text-faint`（#6b7280）は白地専用。
 */
const TINTED_SURFACES: { name: string; spec: string; theme: Theme }[] = [
  // ライト: 実際にコード中で二次テキストの下地になっている淡い面。
  { name: '淡い面 --color-surface-2', spec: '--color-surface-2', theme: 'light' },
  { name: '仕切り --color-divider', spec: '--color-divider', theme: 'light' },
  { name: 'gray-50（ページ背景・内側の箱）', spec: 'gray-50', theme: 'light' },
  { name: 'gray-100（タブトラック・チップ・hover 面）', spec: 'gray-100', theme: 'light' },
  { name: 'gray-200（グラフのトラック）', spec: 'gray-200', theme: 'light' },
  { name: 'red-50（選択中・自分の行・hover 面）', spec: 'red-50', theme: 'light' },
  { name: 'red-100（手順番号・却下バッジ）', spec: 'red-100', theme: 'light' },
  { name: 'blue-50（公式コメント）', spec: 'blue-50', theme: 'light' },
  { name: 'sky-50（ranking 品質タブの自分の行）', spec: 'sky-50', theme: 'light' },
  { name: 'amber-50（注意書き）', spec: 'amber-50', theme: 'light' },
  { name: 'orange-50（3 位の行）', spec: 'orange-50', theme: 'light' },
  { name: 'green-50', spec: 'green-50', theme: 'light' },
  // ダーク: トークンで表せる面だけ（`bg-red-500/20` のような半透明は静的には解けないので除く）。
  { name: '淡い面 --color-surface-2', spec: '--color-surface-2', theme: 'dark' },
  { name: '仕切り --color-divider', spec: '--color-divider', theme: 'dark' },
  { name: 'slate-800（カード面）', spec: 'slate-800', theme: 'dark' },
  { name: 'slate-700（トラック）', spec: 'slate-700', theme: 'dark' },
]

/** 色の付いた面に載せてよい二次テキスト（＝ muted 以上）。ここに faint は入らない。 */
const SECONDARY_TEXT_ON_TINT: { name: string; spec: string; theme: Theme }[] = [
  { name: 'muted()', spec: '--color-text-muted', theme: 'light' },
  { name: 'gray-600', spec: 'gray-600', theme: 'light' },
  { name: 'muted()', spec: '--color-text-muted', theme: 'dark' },
  { name: 'slate-300', spec: 'slate-300', theme: 'dark' },
]

const TINT_MATRIX = TINTED_SURFACES.flatMap((bg) =>
  SECONDARY_TEXT_ON_TINT.filter((fg) => fg.theme === bg.theme).map((fg) => ({
    theme: bg.theme,
    fgName: fg.name,
    bgName: bg.name,
    fg: fg.spec,
    bg: bg.spec,
  })),
)

// ---------------------------------------------------------------------------

describe('REQ-318 FR-318-05: WCAG コントラスト', () => {
  it('globals.css からパレットとトークンを読めている', () => {
    // パースが黙って空振りすると全テストが素通りするので、まず土台を確かめる。
    expect(palette.get('--color-red-600')).toBe('#dc2626')
    expect(rootVars.has('--color-text-faint')).toBe(true)
    expect(darkVars.has('--color-text-faint')).toBe(true)
    expect(palette.size).toBeGreaterThan(100)
  })

  it('コントラスト比の計算が WCAG の既知値と一致する', () => {
    expect(ratioOfHex('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(ratioOfHex('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    // WebAIM の代表例（#767676 on white がちょうど 4.5:1 の境界）
    expect(ratioOfHex('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(ratioOfHex('#777777', '#ffffff')).toBeLessThan(4.5)
  })

  it.each(PAIRS)('[$theme] $where は $min:1 以上', ({ where, fg, bg, min, theme }) => {
    const ratio = contrastRatio(resolve(fg, theme), resolve(bg, theme))
    expect(
      ratio,
      `${where}（${theme}）: ${fg} on ${bg} = ${ratio.toFixed(2)}:1（要 ${min}:1）`,
    ).toBeGreaterThanOrEqual(min)
  })

  /**
   * AC-05: このテストが「ゲートとして機能する」ことの証明。
   * REQ-318 の実測値（round0b-score.md）を計算し直し、
   * 直す前の色を PAIRS に入れれば必ず落ちることを固定する。
   * ここが緑のまま上の it.each だけ通る＝計算式が壊れている、という取り違えを防ぐ。
   */
  it('AC-05: 修正前の配色は基準を下回る（＝ゲートとして機能する）', () => {
    // 旧 ranking 選択中タブ: 白 on emerald-500
    expect(ratioOfHex('#ffffff', '#10b981')).toBeCloseTo(2.54, 1)
    expect(ratioOfHex('#ffffff', '#10b981')).toBeLessThan(TEXT_MIN)
    // 旧ホームモーダル［今後表示しない］: gray-400 on 白
    expect(ratioOfHex('#9ca3af', '#ffffff')).toBeCloseTo(2.54, 1)
    expect(ratioOfHex('#9ca3af', '#ffffff')).toBeLessThan(TEXT_MIN)
    // 旧 ranking 品質タブ: 白 on sky-500
    expect(ratioOfHex('#ffffff', '#0ea5e9')).toBeLessThan(TEXT_MIN)
    // 旧 ranking 投稿数タブ: 白 on red-500
    expect(ratioOfHex('#ffffff', '#ef4444')).toBeLessThan(TEXT_MIN)
    // 旧・編集/削除アイコン: gray-300 on 白（UI 部品 3:1 にも届かない）
    expect(ratioOfHex('#d1d5db', '#ffffff')).toBeCloseTo(1.47, 1)
    expect(ratioOfHex('#d1d5db', '#ffffff')).toBeLessThan(UI_MIN)
    // 旧 trends 非強調バー: gray-200 on 白カード
    expect(ratioOfHex('#e5e7eb', '#ffffff')).toBeLessThan(UI_MIN)
    // 旧 trends 最新月バーの上端: red-400 on 白カード
    expect(ratioOfHex('#f87171', '#ffffff')).toBeLessThan(UI_MIN)
    // 旧 ranking 市町村チップの枠線: amber-300 on 白
    expect(ratioOfHex('#fcd34d', '#ffffff')).toBeLessThan(UI_MIN)
  })

  /**
   * REQ-320 FR-320-09 / AC-05 と同趣旨: 本周（FR-320-04）で直した組も、
   * 「直す前の値なら必ず落ちる」ことを固定しておく。
   */
  it('FR-320-04: 修正前の赤（red-500 / accent 上端 #ef4444）は基準を下回る', () => {
    // 旧 P1: bg-red-500 + 白文字（24 箇所）と、旧 btnPrimaryCls のグラデ上端は同じ #ef4444。
    expect(ratioOfHex('#ffffff', '#ef4444')).toBeCloseTo(3.76, 1)
    expect(ratioOfHex('#ffffff', '#ef4444')).toBeLessThan(TEXT_MIN)
    // 旧 AudioRecorder の白地タブ: text-red-500 on 白（同値 3.76）
    expect(ratioOfHex('#ef4444', '#ffffff')).toBeLessThan(TEXT_MIN)
    // 新しい値（#dc2626）は基準を満たす＝置換に意味があることの対比
    expect(ratioOfHex('#ffffff', '#dc2626')).toBeGreaterThanOrEqual(TEXT_MIN)
  })

  /**
   * FR-320-04 は「赤を 1 系統に寄せる」要件なので、
   * **主 CTA のグラデ上端がブランド赤と同じ色であること**自体をテストで固定する。
   * 比率だけ見ていると、たとえば #e11d48 単色に寄せても通ってしまい「一本化」が崩れる。
   */
  it('FR-320-04: 主CTAグラデの上端＝ブランド赤（色が 1 系統に寄っている）', () => {
    expect(rootVars.get('--color-accent')).toBe(rootVars.get('--color-brand-600'))
    expect(rootVars.get('--color-accent-hover')).toBe(rootVars.get('--color-brand-700'))
  })

  /**
   * REQ-321 FR-321-08 / AC-05 と同趣旨: 本周で捨てた色が「捨てるに足る値だった」ことを固定する。
   * 直した後の値だけを検証していると、将来だれかが元へ戻したときに理由が残らない。
   */
  it('FR-321-03: 廃止した緑（emerald-500）は基準を下回る', () => {
    // 旧 Sparkles・🏅・「あなた」: text-emerald-500 on 白カード
    expect(ratioOfHex('#10b981', '#ffffff')).toBeCloseTo(2.54, 1)
    expect(ratioOfHex('#10b981', '#ffffff')).toBeLessThan(TEXT_MIN)
    // 旧カバレッジバー: bg-emerald-500 on gray-200 のトラック（UI 部品 3:1 にも届かない）
    expect(ratioOfHex('#10b981', '#e5e7eb')).toBeLessThan(UI_MIN)
    // 新しい値（#dc2626）はどちらの基準も満たす
    expect(ratioOfHex('#dc2626', '#ffffff')).toBeGreaterThanOrEqual(TEXT_MIN)
    expect(ratioOfHex('#dc2626', '#e5e7eb')).toBeGreaterThanOrEqual(UI_MIN)
  })

  /**
   * FR-321-04 は「trends の赤を 1 系統に寄せる」要件なので、比率だけでなく
   * **バーの色がブランド赤そのものであること**を固定する。
   * 比率だけ見ていると、たとえば rose-600 単色に寄せても通ってしまい「一本化」が崩れる。
   */
  /**
   * REQ-322 FR-322-09 / AC-05: 「近似色の統合」は比率では検出できないので、
   * **値が 1 つに寄っていること自体**を固定する（FR-320-04 の accent と同じ考え方）。
   * ここが緑のままなら、誰かが再び「ほぼ同じだが別の値」を持ち込んでも気づけない。
   */
  it('FR-322-03: 青は 1 系統（--color-info ＝ --chart-1 ＝ 種別色の青）', () => {
    expect(rootVars.get('--chart-1')).toBe('#0072b2')
    expect(rootVars.get('--color-info')).toBe(rootVars.get('--chart-1'))
    expect(darkVars.get('--color-info')).toBe(darkVars.get('--chart-1'))
    // 調査依頼の「対応あり」も同じ青（用途別トークンだが値は 1 つ）
    expect(rootVars.get('--state-survey-responded')).toBe(rootVars.get('--chart-1'))
    expect(darkVars.get('--state-survey-responded')).toBe(darkVars.get('--chart-1'))
    // 捨てた青は別値だった（＝統合に意味があったことの記録）
    expect('#0369a1').not.toBe(rootVars.get('--color-info'))
    expect('#38bdf8').not.toBe(darkVars.get('--color-info'))
    // 統合しても AA は維持できる（白文字 5.19:1 / 旧 #0369a1 は 5.70:1）
    expect(ratioOfHex('#ffffff', '#0072b2')).toBeGreaterThanOrEqual(TEXT_MIN)
    // 地図マーカーのように CSS を経由しない色は constants.ts が持つ。
    // ここが CSS トークンとズレると「トークンは直したのに画面は別の青」になる（実際そうだった）。
    const responded = SURVEY_STATUS.find((s) => s.value === 'responded')
    expect(responded?.color.toLowerCase()).toBe(rootVars.get('--state-survey-responded'))
  })

  it('FR-322-03: 主 CTA の赤は単色（グラデ下端 #e11d48 を廃止した）', () => {
    expect(rootVars.get('--color-accent')).toBe(rootVars.get('--color-brand-600'))
    // 下端トークンそのものを消す。残しておくと「使っていないのに定義がある」状態から
    // いつでも 2 色目の赤が復活する。
    expect(rootVars.has('--color-accent-to')).toBe(false)
    expect(rootVars.has('--color-accent-hover-to')).toBe(false)
    // 捨てた rose-600 はブランド赤とは別の色（比率だけでは落とせなかった）
    expect(ratioOfHex('#ffffff', '#e11d48')).toBeGreaterThanOrEqual(TEXT_MIN)
    expect('#e11d48').not.toBe(rootVars.get('--color-brand-600'))
  })

  /**
   * REQ-322 FR-322-03: about の「条件付特定外来生物」バッジ（旧 orange-700 on orange-100）を
   * **色を寄せるのではなく灰チップへ統合**した理由の記録。
   * 近似色 #c2410c を種別色の橙 #d55e00 に寄せると、淡橙地の上で AA を割る。
   */
  it('FR-322-03: 橙バッジは「#d55e00 へ寄せる」では AA を満たせない（灰へ統合した根拠）', () => {
    // 旧: orange-700 on orange-100 は AA ぎりぎり通っていた（評価者の実測 4.41 はアンチエイリアス）
    expect(ratioOfHex('#c2410c', '#ffedd5')).toBeGreaterThanOrEqual(TEXT_MIN)
    // 種別色の橙へ寄せると 3.4:1 まで落ちる＝この解き方は採れない
    expect(ratioOfHex('#d55e00', '#ffedd5')).toBeLessThan(TEXT_MIN)
    // 実際に採った灰チップ（gray-600 on gray-100）は余裕をもって通る
    expect(ratioOfHex('#4b5563', '#f3f4f6')).toBeGreaterThanOrEqual(TEXT_MIN)
  })

  /**
   * REQ-322 FR-322-04 / AC-05 と同趣旨。本周で直した 3 点は「直す前なら落ちる」ことを固定する。
   * あわせて、**評価者の実測が誤っていた 1 件**（パンくず）も記録に残す。
   */
  it('FR-322-04: 修正前の 3 点は基準を下回る（パンくずだけは例外）', () => {
    // 検索プレースホルダ: gray-400 on 白 = 2.54:1（採点 #5 の実測と一致）
    expect(ratioOfHex('#9ca3af', '#ffffff')).toBeCloseTo(2.54, 1)
    expect(ratioOfHex('#9ca3af', '#ffffff')).toBeLessThan(TEXT_MIN)
    // 同ダーク: slate-600 on slate-800 = 1.93:1
    expect(ratioOfHex('#475569', '#1e293b')).toBeLessThan(TEXT_MIN)
    // LP「SCROLL」: gray-400 on ヒーロー画像の明部 = 2.10:1（採点 #6 の実測と一致）
    expect(ratioOfHex('#9ca3af', '#ececec')).toBeCloseTo(2.10, 1)
    expect(ratioOfHex('#9ca3af', '#ececec')).toBeLessThan(TEXT_MIN)
    // パンくず: 評価者は「#747A88 on #F9FAFB = 4.12:1・AA 未達」と報告したが、
    // CSS 上の実値は gray-500(#6b7280) で 4.63:1 ＝**もともと AA は満たしていた**。
    // #747A88 は 12px 文字のアンチエイリアス画素。診断は誤りだったが余裕が 0.13 しか
    // 無かったので gray-600 へ底上げした（7.23:1）。この 2 行が判断の根拠の記録。
    expect(ratioOfHex('#6b7280', '#f9fafb')).toBeGreaterThanOrEqual(TEXT_MIN)
    expect(ratioOfHex('#4b5563', '#f9fafb')).toBeGreaterThan(ratioOfHex('#6b7280', '#f9fafb'))
  })

  /**
   * REQ-323 FR-323-12 / AC-05 と同趣旨: 本周で捨てた「白の不透明度」は、下地が赤だと
   * 基準を割ることを固定する。白 60%/85%/50% は **slate-950 の上なら通っていた**ので、
   * 「同じクラスを別の面に流用した」ことが原因だったという記録でもある。
   */
  it('FR-323-02: 白の不透明度は赤地では基準を割る（面ごとに modifier を分けた根拠）', () => {
    // 評価者の実測どおり: white/60 on #C93636 = #EAAFAF 相当 = 2.77:1
    expect(ratioOfHex('#eaafaf', '#c93636')).toBeCloseTo(2.77, 1)
    expect(ratioOfHex('#eaafaf', '#c93636')).toBeLessThan(TEXT_MIN)
    // 同じ white/60 でも反転セクション（slate-950）の上なら 9:1 以上ある＝面が問題だった
    expect(ratioOfHex('#9a9a9b', '#020617')).toBeGreaterThanOrEqual(TEXT_MIN)
    // 本文に使っていた white/85（= rgb(247,225,225)）も 18px で AA 未満だった
    expect(ratioOfHex('#f7e1e1', '#c93636')).toBeLessThan(TEXT_MIN)
    // 枠線 white/50（= rgb(228,155,155)）は UI 部品 3:1 も割っていた
    expect(ratioOfHex('#e49b9b', '#c93636')).toBeLessThan(UI_MIN)
    // マーキーの縁取り rgb(220 38 38 / .55) は白地で #EC8888 相当 = 2.49:1
    expect(ratioOfHex('#ec8888', '#ffffff')).toBeCloseTo(2.49, 1)
    expect(ratioOfHex('#ec8888', '#ffffff')).toBeLessThan(TEXT_MIN)
    // マーキーの英字ラベル gray-300 は白地 1.47:1
    expect(ratioOfHex('#d1d5db', '#ffffff')).toBeLessThan(TEXT_MIN)
  })

  /**
   * REQ-323 FR-323-05: 「トークンは直したのに画面は別の色」を検出する結び付け。
   * SURVEY_STATUS に対して REQ-322 が同じことをしている（下の FR-322-03 の it 参照）。
   * 種別色は CSS 変数（テーマで反転する面）と constants の hex（常に白い面）の
   * **2 通りの引き方**があるので、ライト値が同一であることを固定しないと静かにズレる。
   */
  it('FR-323-05: SPECIES[].color と globals.css の --species-* が一致している', () => {
    for (const s of SPECIES) {
      const cssLight = rgbToHex(resolve(s.colorVar, 'light'))
      expect(cssLight, `${s.value}: constants=${s.color} / css(${s.colorVar})=${cssLight}`)
        .toBe(s.color.toLowerCase())
    }
    // AC-08: 値そのものは REQ-224 の決定のまま（変えたのは「どこから引くか」だけ）
    expect(SPECIES.map((s) => s.color)).toEqual(['#0072B2', '#D55E00'])
    // 種別色は chart パレットの 1・2 と同じ 1 値（別名を増やしていない）
    expect(rootVars.get('--species-american')).toBe('var(--chart-1)')
    expect(rootVars.get('--species-bullfrog')).toBe('var(--chart-2)')
    // ダークは明色側へ振れる（＝テーマで反転する面ではこちらを引く必要がある）
    expect(rgbToHex(resolve('--species-american', 'dark'))).not.toBe('#0072b2')
  })

  /**
   * REQ-323 FR-323-06: 「量」の色を無彩色へ戻した判断の記録。
   * 第1周に使った薄い無彩色（#D6D9DF）へ戻さないためのゲートでもある。
   */
  it('FR-323-06: 量のバーは濃い無彩色（薄い灰にもブランド赤にも戻していない）', () => {
    // 第1周の #D6D9DF は白地 1.1:1＝「読み込み失敗に見える」と減点された値
    expect(ratioOfHex('#d6d9df', '#ffffff')).toBeLessThan(UI_MIN)
    // 採った値は白地 7.56:1（要件の記載と一致）
    expect(ratioOfHex('#4b5563', '#ffffff')).toBeCloseTo(7.56, 1)
    expect(rootVars.get('--chart-quantity')).toBe('#4b5563')
    // ブランド赤とは別値＝「量」と「行動」を色で読み分けられる
    expect(rootVars.get('--chart-quantity')).not.toBe(rootVars.get('--color-brand-600'))
    // 評価者案の #0072B2 は採らない（アメリカザリガニの種別色と衝突するため）
    expect(rootVars.get('--chart-quantity')).not.toBe(rootVars.get('--species-american'))
    expect(darkVars.get('--chart-quantity')).toBe('#94a3b8')
  })

  it('FR-321-04: trends のバーに使う赤＝ブランド赤 #dc2626 の 1 系統', () => {
    expect(rootVars.get('--color-brand-600')).toBe('#dc2626')
    expect(palette.get('--color-red-600')).toBe('#dc2626')
    // 捨てた 3 種のグラデ端／中間色は、いずれもブランド赤とは別の色だった。
    for (const abandoned of ['#ef4444', '#f87171', '#f43f5e', '#f7636b', '#f05e5c']) {
      expect(abandoned).not.toBe('#dc2626')
    }
    // FR-321-04 は**コントラスト違反ではなく色数の問題**である、という前提の記録。
    // 珊瑚 #F7636B は白カード上 3.02:1 で UI 部品 3:1 を（かろうじて）満たしていたので、
    // コントラストのテストだけでは永遠に検出できなかった。だからこの it が要る。
    expect(ratioOfHex('#f7636b', '#ffffff')).toBeGreaterThanOrEqual(UI_MIN)
    expect(ratioOfHex('#f7636b', '#ffffff')).toBeLessThan(3.1)
  })

  /**
   * REQ-324 / AC-05 と同趣旨。ただし**取りこぼした理由まで**固定するのがこの it の役目。
   *
   * 空状態の副文は faint(#6b7280) on 淡い面(#f8f6f6) = 4.49:1 で AA を割っていたのに、
   * このテストは 2 つの理由で気づけなかった。
   *   1. `--color-text-faint` × `--color-surface-2` の組が PAIRS に無かった（→ 行を追加した）
   *   2. hsl() を小数のまま計算していたので、同じ組でも 4.52:1 と出て**基準を通ってしまった**
   *      （→ hslToRgb を 8bit へ丸めた）
   * 2 が残ったままだと 1 だけ直しても緑のままになる。だから両方をここで固定する。
   */
  it('REQ-324: 空状態の副文（旧 faint on 淡い面）は基準を下回る＝ゲートとして機能する', () => {
    // 評価者の実測（画素）と CSS トークンの解決結果が同じ色であること。
    // ここがズレたら「画面で見た色」と「テストが見ている色」が別物になる。
    expect(rgbToHex(resolve('--color-text-faint', 'light'))).toBe('#6b7280')
    expect(rgbToHex(resolve('--color-surface-2', 'light'))).toBe('#f8f6f6')

    // 修正前の組。4.5:1 にわずかに届かない（=「ほぼ合っている」ので目視では通り抜ける）。
    expect(ratioOfHex('#6b7280', '#f8f6f6')).toBeCloseTo(4.49, 2)
    expect(ratioOfHex('#6b7280', '#f8f6f6')).toBeLessThan(TEXT_MIN)

    // 8bit へ丸めていることの証明。丸めを外すと左辺が 4.52 になりこの行が落ちる。
    expect(
      contrastRatio(resolve('--color-text-faint', 'light'), resolve('--color-surface-2', 'light')),
    ).toBeCloseTo(ratioOfHex('#6b7280', '#f8f6f6'), 5)

    // 採った値（muted）は同じ面で AA を満たす。
    // 評価者は #4b5563（gray-600 の literal・7.02:1）を提案したが、テキスト階調の正本は
    // --color-text-muted（hsl(220 9% 40%) = #5d636f）なので、新しい hex を増やさずそちらへ寄せた。
    // faint 自体を #4b5563 まで暗くする案は採れない：muted(#5d636f) より暗くなり、
    // 「muted > faint」の強弱が逆転する。
    expect(rgbToHex(resolve('--color-text-muted', 'light'))).toBe('#5d636f')
    expect(
      contrastRatio(resolve('--color-text-muted', 'light'), resolve('--color-surface-2', 'light')),
    ).toBeGreaterThanOrEqual(TEXT_MIN)
    expect(ratioOfHex('#5d636f', '#f8f6f6')).toBeLessThan(ratioOfHex('#4b5563', '#f8f6f6'))
  })

  // ─────────────────────────────────────────────────────────────────────────
  // REQ-325 FR-325-04: ルールそのものをテストにする
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * 許可リストの総当たり。「色の付いた面 × muted 以上のテキスト」は**全部**通ること。
   * 面を 1 つ足す／トークンを 1 段薄くすると、この 1 本が該当の組だけ落ちる。
   */
  it.each(TINT_MATRIX)(
    '[$theme] FR-325-04 $fgName は $bgName の上で AA を満たす',
    ({ fg, bg, fgName, bgName, theme }) => {
      const ratio = contrastRatio(resolve(fg, theme), resolve(bg, theme))
      expect(
        ratio,
        `${fgName} on ${bgName}（${theme}）= ${ratio.toFixed(2)}:1（要 ${TEXT_MIN}:1）`,
      ).toBeGreaterThanOrEqual(TEXT_MIN)
    },
  )

  /**
   * 許可リストの裏返し。**なぜ faint を許可リストに入れないのか**を数値で残す。
   * ここが緑のままだと「faint でも通るのでは」と誰かが戻せてしまう。
   */
  it('FR-325-04: faint（白地専用）は色の付いた面では AA を割る＝許可リストに入れない根拠', () => {
    const faintLight = resolve('--color-text-faint', 'light')
    // 白とページ背景では通る（だから「壊れている」ようには見えず、レビューをすり抜ける）
    expect(contrastRatio(faintLight, resolve('white', 'light'))).toBeGreaterThanOrEqual(TEXT_MIN)
    expect(contrastRatio(faintLight, resolve('--color-bg', 'light'))).toBeGreaterThanOrEqual(TEXT_MIN)
    // ところが色の付いた面に載せた瞬間に割る（本周の 3 件はすべてこの列）
    for (const surface of ['--color-surface-2', '--color-divider', 'gray-100', 'red-50', 'blue-50']) {
      const ratio = contrastRatio(faintLight, resolve(surface, 'light'))
      expect(ratio, `faint on ${surface} = ${ratio.toFixed(2)}:1`).toBeLessThan(TEXT_MIN)
      // ただし「見た目には正しく見える」程度には近い（4.3〜4.5）。だから目視では見つからない。
      expect(ratio).toBeGreaterThan(4.3)
    }
    // muted へ 1 段濃くするだけで全部通る＝ルールの実効性
    for (const surface of ['--color-surface-2', '--color-divider', 'gray-100', 'red-50', 'blue-50']) {
      expect(
        contrastRatio(resolve('--color-text-muted', 'light'), resolve(surface, 'light')),
      ).toBeGreaterThanOrEqual(TEXT_MIN)
    }
  })

  /**
   * FR-325-01/02 / AC-05 と同趣旨: 本周で直した 3 件は「直す前なら必ず落ちる」ことを固定する。
   * 実測値は `.agent-harness/runs/2026-08-16-uiux-loop/round5c-score.md` の採点と一致させる。
   */
  it('FR-325-01/02: 修正前の 3 件は基準を下回る（＝ゲートとして機能する）', () => {
    // ① ranking 非アクティブタブ / ③ InstallBanner hover: gray-500 on gray-100
    expect(ratioOfHex('#6b7280', '#f3f4f6')).toBeCloseTo(4.39, 2)
    expect(ratioOfHex('#6b7280', '#f3f4f6')).toBeLessThan(TEXT_MIN)
    // 採った値
    expect(ratioOfHex('#4b5563', '#f3f4f6')).toBeCloseTo(6.87, 2)

    // ② LP hero eyebrow: brand-600 on 淡赤オーブ。評価者の実測 4.03:1 と一致する。
    expect(ratioOfHex('#dc2626', '#fde5e5')).toBeCloseTo(4.03, 2)
    expect(ratioOfHex('#dc2626', '#fde5e5')).toBeLessThan(TEXT_MIN)
    // オーブは `bg-primary-500/15`（#ef4444 15% on 白）＝ #fde3e3。実測より僅かに濃い。
    expect(ratioOfHex('#dc2626', '#fde3e3')).toBeLessThan(TEXT_MIN)
    // 採った値（brand-800）はどちらの下地でも通る
    expect(rootVars.get('--color-brand-800')).toBe('#991b1b')
    expect(ratioOfHex('#991b1b', '#fde3e3')).toBeGreaterThanOrEqual(TEXT_MIN)

    // 掃き出しで見つかった同型の不合格（赤側）。
    expect(ratioOfHex('#dc2626', '#fef2f2')).toBeLessThan(TEXT_MIN) // red-600 on red-50 = 4.41
    expect(ratioOfHex('#dc2626', '#fee2e2')).toBeLessThan(TEXT_MIN) // red-600 on red-100 = 3.95
    expect(ratioOfHex('#ef4444', '#fef2f2')).toBeLessThan(TEXT_MIN) // red-500 on red-50 = 3.44
    // 採った値（brand-700）は red-50 / red-100 の両方で通る
    expect(ratioOfHex('#b91c1c', '#fef2f2')).toBeGreaterThanOrEqual(TEXT_MIN)
    expect(ratioOfHex('#b91c1c', '#fee2e2')).toBeGreaterThanOrEqual(TEXT_MIN)

    // 掃き出しで見つかった同型の不合格（灰側・gray-400 は面に載ると 3:1 すら割る）。
    expect(ratioOfHex('#9ca3af', '#f3f4f6')).toBeCloseTo(2.31, 2)
    expect(ratioOfHex('#9ca3af', '#f3f4f6')).toBeLessThan(UI_MIN)
  })

  /**
   * FR-325-04: 「4.5 以上なら触らない」という判断も記録に残す。
   * 掃き出しでヒットしたが**基準を満たしていたので変えなかった**組。
   * ここを消すと、次に誰かが「ついでに」濃くして色数を増やす方向へ戻る。
   */
  it('FR-325-04: 基準を満たしていたので触らなかった組（変更範囲の境界の記録）', () => {
    expect(ratioOfHex('#6b7280', '#f9fafb')).toBeGreaterThanOrEqual(TEXT_MIN) // faint on ページ背景 4.63
    expect(ratioOfHex('#6b7280', '#f0f9ff')).toBeGreaterThanOrEqual(TEXT_MIN) // faint on sky-50 4.54
    expect(ratioOfHex('#b45309', '#fef3c7')).toBeGreaterThanOrEqual(TEXT_MIN) // amber-700 on amber-100 4.51
    expect(ratioOfHex('#15803d', '#dcfce7')).toBeGreaterThanOrEqual(TEXT_MIN) // green-700 on green-100 4.57
    expect(ratioOfHex('#1d4ed8', '#dbeafe')).toBeGreaterThanOrEqual(TEXT_MIN) // blue-700 on blue-100 5.49
    expect(ratioOfHex('#b91c1c', '#fef2f2')).toBeGreaterThanOrEqual(TEXT_MIN) // brand-700 on red-50 5.91
    // 無効化された操作（disabled）は WCAG 1.4.3 の対象外。AudioRecorder の
    // `bg-gray-300 text-gray-500`（3.28:1）を濃くすると「押せる」ように見えてしまうため残す。
    expect(ratioOfHex('#6b7280', '#d1d5db')).toBeLessThan(TEXT_MIN)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // REQ-326 FR-326-01: 状態を赤×緑で表さない
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * ■ ルール（このプロジェクトの決まり・REQ-224 から継続）
   * **増減・成否・合否・一致/不一致といった「状態」を、赤と緑の対で表さない。**
   * 方向や結果は記号（▲▼・✅❌）とテキストで伝え、色はそれを補うだけにする。
   *
   * 赤×緑は P/D 型（1 型・2 型）色覚で最も識別困難な組で、REQ-224 が主役 2 種の色を
   * 赤×緑 → 青 #0072B2 × オレンジ #D55E00（Wong パレット）へ移した理由そのものである。
   * にもかかわらず REQ-321 FR-321-03（emerald 全廃）は「ランキングの強調色」だけを見ており、
   * StatsBar の前月比インジケーターに `増 = emerald-500 / 減 = red-400` が残っていた。
   * **同じ規約違反が別の語彙（強調ではなく増減）で生き残る**のがこの種の取りこぼしの形なので、
   * 色を差し替えて終わりにせず、ルールとしてここに書いておく。
   *
   * ■ なぜ「濃い緑に替える」で済ませないのか
   * コントラストは色の**明るさ**しか見ない。緑を green-700 まで濃くすれば AA は通るが、
   * 赤との対で意味を担っている限り、P/D 型には依然として同じ色に見える。
   * つまりこの規約は**このテストの数値では検出できない**。だから
   * 「色を意味の担い手から外す（両方とも二次テキスト色にする）」を採り、
   * 数値側では「新しく採った色が AA を満たすこと」だけを PAIRS で見張る。
   *
   * ■ 適用範囲
   * 一般利用者に見える画面が対象。管理画面（admin 配下・ReviewCardAI・AIBadge 等）にも
   * 同型の緑/赤があるが、REQ-319 と同じ扱いで別要件に送る（この it では判定しない）。
   */
  it('FR-326-01: StatsBar 前月比の旧配色（増=緑 / 減=赤）は帯の上で AA を割る', () => {
    // 帯の下地。白ではないことがこの不合格の主因なので、まず下地の値を固定する。
    const bandLight = '#fef2f2' // bg-red-50
    const bandDark = '#0f172a'  // bg-slate-900

    // 旧配色。白地の実測（emerald-500 = 2.54:1 / red-400 = 3.29:1）より更に低い。
    expect(ratioOfHex('#10b981', bandLight)).toBeCloseTo(2.32, 2)
    expect(ratioOfHex('#f87171', bandLight)).toBeCloseTo(2.53, 2)
    expect(ratioOfHex('#10b981', bandLight)).toBeLessThan(TEXT_MIN)
    expect(ratioOfHex('#f87171', bandLight)).toBeLessThan(TEXT_MIN)

    // ダークでは旧配色でも AA は通っていた（7.04 / 6.45）。
    // ＝**コントラストだけを見ていたらダークは合格**で、赤×緑という本体の問題は残る。
    // 上のコメント「数値では検出できない」の実例なので、値として残す。
    expect(ratioOfHex('#10b981', bandDark)).toBeGreaterThanOrEqual(TEXT_MIN)
    expect(ratioOfHex('#f87171', bandDark)).toBeGreaterThanOrEqual(TEXT_MIN)

    // 採った値。隣の「今月」「件」と同じ二次テキスト色＝新しい色を 1 つも増やしていない。
    expect(ratioOfHex('#4b5563', bandLight)).toBeCloseTo(6.91, 2)
    expect(ratioOfHex('#94a3b8', bandDark)).toBeCloseTo(6.96, 2)

    // 「緑を濃くする」案が解にならないことの記録: green-700 は帯の上で AA を満たす。
    // つまり数値だけを直すと合格してしまい、赤×緑の対はそのまま残る。
    expect(ratioOfHex('#15803d', bandLight)).toBeGreaterThanOrEqual(TEXT_MIN)
  })

  /**
   * REQ-326: **触らなかった緑**の記録（FR-325-04 の「境界の記録」と同じ趣旨）。
   * DetailPage の教育的フィードバックの見出し（`text-emerald-700` / `text-emerald-300`）は
   * 一致でも不一致でも**同じ緑 1 色**で、見出しの文言そのものが状態を伝えている。
   * ＝赤との対で意味を担っておらず、AA も満たすので REQ-326 の対象外とした。
   */
  it('FR-326-01: DetailPage の教育的フィードバック見出しの緑は AA を満たす（対象外の根拠）', () => {
    // 下地はカード面（cardCls = bg-surface）。ライト #ffffff / ダーク hsl(222 33% 14%)。
    expect(rgbToHex(resolve('--color-surface', 'light'))).toBe('#ffffff')
    expect(contrastRatio(resolve('#047857', 'light'), resolve('--color-surface', 'light')))
      .toBeGreaterThanOrEqual(TEXT_MIN) // emerald-700 on 白 = 5.48:1
    expect(contrastRatio(resolve('#6ee7b7', 'dark'), resolve('--color-surface', 'dark')))
      .toBeGreaterThanOrEqual(TEXT_MIN) // emerald-300 on 暗カード = 10.80:1
  })
})
