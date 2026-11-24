/**
 * REQ-141: 利用規約ページ本体（Server Component 化済み）。
 *
 * `useTheme()` を排し、Tailwind の `dark:` 変種で SSR HTML 内に
 * 完全な本文を出力する。`<html class="dark">` は ThemeProvider が
 * クライアント側で付与するため、ハイドレーション後に自然にダーク表示へ切り替わる。
 *
 * ヘッダーは静的（i18n を使わない）なため、Footer の Client island のみが
 * クライアント JS を要求する。
 */
import Link from 'next/link'
import Footer from '@/components/layout/Footer'
import PageHeaderShell from '@/components/layout/PageHeaderShell'
import { PAGE_CONTAINER } from '@/lib/layout'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* REQ-320 FR-320-02: 赤ベタヘッダーを廃止し、アプリ本体と同じ白ヘッダーへ統一する。
          PageHeaderShell は Client Component ではないので、このページの
          「ヘッダーは静的＝ Footer の island 以外は JS を要求しない」設計を壊さない。 */}
      <PageHeaderShell title="利用規約" backLabel="ホームに戻る" asH1 />

      <div className={`${PAGE_CONTAINER} py-6`}>
        <div className="bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-2xl shadow-xs p-6 space-y-6 text-sm leading-relaxed">
          <p className="text-xs text-gray-400 dark:text-gray-500">最終更新日: 2024年1月1日</p>

          <section>
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-2">第1条（適用）</h2>
            <p>本規約は、ザリダス（以下「本サービス」）の利用に関する条件を定めるものです。本サービスを利用したすべてのユーザーに適用されます。</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-2">第2条（禁止事項）</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>虚偽の情報を投稿すること</li>
              <li>他者を誹謗中傷するコメントを投稿すること</li>
              <li>著作権・肖像権を侵害する写真を投稿すること</li>
              <li>スパム投稿・連続投稿などの迷惑行為</li>
              <li>本サービスの運営を妨害する行為</li>
              <li>法令または公序良俗に違反する行為</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-2">第3条（投稿内容について）</h2>
            <p>ユーザーが投稿した情報（位置情報・写真・コメント等）は、本サービス上で公開されます。投稿内容の正確性はユーザーの責任に帰します。運営は投稿内容を確認・削除する権限を有します。</p>
          </section>

          {/* REQ-230 FR-230-04(b): 投稿者から運営への、匿名化・位置粗化したうえでのオープンデータ公開・再配布の許諾 */}
          <section>
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-2">第4条（オープンデータとしての公開・再配布）</h2>
            <p>ユーザーは、投稿した観察情報（種類・情報種別・市区町村・観察日時・個体数・調査手法等）について、運営が次のとおり利用・公開・再配布することを許諾します。</p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>個人を特定できる情報（アカウント情報・IP アドレス・自由記述コメント等）を除外し、位置情報を粗化（座標の丸め）したうえで、研究・行政・教育目的のオープンデータとして公開すること。</li>
              <li>公開データを「クリエイティブ・コモンズ 表示 4.0 国際（CC BY 4.0）」のもとで第三者が再利用・再配布できる形で配布すること。</li>
              <li>公開データのスナップショットを研究データリポジトリ（Zenodo / OSF 等）に登録し、DOI（永続識別子）を付与すること。</li>
            </ul>
            <p className="mt-2">公開されるのは匿名化・位置粗化済みの情報に限られ、生の緯度経度・GPS 精度・個人情報は公開しません。詳細は<Link href="/dataset" className="text-red-600 dark:text-red-400 underline">オープンデータのページ</Link>をご確認ください。</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-2">第5条（免責事項）</h2>
            <p>本サービスは投稿情報の正確性・完全性を保証しません。本サービスの利用によって生じた損害について、運営は責任を負いません。</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-2">第6条（規約の変更）</h2>
            <p>運営は必要に応じて本規約を変更できます。変更後の規約はサービス上に掲示した時点で効力を生じます。</p>
          </section>
        </div>
      </div>

      <Footer />
    </div>
  )
}
