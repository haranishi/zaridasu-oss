/**
 * REQ-230 FR-230-01 / FR-230-07: オープンデータ公開ページ `/dataset`。
 *
 * ログイン不要・robots index 許可（robots.ts は `/` 許可で /dataset を除外していない）。
 * 匿名化・位置粗化済みの観察データ（CSV / GeoJSON）の配布入口で、概要・収録項目・含めない PII・
 * ライセンス（CC BY 4.0）・ダウンロードリンク・DOI/引用・データの限界（caveats）を掲示する。
 *
 * i18n はまず ja を正本とする（TermsPage / PrivacyPage と同じ静的 Server Component 方針）。
 * en/ko/zh は後続対応でも可（報告に 4 言語の文言案を添える）。
 *
 * 本ページは REQ-229 が出力する `Dataset` JSON-LD の `distribution` が指す配布先。
 * `Dataset` 構造化メタデータ自体の出力は REQ-229 が主管のため、本ページでは重複出力しない。
 */
import type { Metadata } from 'next'
import { Fragment } from 'react'
import { Download, FileText, Map as MapIcon, ShieldCheck, BookMarked } from 'lucide-react'
import Footer from '@/components/layout/Footer'
import PageHeader from '@/components/layout/PageHeader'
import PageBottomNav, { BottomNavSpacer } from '@/components/layout/PageBottomNav'
import Breadcrumb from '@/components/ui/Breadcrumb'
import { createAnonClient } from '@/lib/supabase/anon'
import {
  PUBLIC_POST_STATUS,
  countPublicPosts,
  selectPublicPostObservedAt,
} from '@/lib/data/posts'
import { BASE_URL } from '@/lib/constants'
import { PAGE_CONTAINER } from '@/lib/layout'
import { buildPageMetadata } from '@/lib/seo'
import {
  COORD_PRECISION_LABEL,
  DATASET_LICENSE_NAME,
  DATASET_LICENSE_URL,
  datasetColumnDocs,
} from './zaridasu.csv/route'

// REQ-230 NFR-230-05: 日次更新で十分（分布は時間単位で変わらない）。area ページと同等。
export const revalidate = 86400

// REQ-312 FR-312-02: 研究・行政向けの学術的な共有経路が想定されるページなのに、
// openGraph 未定義で root layout の `url: '/'` とホームのタイトルを継承していた。
// buildPageMetadata へ一本化して canonical と og:url を同じ値から生成する。
export const metadata: Metadata = buildPageMetadata({
  path: '/dataset',
  title: 'オープンデータ（外来生物 観察データの公開・DOI 引用）',
  description:
    '秋田県の外来生物（アメリカザリガニ・ウシガエル）の市民科学観察データを、匿名化・位置粗化のうえ CSV / GeoJSON で公開しています。CC BY 4.0。研究・行政での再利用が可能です。',
})

/**
 * REQ-230 FR-230-01(f): 収録件数・収録期間・最終更新を anon クライアント（cookie 非依存・ISR 成立）で取得。
 * 取得失敗時（env 未設定等）は null を返し、ページは件数非表示で描画する（fail-open）。
 */
async function getDatasetStats(): Promise<{ count: number; minDate: string | null; maxDate: string | null } | null> {
  const supabase = createAnonClient()
  if (!supabase) return null

  const countRes = await countPublicPosts(supabase)
  const count = countRes.count ?? 0

  // 収録期間（観察日時の最小・最大）。観察日時が無いレコードは created_at で代替表示しないため null 許容。
  const minRes = await selectPublicPostObservedAt(supabase)
    .order('observed_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const maxRes = await selectPublicPostObservedAt(supabase)
    .order('observed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    count,
    minDate: (minRes.data?.observed_at as string | null) ?? null,
    maxDate: (maxRes.data?.observed_at as string | null) ?? null,
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ja-JP')
}

/**
 * REQ-310 FR-310-01: 収録項目（カラム）の説明表は**手書きせず列定義から導出**する。
 * 出力列（CSV / GeoJSON）と同じ `DATASET_COLUMNS` が正本なので、列を足しても説明表が静かに陳腐化しない。
 */
const COLUMNS = datasetColumnDocs()

const EXCLUDED: string[] = [
  'ユーザー識別子（user_id）・メールアドレスなどのアカウント情報',
  '投稿者の IP アドレス（reporter_ip）',
  'GPS 位置精度（accuracy）— 高精度の手がかりとなるため非公開',
  '自由記述コメント（comment）— 個人情報が含まれ得るため非公開',
  '写真・音声（photos / audio）— ストレージ URL や Exif を介した特定を避けるため非公開',
  '生の緯度・経度 — 公開するのは粗化済み座標のみ',
]

const CAVEATS: string[] = [
  'これは市民科学による任意投稿データであり、悉皆（しっかい）調査ではありません。観察された地点・件数には、人の通りやすさ・関心の偏り（観察努力のバイアス）が含まれます。「報告が無い＝生息していない」ではありません。',
  'AI による一次判定と人手レビューを経て承認（approved）された投稿のみを収録しています（未承認・却下データは含みません）。',
  '調査手法（survey_method）により取得文脈が異なります（定点反復 structured と機会記録 opportunistic では比較可能性が異なります）。',
  `座標はプライバシー保護のため粗化（${COORD_PRECISION_LABEL}）しており、正確な観察地点ではありません。地点レベルの精密解析には適しません。`,
]

export default async function DatasetPage() {
  const stats = await getDatasetStats()
  const attribution = `ザリダス（出典 ${BASE_URL}/dataset）`  // REQ-282 D-3: 引用URLはBASE_URLに統一（別ドメイン配信時の誤りを防ぐ）

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* REQ-320 FR-320-02: 赤ベタヘッダーを廃止し、アプリ本体と同じ白ヘッダーへ統一。
          h1（オープンデータ）はこのページの唯一の h1 なので asH1 でヘッダー側に残す（AC-04）。
          PageHeader は文字列 props しか取らないので Server Component から直接描画できる。 */}
      <PageHeader title="オープンデータ" asH1 />

      {/* REQ-322 FR-322-02: 下層ページで唯一パンくずが無く、現在地が読めなかった（Round 3 採点 #10）。
          Breadcrumb は 'use client' だが props は文字列だけなので Server Component から直接置ける。
          このページは ja 正本（TermsPage / PrivacyPage と同方針）なのでラベルも固定文字列。 */}
      <Breadcrumb items={[{ label: 'オープンデータ' }]} />

      {/* REQ-275 FR-275-04: RootMain の除外対象になったため、スキップリンク先の
          id="main-content" はこの main が担う（/lp の LandingPage と同型）。 */}
      <main id="main-content" className={`${PAGE_CONTAINER} py-6`}>
        <div className="bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-2xl shadow-xs p-6 space-y-8 text-sm leading-relaxed">
          {/* 概要 */}
          <section>
            <h2 className="font-bold text-lg text-gray-800 dark:text-gray-100 mb-2">研究データの公開について</h2>
            <p>
              ザリダスは、秋田県内の外来生物（アメリカザリガニ・ウシガエル）の目撃・捕獲・痕跡などの観察情報を、
              市民のみなさんからの投稿で集めています。集まったデータを研究・行政・教育で広く役立てていただくため、
              <strong>個人が特定されない形に匿名化し、位置情報を粗化したうえで</strong>、機械可読な形式（CSV / GeoJSON）で公開しています。
            </p>
            {/* REQ-320 FR-320-06: `list-inside` は行頭記号を**行ボックスの中**に置くため、
                折り返した 2 行目が記号の位置（x=42）まで左へ飛び出し、1 行目の文字開始（x=57）と
                段落の左端が揃わなかった。`list-outside` + 左パディングでぶら下がりインデントにする。 */}
            <ul className="mt-3 grid gap-1 list-disc list-outside ps-5">
              <li><strong>対象種</strong>: アメリカザリガニ、ウシガエル</li>
              <li><strong>対象地域</strong>: 秋田県</li>
              <li><strong>収集方法</strong>: 市民科学（任意投稿）。定点反復（structured）と機会記録（opportunistic）の両方を含む</li>
              <li><strong>収録対象</strong>: AI 判定＋人手レビューを経て承認された投稿のみ（status = {PUBLIC_POST_STATUS}）</li>
              {stats && (
                <>
                  <li><strong>収録件数</strong>: 約 {stats.count.toLocaleString('ja-JP')} 件</li>
                  <li><strong>収録期間</strong>: {formatDate(stats.minDate)} 〜 {formatDate(stats.maxDate)}</li>
                </>
              )}
              <li><strong>最終更新</strong>: 日次で自動更新（ダウンロード時点の最新承認データ）</li>
            </ul>
          </section>

          {/* ダウンロード */}
          <section>
            <h2 className="font-bold text-lg text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Download size={18} /> データのダウンロード
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <a
                href="/dataset/zaridasu.csv"
                className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-red-400 dark:hover:border-red-500 transition-colors"
              >
                <FileText size={22} className="text-red-600 dark:text-red-400 shrink-0" />
                <span>
                  <span className="block font-semibold text-gray-800 dark:text-gray-100">CSV</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">表計算・統計ソフト向け（UTF-8）</span>
                </span>
              </a>
              <a
                href="/dataset/zaridasu.geojson"
                className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-red-400 dark:hover:border-red-500 transition-colors"
              >
                <MapIcon size={22} className="text-red-600 dark:text-red-400 shrink-0" />
                <span>
                  <span className="block font-semibold text-gray-800 dark:text-gray-100">GeoJSON</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">QGIS・地図ライブラリ向け（RFC 7946）</span>
                </span>
              </a>
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              絞り込みも可能です。例:{' '}
              <code className="inline-block max-w-full break-all px-1 py-0.5 rounded-sm bg-gray-100 dark:bg-gray-700">
                /dataset/zaridasu.geojson?species=american&amp;municipality=秋田市&amp;from=2026-01-01&amp;to=2026-12-31
              </code>
              （指定できる軸: <code>species</code> / <code>municipality</code> / <code>from</code> / <code>to</code>。既定は全件・粗化版）
            </p>
          </section>

          {/* ライセンス */}
          <section>
            <h2 className="font-bold text-lg text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-2">
              <ShieldCheck size={18} /> ライセンスと帰属表示
            </h2>
            <p>
              本データは{' '}
              <a
                href={DATASET_LICENSE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-600 dark:text-red-400 underline"
              >
                クリエイティブ・コモンズ 表示 4.0 国際（{DATASET_LICENSE_NAME}）
              </a>{' '}
              のもとで提供されます。出典を明示すれば、複製・改変・再配布・商用利用が可能です。
            </p>
            <p className="mt-2">
              推奨される帰属表示（attribution）:
            </p>
            <p className="mt-1 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-xs">
              {attribution}（{DATASET_LICENSE_NAME}）— DOI 発行後は DOI を併記してください
            </p>
          </section>

          {/* 収録項目 */}
          <section>
            <h2 className="font-bold text-lg text-gray-800 dark:text-gray-100 mb-2">収録項目（カラム）</h2>
            <p className="mb-3">
              種・情報種別は、言語に依存しない安定したコード値（machine 用）と日本語ラベル（human 用）の両方を収録しています。
            </p>
            {/* REQ-318 FR-318-06: 旧実装は <table> + overflow-x-auto で、390px では
                「意味」列（＝この表で唯一読む価値のある列）が全 11 行とも文字の途中から
                画面外に消え、横スクロールしないと読めなかった。
                カラム名→説明は本来 <dl>（記述リスト）の構造なので、表組みをやめて
                「1 項目 = 1 ブロック」の縦積みにし、md 以上でだけ 2 カラムグリッドに畳む。
                これで横スクロールに依存する箇所が消える（グリッドは自然に折り返す）。
                REQ-310: 一覧の出どころは DATASET_COLUMNS（= datasetColumnDocs）のままで、
                列を足せばこの表示も自動で増える。 */}
            <dl className="grid grid-cols-1 text-xs md:grid-cols-[max-content_1fr] md:gap-x-6">
              {COLUMNS.map((c) => (
                <Fragment key={c.name}>
                  <dt className="mt-3 font-mono break-all text-gray-800 dark:text-gray-100 md:mt-0 md:border-t md:border-gray-100 md:py-2 md:dark:border-gray-700/60">
                    {c.name}
                  </dt>
                  <dd className="mt-0.5 border-b border-gray-100 pb-3 dark:border-gray-700/60 md:mt-0 md:border-b-0 md:border-t md:py-2 md:pb-2">
                    {c.description}
                  </dd>
                </Fragment>
              ))}
            </dl>
          </section>

          {/* 含めない項目（PII） */}
          <section>
            <h2 className="font-bold text-lg text-gray-800 dark:text-gray-100 mb-2">含めない項目（プライバシー保護）</h2>
            <p className="mb-2">
              個人の特定や、希少種の採集圧（密猟）につながる情報は、公開データに<strong>一切含めていません</strong>。
            </p>
            <ul className="list-disc list-outside ps-5 space-y-1">
              {EXCLUDED.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              位置情報は <strong>{COORD_PRECISION_LABEL}</strong> しており、生の緯度・経度や GPS 精度は公開しません。
              研究上どうしても高精度が必要な場合は、個別の利用申請（お問い合わせ）にてご相談ください。
            </p>
          </section>

          {/* DOI と引用方法 */}
          <section>
            <h2 className="font-bold text-lg text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-2">
              <BookMarked size={18} /> 引用方法（DOI）
            </h2>
            {/* REQ-323 FR-323-09: 旧文面は「ここに DOI と正式な引用フォーマットを掲示します」という
                **プレースホルダーの指示文がそのまま本番に出ていた**（作りかけに見える・Round 4 採点 🟡）。
                DOI が無い期間は「無い」ことを一度言い切り、いま使える引用形式を通常の本文として示す。
                掲示の予告は書かない（DOI を発行したらこの段落を実物に差し替える）。 */}
            <p>
              現在このデータセットに DOI は付与されていません。引用する際は、本ページの URL
              （<code>{`${BASE_URL}/dataset`}</code>）とアクセス日を記載してください。
            </p>
            <p className="mt-2">
              研究データリポジトリ（Zenodo / OSF）へのスナップショット登録と DOI 付与を予定しています。
            </p>
          </section>

          {/* データの限界（caveats） */}
          <section>
            <h2 className="font-bold text-lg text-gray-800 dark:text-gray-100 mb-2">データの限界（ご利用前にお読みください）</h2>
            <ul className="list-disc list-outside ps-5 space-y-2">
              {CAVEATS.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>
        </div>
      </main>

      <Footer />
      {/* REQ-320 FR-320-01: 逃げ幅はフッターの後ろ（fixed なナビにフッター最終行が潜らないように） */}
      <BottomNavSpacer />
      <PageBottomNav />
    </div>
  )
}
