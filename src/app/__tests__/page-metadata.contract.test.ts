/**
 * REQ-312 FR-312-08（退行検知）: ページ metadata の「共有カード契約」を機械的に固定する。
 *
 * Next.js App Router の metadata は `openGraph` / `twitter` を**トップレベルのキー単位で
 * 浅くマージ**するため、次の3型の欠陥が個別ページに静かに再発する。
 *
 * - 問題A: `openGraph` を書かない → 親（root layout）の `url: '/'` とホームのタイトルを丸ごと継承
 * - 問題B: `openGraph: { url }` のように一部だけ書く → 親の images / siteName / type / locale が消える
 * - 問題C: `twitter` を書かない → 親のホーム文言を継承（og:* からのフォールバックは効かない）
 *
 * 本ファイルは2段構えで守る。
 *
 * 1. **解決結果の検査**: indexable な静的ページの `metadata` を実際に import し、
 *    canonical と og:url の一致・og/twitter の必須フィールドを検証する。
 * 2. **ソース走査**: `src/app` 配下の `page.tsx` を舐め、新しいページが `buildPageMetadata` を
 *    経由せずに canonical / openGraph を手書きしていないかを検出する。
 *    ページを1本足したときに「og:url を書き忘れた」が黙って通らないようにするのがねらい。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Metadata } from 'next'
import { SITE_NAME, DEFAULT_OG_IMAGE } from '@/lib/seo'

const APP_DIR = resolve(import.meta.dirname, '..')
const PROJECT_ROOT = resolve(APP_DIR, '../..')

/** root layout（`src/app/layout.tsx`）が持つホームの文言。ページ側に残っていたら継承事故。 */
const HOME_TITLE = 'ザリダス - 秋田県外来生物情報マップ'
const HOME_DESCRIPTION =
  '秋田県外来生物出没・分布情報マップ。アメリカザリガニやウシガエルの目撃・捕獲情報をリアルタイムで共有できます。'

/**
 * indexable な静的ページ（`export const metadata` を持ち robots で除外していないもの）。
 * `path` は自己参照 canonical であり og:url でもある（同一であることが AC-01 / AC-05）。
 */
const INDEXABLE_STATIC_PAGES: { path: string; importPath: string; expectedTitle: string }[] = [
  { path: '/trends', importPath: '@/app/trends/page', expectedTitle: `トレンド・統計 | ${SITE_NAME}` },
  // REQ-322 FR-322-01: 画面内の表記（ボトムナビ/ヘッダー/パンくず/h1/フッター）を
  // 「ランキング」に統一したので、`<title>` も同じ語で始める（4 つ目の名前を作らない）。
  { path: '/ranking', importPath: '@/app/ranking/page', expectedTitle: `ランキング（みんなの記録） | ${SITE_NAME}` },
  { path: '/area', importPath: '@/app/area/page', expectedTitle: `地域別外来生物情報 | ${SITE_NAME}` },
  { path: '/about', importPath: '@/app/about/page', expectedTitle: `使い方・種類図鑑・外来種法 | ${SITE_NAME}` },
  { path: '/terms', importPath: '@/app/terms/page', expectedTitle: `利用規約 | ${SITE_NAME}` },
  { path: '/privacy', importPath: '@/app/privacy/page', expectedTitle: `プライバシーポリシー | ${SITE_NAME}` },
  {
    path: '/dataset',
    importPath: '@/app/dataset/page',
    expectedTitle: `オープンデータ（外来生物 観察データの公開・DOI 引用） | ${SITE_NAME}`,
  },
  // REQ-199 FR-199-02: ブランド二重付与を避ける絶対タイトル。og:title も同じ値で揃う。
  { path: '/requests', importPath: '@/app/requests/page', expectedTitle: '調査依頼一覧 | ザリダス' },
]

async function loadMetadata(importPath: string): Promise<Metadata> {
  const mod = (await import(/* @vite-ignore */ importPath)) as { metadata?: Metadata }
  expect(mod.metadata, `${importPath} が metadata を export していない`).toBeTruthy()
  return mod.metadata as Metadata
}

describe('REQ-312: indexable な静的ページの canonical / og / twitter（解決結果）', () => {
  it.each(INDEXABLE_STATIC_PAGES)(
    '$path — og:url が自己参照 canonical と一致する（AC-01 / AC-05）',
    async ({ path, importPath }) => {
      const metadata = await loadMetadata(importPath)
      const canonical = metadata.alternates?.canonical
      const ogUrl = metadata.openGraph?.url

      expect(canonical, 'alternates.canonical が無い').toBe(path)
      // 親の '/' を継承していないこと＝ページ固有の og:url が出ていること。
      expect(ogUrl, 'openGraph.url が無い（親の "/" を継承してしまう）').toBe(path)
      expect(String(ogUrl)).toBe(String(canonical))
    },
  )

  it.each(INDEXABLE_STATIC_PAGES)(
    '$path — og:image / og:site_name / og:type / og:locale が欠けていない（AC-02 / 問題B）',
    async ({ importPath }) => {
      const og = (await loadMetadata(importPath)).openGraph as Record<string, unknown> | undefined
      expect(og, 'openGraph が無い').toBeTruthy()
      expect(og?.type).toBe('website')
      expect(og?.siteName).toBe(SITE_NAME)
      expect(og?.locale).toBe('ja_JP')

      const images = og?.images as { url?: string }[] | undefined
      expect(Array.isArray(images) && images.length > 0, 'og:image が無い').toBe(true)
      expect(images?.[0]?.url).toBe(DEFAULT_OG_IMAGE)
    },
  )

  it.each(INDEXABLE_STATIC_PAGES)(
    '$path — og:title / twitter:title がページ固有で一致する（AC-03 / AC-04）',
    async ({ importPath, expectedTitle }) => {
      const metadata = await loadMetadata(importPath)
      const og = metadata.openGraph as { title?: string; description?: string } | undefined
      const twitter = metadata.twitter as
        | { card?: string; title?: string; description?: string; images?: unknown[] }
        | undefined

      expect(og?.title).toBe(expectedTitle)
      // 同一ページ内で og:title と twitter:title が食い違わない（/requests の実例）。
      expect(twitter?.title).toBe(expectedTitle)
      expect(twitter?.card).toBe('summary_large_image')
      expect(twitter?.description).toBe(og?.description)
      expect(Array.isArray(twitter?.images) && (twitter?.images?.length ?? 0) > 0, 'twitter:image が無い').toBe(true)

      // ホームの文言が残っていない（＝親からの継承ではない）。
      expect(og?.title).not.toBe(HOME_TITLE)
      expect(og?.description).not.toBe(HOME_DESCRIPTION)
      expect(twitter?.title).not.toBe(HOME_TITLE)
      expect(twitter?.description).not.toBe(HOME_DESCRIPTION)
    },
  )
})

/** `src/app` 配下の `page.tsx` を再帰列挙する（プロジェクトルート相対の POSIX パスで返す）。 */
function listPageFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) out.push(...listPageFiles(full))
    else if (entry.name === 'page.tsx') out.push(relative(PROJECT_ROOT, full).split(sep).join('/'))
  }
  return out.sort()
}

const PAGE_FILES = listPageFiles(APP_DIR)

/**
 * `buildPageMetadata` を経由せず canonical を手書きしてよいページ。
 * 追加するときは**必ず理由を書く**（理由が書けないなら helper を使うべきページである）。
 */
const CANONICAL_EXEMPTIONS: Record<string, string> = {
  // ホームの canonical '/' は root layout の openGraph.url '/' と元から一致するため、
  // 親継承のままで og:url が正しい唯一のページ。
  'src/app/(home)/page.tsx': 'canonical が "/" で root layout の og:url と一致する',
  // 専用 OG 画像（/og-image-lp.png）と絶対タイトルを持つ広告 LP。REQ-181/REQ-206 で
  // shallow merge 対策済み（type/siteName/locale/images/twitter を全て自前で再指定）。
  'src/app/lp/page.tsx': 'LP 専用 OGP 画像を持ち、shallow merge 対策済み（REQ-181 / REQ-206）',
}

/** `generateMetadata` で動的に組み立てるページ（静的な helper では表現できない）。 */
const DYNAMIC_METADATA_PAGES = new Set([
  'src/app/area/[municipality]/page.tsx',
  'src/app/area/[municipality]/[species]/page.tsx',
  'src/app/post/[id]/page.tsx',
  'src/app/profile/[userId]/page.tsx',
  'src/app/request/[id]/page.tsx',
  'src/app/species/[species]/page.tsx',
])

type PageSource = { file: string; source: string }

const PAGE_SOURCES: PageSource[] = PAGE_FILES.map((file) => ({
  file,
  source: readFileSync(resolve(PROJECT_ROOT, file), 'utf8'),
}))

/** `robots: { index: false }` を宣言しているページは共有カード契約の対象外。 */
const isNoindex = (source: string) => /index:\s*false/.test(source)

describe('REQ-312 FR-312-08: ページを増やしたときの退行検知（ソース走査）', () => {
  it('走査対象の page.tsx を実際に発見できている（走査自体の空振り検知）', () => {
    expect(PAGE_FILES.length).toBeGreaterThan(15)
    expect(PAGE_FILES).toContain('src/app/trends/page.tsx')
  })

  it('indexable な静的ページの canonical / openGraph は buildPageMetadata 経由で書く', () => {
    const offenders = PAGE_SOURCES.filter(({ file, source }) => {
      if (file in CANONICAL_EXEMPTIONS) return false
      if (DYNAMIC_METADATA_PAGES.has(file)) return false
      if (isNoindex(source)) return false
      if (!/alternates\s*:/.test(source)) return false
      return !source.includes('buildPageMetadata(')
    }).map(({ file }) => file)

    expect(
      offenders,
      `canonical と og:url を別々に書ける状態のページがある。@/lib/seo の buildPageMetadata を使うこと:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('openGraph を手書きするページは url / images / twitter を必ず併記する（問題A・B・C の型）', () => {
    const offenders: string[] = []
    for (const { file, source } of PAGE_SOURCES) {
      if (source.includes('buildPageMetadata(')) continue
      if (!/openGraph\s*:/.test(source)) continue
      if (isNoindex(source)) continue

      const missing: string[] = []
      if (!/\burl\s*:/.test(source)) missing.push('openGraph.url')
      if (!/\bimages\s*:/.test(source)) missing.push('openGraph.images')
      if (!/twitter\s*:/.test(source)) missing.push('twitter')
      if (missing.length > 0) offenders.push(`${file} → ${missing.join(' / ')} が無い`)
    }

    expect(
      offenders,
      `openGraph の部分定義は親の値を消す（shallow merge）。欠落を補うか buildPageMetadata を使うこと:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('免除リストは実在するページだけを指す（リネーム後の死んだ免除を残さない）', () => {
    for (const file of [...Object.keys(CANONICAL_EXEMPTIONS), ...DYNAMIC_METADATA_PAGES]) {
      expect(PAGE_FILES, `${file} は存在しない。免除リストを更新すること`).toContain(file)
    }
  })
})
