import { MetadataRoute } from 'next'
import { createAnonClient } from '@/lib/supabase/anon'
import {
  selectPublicPostsForAreaSpecies,
  selectPublicPostsForSitemap,
} from '@/lib/data/posts'
import { MUNICIPALITY_DATA, SPECIES, BASE_URL, getMunicipalitySlug, AREA_SPECIES_INDEX_MIN_POSTS } from '@/lib/constants'

// REQ-162: 毎時の全件再構築は過剰。サイトマップの鮮度は日次で十分なため 24 時間へ延長する。
export const revalidate = 86400

// REQ-162: 旧実装は post=1000 / request=500 / profile=500 の固定 limit で、データ増加時に
// 新規 URL を黙って取りこぼすリスクがあった。sitemap 仕様の上限は 50,000 URL/ファイルなので、
// 単一サイトマップで収まる範囲まで上限を引き上げ、3 カテゴリ合計が 50,000 を超えない値にする。
// 上限到達時は console.warn で可視化し「サイレントな打ち切り」を避ける（将来は generateSitemaps による
// 分割サイトマップへ移行する）。
// REQ-199 FR-199-03: 公開プロフィールは sitemap から除外したため profiles 上限は廃止。
// REQ-228 FR-228-09 / NFR-228-01: 種×地域 URL は 48 通り（2 種 × 24 市町村）と小さいが、
// 集計は地域×種ごとに head-count を 48 回叩く素朴実装を避け、承認済み投稿の
// (municipality, species) を 1 本のクエリで取得して JS 側で件数集計する。集計対象の投稿取得上限。
const SITEMAP_LIMITS = { posts: 40000, requests: 5000, areaSpeciesAgg: 50000 } as const

function warnIfTruncated(label: string, length: number, limit: number) {
  if (length >= limit) {
    // eslint-disable-next-line no-console
    console.warn(`[sitemap] ${label} が上限 ${limit} 件に達しました。分割サイトマップ(generateSitemaps)への移行を検討してください。`)
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/map`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/guide`, changeFrequency: 'monthly', priority: 0.7 },
    // REQ-176: マーケティング LP（広告・SNS 流入の受け皿）
    { url: `${BASE_URL}/lp`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/trends`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE_URL}/ranking`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE_URL}/area`, changeFrequency: 'daily', priority: 0.7 },
    // REQ-199 FR-199-04: 公開・index対象の調査依頼一覧(内部リンク起点)を追加
    { url: `${BASE_URL}/requests`, changeFrequency: 'weekly', priority: 0.6 },
    // REQ-230 FR-230-01: オープンデータ公開ページ（CSV/GeoJSON 配布の入口・リンカブルアセット）
    { url: `${BASE_URL}/dataset`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
  ]

  // Area pages (municipality landing pages)
  const areaPages: MetadataRoute.Sitemap = MUNICIPALITY_DATA.map((m) => ({
    url: `${BASE_URL}/area/${m.slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  // REQ-227: 種別ピラーページ（種ロングテールの受け皿・内部リンクの集約先）
  const speciesPages: MetadataRoute.Sitemap = SPECIES.map((s) => ({
    url: `${BASE_URL}/species/${s.value}`,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  // REQ-186: cookie 非依存の anon クライアントで ISR(revalidate)を実効化する。
  const supabase = createAnonClient()
  if (!supabase) {
    // env 未設定(誤設定)時は動的URL取得をスキップし、静的URLのみ返す(次回再生成で復旧)。
    return [...staticPages, ...areaPages, ...speciesPages]
  }

  // Dynamic post pages (approved only) — select only needed columns
  const { data: posts } = await selectPublicPostsForSitemap(supabase)
    .order('updated_at', { ascending: false })
    .limit(SITEMAP_LIMITS.posts)
  warnIfTruncated('posts', posts?.length ?? 0, SITEMAP_LIMITS.posts)

  const postPages: MetadataRoute.Sitemap = (posts || []).map((post) => ({
    url: `${BASE_URL}/post/${post.id}`,
    lastModified: new Date(post.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  // Survey requests
  const { data: requests } = await supabase
    .from('survey_requests')
    .select('id, created_at')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(SITEMAP_LIMITS.requests)
  warnIfTruncated('survey_requests', requests?.length ?? 0, SITEMAP_LIMITS.requests)

  const requestPages: MetadataRoute.Sitemap = (requests || []).map((req) => ({
    url: `${BASE_URL}/request/${req.id}`,
    lastModified: new Date(req.created_at),
    changeFrequency: 'weekly' as const,
    priority: 0.5,
  }))

  // REQ-228 FR-228-09 / AC-04 / NFR-228-04: 種×地域 URL は「index 対象（canonical=自分自身）」だけ載せる。
  // すなわち各 (municipality, species) の承認済み件数が AREA_SPECIES_INDEX_MIN_POSTS 以上の組のみ。
  // しきい値未満は page.tsx 側で noindex + 親 canonical に隔離されるため、sitemap からも除外し
  // robots/canonical と矛盾させない（REQ-199 と同原則）。集計は 1 本のクエリ + JS で行う（NFR-228-01）。
  const { data: speciesAreaRows } = await selectPublicPostsForAreaSpecies(supabase).limit(
    SITEMAP_LIMITS.areaSpeciesAgg
  )
  warnIfTruncated('area×species 集計', speciesAreaRows?.length ?? 0, SITEMAP_LIMITS.areaSpeciesAgg)

  // 有効な (slug, speciesValue) ごとに件数を集計。未知の市町村名/種は URL を持たないため除外する。
  const knownSpecies = new Set<string>(SPECIES.map((s) => s.value))
  const comboCounts = new Map<string, number>()
  for (const row of speciesAreaRows || []) {
    const slug = row.municipality ? getMunicipalitySlug(row.municipality) : undefined
    if (!slug || !row.species || !knownSpecies.has(row.species)) continue
    const key = `${slug}/${row.species}`
    comboCounts.set(key, (comboCounts.get(key) ?? 0) + 1)
  }

  const areaSpeciesPages: MetadataRoute.Sitemap = []
  for (const [key, count] of comboCounts) {
    if (count < AREA_SPECIES_INDEX_MIN_POSTS) continue
    areaSpeciesPages.push({
      url: `${BASE_URL}/area/${key}`,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })
  }

  // REQ-199 FR-199-03: 公開プロフィール /profile/[userId] は robots noindex のため、
  // sitemap に載せると GSC「noindex でブロック」エラーを量産する。プライバシー重視で
  // sitemap から除外し、sitemap と robots の指示を一致させる。
  return [...staticPages, ...areaPages, ...speciesPages, ...areaSpeciesPages, ...postPages, ...requestPages]
}
