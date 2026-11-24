import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAnonClient } from '@/lib/supabase/anon'
import { countPublicPostsBySpecies, selectPublicPostsForRecentList } from '@/lib/data/posts'
import { SPECIES, MUNICIPALITY_DATA, getSpecies } from '@/lib/constants'
import { PAGE_CONTAINER } from '@/lib/layout'
import { SITE_NAME, safeJsonLd, generateSpeciesSEO, ABOUT_BREADCRUMB } from '@/lib/seo'
import Footer from '@/components/layout/Footer'
import PageHeader from '@/components/layout/PageHeader'
import PageBottomNav, { BottomNavSpacer } from '@/components/layout/PageBottomNav'
import Breadcrumb from '@/components/ui/Breadcrumb'
import jaTranslation from '@/locales/ja/translation.json'

type Props = { params: Promise<{ species: string }> }

// REQ-227 / NFR-227-01: 種ピラーは2パスを静的生成し日次ISR（area / sitemap と整合）。
export const revalidate = 86400

export function generateStaticParams() {
  return SPECIES.map((s) => ({ species: s.value }))
}

// REQ-227: 学名。REQ-229 で sameAs(Wikidata/GBIF)・taxon を付与予定（本REQは表示のみ）。
const SCIENTIFIC_NAMES: Record<string, string> = {
  american: 'Procambarus clarkii',
  bullfrog: 'Lithobates catesbeianus',
}

type LawInfo = { title?: string; desc?: string; rule1?: string; rule2?: string }
// REQ-227: 種テキストは既存 ja 辞書を正本として SSR 出力（/about と同方針。NFR-227-02）。
const about = (jaTranslation as {
  about?: {
    species_info?: Record<string, { status?: string; desc?: string }>
    law_info?: Record<string, LawInfo | string>
  }
}).about

// i18n の Trans プレースホルダ（<0>…</0>）をプレーンテキスト化する。
function stripTags(s: string): string {
  return s.replace(/<\/?\d+>/g, '')
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { species } = await params
  const sp = getSpecies(species)
  if (!sp) return { title: '種が見つかりません' }

  const info = about?.species_info?.[species]
  const sci = SCIENTIFIC_NAMES[species]
  const title = `${sp.label}とは｜秋田での目撃・見分け方・法律と対策`
  const descBase = info?.desc ? stripTags(info.desc) : ''
  const description = `${sp.label}（${sci}）の特徴・見分け方、${info?.status ?? '外来生物'}としての法的な扱い、秋田での観察状況をまとめました。${descBase}`.slice(0, 120)

  return {
    title,
    description,
    alternates: { canonical: `/species/${species}` },
    openGraph: {
      type: 'website',
      title: `${title} | ${SITE_NAME}`,
      description,
      url: `/species/${species}`,
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'ザリダス - 秋田県外来生物情報マップ' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
    },
  }
}

export default async function SpeciesPage({ params }: Props) {
  const { species } = await params
  const sp = getSpecies(species)
  if (!sp) notFound()

  const info = about?.species_info?.[species]
  const law = about?.law_info?.[species] as LawInfo | undefined
  const lawWarning = about?.law_info?.warning as string | undefined
  const sci = SCIENTIFIC_NAMES[species]

  // REQ-227 NFR-227-01: 観察状況は head-count(転送ゼロ) + 最新数件のみ。anon クライアントで ISR 成立。
  const supabase = createAnonClient()
  let postCount = 0
  let recentPosts: { id: string; municipality: string | null; created_at: string }[] = []
  if (supabase) {
    const [countRes, recentRes] = await Promise.all([
      countPublicPostsBySpecies(supabase, sp.value),
      selectPublicPostsForRecentList(supabase)
        .eq('species', sp.value)
        .order('created_at', { ascending: false })
        .limit(5),
    ])
    postCount = countRes.count ?? 0
    recentPosts = (recentRes.data as typeof recentPosts) ?? []
  }

  const { breadcrumbLd, aboutLd } = generateSpeciesSEO({ value: sp.value, label: sp.label, scientificName: sci })
  const areaLinks = MUNICIPALITY_DATA.slice(0, 8)
  const h2 = 'mt-7 text-lg font-bold text-gray-900 dark:text-gray-100'
  const body = 'mt-2 leading-relaxed text-gray-700 dark:text-gray-300'

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(aboutLd) }} />
      {/* REQ-320 FR-320-01/02: 検索エンジンからの着地ページなのにヘッダーもナビもフッターも
          無く、ページ先頭がいきなりパンくずだった（Round 1 採点 #1）。
          ロゴと地図への導線を出す。h1 は本文側（{sp.label}とは）にあるので asH1 は付けない。 */}
      <PageHeader title={sp.label} />
      {/* REQ-322 FR-322-02: 区切り記号を全ページで揃える。ここだけ手書きの `/` 区切りで、
          他ページ（about / trends / area / ranking）の「›」と食い違っていた（Round 3 採点 #9）。
          記号だけ差し替えると同じ食い違いがまた生まれるので、共通の Breadcrumb を通す
          （文字サイズ・色・コンテナ幅も他ページと同一になる）。
          REQ-312 FR-312-05: 可視パンくずと BreadcrumbList JSON-LD は同一定数（ABOUT_BREADCRUMB）から
          生成し、遷移先 /about の h1（about.title）と表示名を一致させる。 */}
      <Breadcrumb items={[
        { label: ABOUT_BREADCRUMB.name, href: ABOUT_BREADCRUMB.path },
        { label: sp.label },
      ]} />
      <div className={`${PAGE_CONTAINER} py-8`}>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{sp.label}とは</h1>
        <p className="mt-1 text-sm italic text-gray-500 dark:text-gray-400">{sci}</p>
        {info?.status && (
          // REQ-322 FR-322-03: 「条件付特定外来生物」バッジは about 側で灰チップに統合した。
          // ここだけ amber のままだと**同じ語が 3 つ目の色**で出る（Round 3 採点 #14 の再発）。
          <span className="mt-3 inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-slate-700 dark:text-slate-300">
            {info.status}
          </span>
        )}

        <section>
          <h2 className={h2}>どんな生き物？</h2>
          <p className={body}>{info?.desc ? stripTags(info.desc) : `${sp.label}は秋田県内でみられる外来生物です。`}</p>
        </section>

        {law && (
          <section>
            <h2 className={h2}>法律上の扱い・やってはいけないこと</h2>
            {law.desc && <p className={body}>{stripTags(law.desc)}</p>}
            <ul className="mt-3 space-y-1 text-gray-700 dark:text-gray-300">
              {law.rule1 && <li>・{law.rule1}</li>}
              {law.rule2 && <li>・{law.rule2}</li>}
            </ul>
            {lawWarning && (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                {lawWarning}
              </p>
            )}
          </section>
        )}

        <section>
          <h2 className={h2}>秋田での観察状況</h2>
          {/* REQ-321 FR-321-02: 「現在6件の報告があります」に対しリンクが5件しか無く、読者には
              数え間違いに見えていた。REQ-227 NFR-227-01 が観察状況を head-count + 最新数件に
              限っている（ISR で全件を転送しない）ので**リストが短いこと自体は正しい**。
              足りなかったのは「これは最新◯件だけ」という一言なので、件数は実データのまま注記を足す。
              件数はハードコードせず recentPosts.length から出す（limit(5) を変えても文が破綻しない）。
              リストが全件なら説明する差が無いので注記も出さない（FR-321-01 の注記と同じ出し分け）。 */}
          <p className={body}>
            秋田の市民が集めた観察データには、現在{postCount}件の{sp.label}の報告があります。
            {recentPosts.length > 0 && postCount > recentPosts.length &&
              `以下は、そのうち最新${recentPosts.length}件です。`}
          </p>
          {recentPosts.length > 0 && (
            <ul className="mt-3 space-y-1">
              {recentPosts.map((p) => (
                <li key={p.id}>
                  <Link href={`/post/${p.id}`} className="text-brand-700 hover:underline dark:text-brand-400">
                    {p.municipality ?? '秋田県'}の報告（{new Date(p.created_at).toLocaleDateString('ja-JP')}）
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className={h2}>地域別の状況を見る</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {areaLinks.map((m) => (
              <Link
                key={m.slug}
                href={`/area/${m.slug}`}
                className="rounded-full bg-gray-100 px-3.5 min-h-11 inline-flex items-center text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {m.name}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-xl bg-gray-50 p-4 dark:bg-slate-800/60">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{sp.label}を見つけたら</h2>
          <p className={body}>
            見つけた{sp.label}は、その場で逃がさず持ち帰るか、適切に処分してください。観察した場所をのせると、秋田の自然を守るためのデータになります。
          </p>
          <Link
            href="/map?post=1"
            className="mt-4 inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            地図で報告する →
          </Link>
        </section>
      </div>

      {/* REQ-320 FR-320-03: /area と同じ共通フッター（サイト全体の出口を揃える） */}
      <Footer />
      <BottomNavSpacer />
      <PageBottomNav />
    </>
  )
}
