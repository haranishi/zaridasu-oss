import { describe, it, expect } from 'vitest'
import {
  safeJsonLd,
  generatePostSEO,
  generateSpeciesSEO,
  buildPageMetadata,
  ABOUT_BREADCRUMB,
  SITE_NAME,
  DEFAULT_OG_IMAGE,
} from '../seo'
import jaTranslation from '@/locales/ja/translation.json'

describe('safeJsonLd', () => {
  it('すべての `<` を \\u003c にエスケープする', () => {
    const out = safeJsonLd({ a: '<b>' })
    expect(out).not.toContain('<')
    expect(out).toContain('\\u003c')
  })

  it('`</script>` の `<` がエスケープされブレイクアウトを防ぐ', () => {
    const payload = { name: 'evil</script><script>alert(1)</script>' }
    const out = safeJsonLd(payload)
    expect(out).not.toMatch(/<\/script>/i)
    expect(out).toContain('\\u003c/script>')
    expect(out).toContain('\\u003cscript>')
  })

  it('ネストした配列やオブジェクト内の `<` もエスケープする', () => {
    const out = safeJsonLd({ list: [{ url: 'http://x?y=<z>' }, '<tag>'] })
    expect(out).not.toContain('<')
    const occurrences = out.match(/\\u003c/g) ?? []
    expect(occurrences.length).toBe(2)
  })

  it('日本語・絵文字などの非 ASCII は過剰エスケープしない', () => {
    const out = safeJsonLd({ name: 'ザリガニ🦞', desc: '秋田県' })
    expect(out).toContain('ザリガニ')
    expect(out).toContain('🦞')
    expect(out).toContain('秋田県')
  })

  it('エスケープ後も JSON.parse でラウンドトリップ可能', () => {
    const input = { name: 'x</script>y', nested: { gt: '>' } }
    const out = safeJsonLd(input)
    expect(JSON.parse(out)).toEqual(input)
  })

  it('空オブジェクトは "{}" になる', () => {
    expect(safeJsonLd({})).toBe('{}')
  })
})

// REQ-310 FR-310-04 / AC-04 / AC-05: 位置非公開（location_disclosure='hidden'）の投稿は
// display_lat/display_lng が NULL で届く。`Number(null) === 0` を素通しすると geo 0,0（ギニア湾沖）
// という明確な誤座標が構造化データとして配布される。座標が無いときは geo キー自体を出さない。
describe('generatePostSEO の geo ガード (REQ-310 FR-310-04)', () => {
  const basePost = {
    id: 'post-1',
    species: 'american',
    info_type: 'sighting',
    municipality: '秋田市',
    comment: null,
    created_at: '2026-06-01T00:00:00.000Z',
    photos: null,
  }

  /** contentLocation を型を緩めて取り出すテスト用ヘルパ。 */
  const contentLocation = (jsonLd: unknown) =>
    (jsonLd as { contentLocation: Record<string, unknown> }).contentLocation

  it('座標があるときは geo を出力する（従来動作の維持）', () => {
    const { jsonLd } = generatePostSEO({ ...basePost, lat: 39.72, lng: 140.1 })
    expect(contentLocation(jsonLd).geo).toEqual({
      '@type': 'GeoCoordinates',
      latitude: 39.72,
      longitude: 140.1,
    })
  })

  it('lat/lng が null（位置非公開）のとき geo キー自体を出力しない', () => {
    const { jsonLd } = generatePostSEO({ ...basePost, lat: null, lng: null })
    expect(contentLocation(jsonLd)).not.toHaveProperty('geo')
  })

  it('位置非公開の投稿のシリアライズ結果に "latitude":0 / "longitude":0 が現れない（AC-04）', () => {
    const { jsonLd } = generatePostSEO({ ...basePost, lat: null, lng: null })
    const serialized = safeJsonLd(jsonLd)
    expect(serialized).not.toContain('"latitude":0')
    expect(serialized).not.toContain('"longitude":0')
    expect(serialized).not.toContain('GeoCoordinates')
  })

  it('位置非公開でも contentLocation.address の市区町村は残る（AC-05）', () => {
    const { jsonLd } = generatePostSEO({ ...basePost, lat: null, lng: null })
    const location = contentLocation(jsonLd)
    expect(location.name).toBe('秋田県秋田市')
    expect(location.address).toEqual({
      '@type': 'PostalAddress',
      addressRegion: '秋田県',
      addressLocality: '秋田市',
      addressCountry: 'JP',
    })
  })

  it('片方だけ null でも geo を出さない（半端な座標を配布しない）', () => {
    expect(contentLocation(generatePostSEO({ ...basePost, lat: 39.72, lng: null }).jsonLd)).not.toHaveProperty('geo')
    expect(contentLocation(generatePostSEO({ ...basePost, lat: null, lng: 140.1 }).jsonLd)).not.toHaveProperty('geo')
  })

  it('NaN / Infinity のような非有限値でも geo を出さない（Number.isFinite ガード）', () => {
    expect(contentLocation(generatePostSEO({ ...basePost, lat: NaN, lng: 140.1 }).jsonLd)).not.toHaveProperty('geo')
    expect(contentLocation(generatePostSEO({ ...basePost, lat: 39.72, lng: Infinity }).jsonLd)).not.toHaveProperty('geo')
  })

  it('緯度経度 0 が「実在の観測値」として渡された場合は出力する（NULL とは区別する）', () => {
    // 0,0 を一律に落とすのではなく **NULL のときだけ落とす**（有効な観測値を消さない）。
    expect(contentLocation(generatePostSEO({ ...basePost, lat: 0, lng: 0 }).jsonLd).geo).toEqual({
      '@type': 'GeoCoordinates',
      latitude: 0,
      longitude: 0,
    })
  })
})

// REQ-312 FR-312-01 / AC-05: canonical と og:url を**同じ値から**生成するヘルパ。
// 両者を別々に手書きできる状態を残さないことが退行防止の本体なので、
// 「同じ path から出ている」ことと「shallow merge で消えるフィールドを必ず埋める」ことを固定する。
describe('buildPageMetadata (REQ-312 FR-312-01)', () => {
  const base = { path: '/trends', title: 'トレンド・統計', description: '月別推移・種類別分布の統計データ。' }

  it('alternates.canonical と openGraph.url が同一の path から生成される', () => {
    const meta = buildPageMetadata(base)
    expect(meta.alternates?.canonical).toBe('/trends')
    expect(meta.openGraph?.url).toBe('/trends')
    expect(String(meta.openGraph?.url)).toBe(String(meta.alternates?.canonical))
  })

  it('shallow merge で親から引き継がれない type / siteName / locale / images を必ず含む', () => {
    const og = buildPageMetadata(base).openGraph as Record<string, unknown>
    expect(og.type).toBe('website')
    expect(og.siteName).toBe(SITE_NAME)
    expect(og.locale).toBe('ja_JP')
    expect(og.images).toEqual([
      { url: DEFAULT_OG_IMAGE, alt: 'ザリダス - 秋田県外来生物情報マップ', width: 1200, height: 630 },
    ])
  })

  it('og:title は root の title.template（%s | ザリダス）と同じ形に揃う', () => {
    const meta = buildPageMetadata(base)
    expect(meta.title).toBe('トレンド・統計')
    expect((meta.openGraph as { title?: string }).title).toBe(`トレンド・統計 | ${SITE_NAME}`)
  })

  it('titleAbsolute のときは template を通さず、og:title もブランドを二重付与しない', () => {
    const meta = buildPageMetadata({
      path: '/requests',
      title: '調査依頼一覧 | ザリダス',
      titleAbsolute: true,
      description: '調査依頼の一覧。',
    })
    expect(meta.title).toEqual({ absolute: '調査依頼一覧 | ザリダス' })
    expect((meta.openGraph as { title?: string }).title).toBe('調査依頼一覧 | ザリダス')
    expect((meta.twitter as { title?: string }).title).toBe('調査依頼一覧 | ザリダス')
  })

  it('twitter は og と同一の title / description / image から生成される（親のホーム文言を継承させない）', () => {
    const meta = buildPageMetadata(base)
    const og = meta.openGraph as { title?: string; description?: string }
    const twitter = meta.twitter as { card?: string; title?: string; description?: string; images?: string[] }
    expect(twitter.card).toBe('summary_large_image')
    expect(twitter.title).toBe(og.title)
    expect(twitter.description).toBe(og.description)
    expect(twitter.images).toEqual([DEFAULT_OG_IMAGE])
  })

  it('ページ固有の OG 画像を差し替えられる（og と twitter の両方に反映される）', () => {
    const meta = buildPageMetadata({ ...base, ogImage: { url: '/og-image-lp.png', alt: 'LP' } })
    expect((meta.openGraph as { images?: { url: string; alt: string }[] }).images?.[0]).toEqual({
      url: '/og-image-lp.png',
      alt: 'LP',
      width: 1200,
      height: 630,
    })
    expect((meta.twitter as { images?: string[] }).images).toEqual(['/og-image-lp.png'])
  })

  it('相対でない path / 末尾スラッシュを拒否する（canonical の揺れを作らせない）', () => {
    expect(() => buildPageMetadata({ ...base, path: 'trends' })).toThrow(/先頭/)
    expect(() => buildPageMetadata({ ...base, path: 'https://example.com/trends' })).toThrow(/先頭/)
    expect(() => buildPageMetadata({ ...base, path: '/trends/' })).toThrow(/末尾/)
    // ルート '/' だけは末尾スラッシュ扱いしない。
    expect(() => buildPageMetadata({ ...base, path: '/' })).not.toThrow()
  })
})

// REQ-312 FR-312-05 / AC-06: パンくずの表示名が遷移先ページの h1 と一致していること。
// JSON-LD（seo.ts）と可視パンくず（app/species/[species]/page.tsx）が別々に手書きされ、
// 遷移先 /about の h1（about.title）と食い違っていたのを同一定数に集約した。
describe('ABOUT_BREADCRUMB とパンくずの整合 (REQ-312 FR-312-05)', () => {
  it('パンくず名が /about の h1（ja の about.title）と一致する', () => {
    const aboutTitle = (jaTranslation as { about?: { title?: string } }).about?.title
    expect(aboutTitle).toBeTruthy()
    expect(ABOUT_BREADCRUMB.name).toBe(aboutTitle)
  })

  it('BreadcrumbList JSON-LD の position 2 が同一定数から生成される', () => {
    const { breadcrumbLd } = generateSpeciesSEO({ value: 'american', label: 'アメリカザリガニ' })
    const second = breadcrumbLd.itemListElement[1] as { name: string; item: string }
    expect(second.name).toBe(ABOUT_BREADCRUMB.name)
    expect(second.item).toContain(ABOUT_BREADCRUMB.path)
    // 遷移先の h1 と別名だった旧表記が残っていないこと。
    expect(second.name).not.toBe('種類図鑑')
  })
})

// REQ-322 FR-322-01 / AC-04: 同じ画面が複数の名前で呼ばれていないこと。
// Round 3 の採点 #1（🔴）は「/trends がヘッダー『トレンド』・パンくず『トレンド』・
// ボトムナビ『統計』」「/ranking がヘッダー『ランキング』・パンくず『みんなの記録』」と、
// 1 画面に 2〜3 個の名前がある状態だった。目視では 4 言語ぶん確認しきれないのでテストで固定する。
describe('REQ-322 FR-322-01: 画面名が 1 語に統一されている（4 言語）', () => {
  const LANGS = ['ja', 'en', 'ko', 'zh'] as const
  // 同じ語を出さなければならないキーの束。左が「その画面の名前」を持つキー。
  const GROUPS: { screen: string; keys: string[] }[] = [
    { screen: '/trends', keys: ['nav.trends', 'bottomNav.trends', 'header.pageTitle.trends', 'trends.title'] },
    { screen: '/ranking', keys: ['nav.ranking', 'bottomNav.ranking', 'header.pageTitle.ranking', 'ranking.breadcrumb'] },
  ]

  const dig = (obj: unknown, path: string): unknown =>
    path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)

  it.each(LANGS)('%s: ナビ・ヘッダー・パンくず・ページ名が同じ語', async (lang) => {
    const dict = (await import(`../../locales/${lang}/translation.json`)).default
    for (const { screen, keys } of GROUPS) {
      const values = keys.map((k) => dig(dict, k))
      for (const [i, v] of values.entries()) {
        expect(v, `${lang} ${keys[i]} が未定義`).toBeTruthy()
      }
      expect(
        new Set(values).size,
        `${lang} ${screen}: ${keys.map((k, i) => `${k}="${values[i]}"`).join(' / ')}`,
      ).toBe(1)
    }
  })
})
