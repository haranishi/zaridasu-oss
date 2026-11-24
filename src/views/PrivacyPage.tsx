/**
 * REQ-141: プライバシーポリシーページ本体（Server Component 化済み）。
 *
 * `useTheme()` を排し、Tailwind の `dark:` 変種で SSR HTML 内に
 * 完全な本文を出力する。`<html class="dark">` は ThemeProvider が
 * クライアント側で付与するため、ハイドレーション後に自然にダーク表示へ切り替わる。
 */
import Link from 'next/link'
import OnboardingPrivacyItem from '@/components/onboarding/OnboardingPrivacyItem'
import Footer from '@/components/layout/Footer'
import PageHeaderShell from '@/components/layout/PageHeaderShell'
import { PAGE_CONTAINER } from '@/lib/layout'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* REQ-320 FR-320-02: 赤ベタヘッダーを廃止し、アプリ本体と同じ白ヘッダーへ統一する。
          PageHeaderShell は Client Component ではないので、このページの
          「ヘッダーは静的＝ Footer の island 以外は JS を要求しない」設計を壊さない。 */}
      <PageHeaderShell title="プライバシーポリシー" backLabel="ホームに戻る" asH1 />

      <div className={`${PAGE_CONTAINER} py-6`}>
        <div className="bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-2xl shadow-xs p-6 space-y-6 text-sm leading-relaxed">
          <p className="text-xs text-gray-400 dark:text-gray-500">最終更新日: 2026年10月21日</p>

          <section>
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-2">収集する情報</h2>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>位置情報</strong>: 投稿時に選択した緯度・経度（地図上の任意の地点）</li>
              <li><strong>写真</strong>: 任意でアップロードした画像（Exif情報は除去しません）</li>
              <li><strong>コメント</strong>: 任意で入力したテキスト</li>
              <li><strong>市区町村</strong>: 任意で選択した市区町村名</li>
              <OnboardingPrivacyItem />
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-2">収集しない情報</h2>
            <p>本サービスは、ユーザーの氏名・電話番号など、不要な個人情報を収集しません。投稿にはログインが必要で、メールアドレスは認証とアカウント管理のために利用します。</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-2">情報の利用目的</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>地図上でのザリガニ分布情報の表示</li>
              <li>秋田県内の外来種分布調査への活用</li>
              <li>サービス改善・統計分析</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-2">位置情報について</h2>
            <p>投稿時に現在地取得を使用した場合、ブラウザの位置情報機能を利用します。位置情報の取得はユーザーの同意が必要であり、拒否することができます。取得した位置情報は投稿データとして保存されます。</p>
            {/* map-location-follow: 地図の「現在地を表示」は位置を継続して取る。取得する事実、当サイトの外へ座標を出さないこと、背景画像の取得で周辺の地域が提供元に伝わることを明示する */}
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 mt-4 mb-1">地図の「現在地を表示」について</h3>
            <p>地図の「現在地を表示」を使うと、もう一度押して止めるまで、端末の位置を繰り返し取得します。地図を動かして追従が一時停止しているあいだも、青い点を動かすために取得は続きます。この位置は、地図上の自分の位置の表示と、地図の追従に使います。</p>
            <p className="mt-2"><strong>追従のために取得した位置を、当サイトが自動で送信・保存したり、アクセス解析へ送ったりすることはありません。</strong></p>
            <p className="mt-2">ただし、ユーザーが操作したときは別です。投稿、「非公開で保存」、「近くの水域を探す」など、位置を使う機能を押すと、その機能に必要な座標（現在地や、現在地に合わせた地図の中心）が使われます。送信や保存が起きることもあります。保存されるのは、ユーザーが保存の操作をしたときだけです。</p>
            <p className="mt-2">止めると、取得も止まります。ページが見えなくなったときも止まり、戻ると取り直します。取得しているあいだは、位置の更新が止まらないよう、対応する端末で画面を点灯したままにします。</p>
            <p className="mt-2">追従中は、地図の範囲が現在地を中心に動きます。この範囲が検索条件としてサーバーへ送られてしまうのを避けるため、「現在の地図範囲内のみ」の絞り込みを自動でオフにします。</p>
            <p className="mt-2">ただし、地図の背景画像は、表示している地域の分を地図の提供元（OpenStreetMap、国土地理院）から取得します。追従中は地図が現在地に付いてくるので、現在地の周辺の地域を示す画像の要求が、IPアドレスとともに提供元へ届きます。手で地図を動かしたときと同じ仕組みで、座標そのものは送られません。</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-2">写真データについて</h2>
            <p>アップロードされた写真はSupabase Storageに保存され、公開されます。写真にGPS情報（Exif）が含まれている場合、第三者から閲覧できる可能性があります。プライバシーに配慮した写真をアップロードしてください。</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-2">第三者提供・オープンデータ公開</h2>
            <p>収集した情報を、法令に基づく場合を除き、特定の第三者に個別提供することはありません。ただし、研究・行政・教育での利活用のため、観察データをオープンデータとして公開する場合があります。</p>
            {/* REQ-230 FR-230-04(c): 公開されるのは匿名化・位置粗化済みで PII を含まないことを明示 */}
            <p className="mt-2">公開されるのは<strong>匿名化・位置粗化済みの観察データ</strong>に限られます。具体的には、メールアドレス等のアカウント情報・投稿者の IP アドレス・自由記述コメント・写真は<strong>公開データに含めず</strong>、緯度経度は正確な地点が分からないよう粗化（座標の丸め）したうえで配布します。公開データは「クリエイティブ・コモンズ 表示 4.0 国際（CC BY 4.0）」のもとで提供し、研究データリポジトリ（Zenodo / OSF 等）への登録・DOI 付与を行う場合があります。詳細は<Link href="/dataset" className="text-red-600 dark:text-red-400 underline">オープンデータのページ</Link>をご確認ください。</p>
          </section>

          {/* REQ-233 FR-233-07: 改正電気通信事業法（外部送信規律, 2023年6月施行）に基づく通知・公表 */}
          <section>
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-2">アクセス解析と外部送信について</h2>
            <p>
              本サービスは、サービスの改善および利用状況の把握のため、Google が提供するアクセス解析ツール「Google アナリティクス（GA4）」を Google タグマネージャー経由で利用しています。これにより、閲覧されたページや操作などの利用情報が Cookie 等を通じて Google 社へ送信されます（外部送信）。
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li><strong>送信先</strong>: Google LLC（Google アナリティクス）</li>
              <li><strong>送信される主な情報</strong>: ページの閲覧・操作などの行動データ、参照元、おおよその地域、端末・ブラウザ情報。<strong>氏名・メールアドレス・電話番号などの個人を直接特定できる情報は送信しません。</strong></li>
              <li><strong>利用目的</strong>: 利用状況の分析、機能改善、研究のための統計集計</li>
              <li><strong>データ保持期間</strong>: Google アナリティクス上のユーザー単位・イベント単位データは <strong>14ヶ月</strong> で自動的に削除されます。</li>
            </ul>
            <p className="mt-2">
              Google によるデータ取り扱いの詳細は{' '}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-600 dark:text-red-400 underline"
              >
                Google のプライバシーポリシー
              </a>
              {' '}を、収集の無効化はブラウザの Cookie 設定または{' '}
              <a
                href="https://tools.google.com/dlpage/gaoptout"
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-600 dark:text-red-400 underline"
              >
                Google アナリティクス オプトアウト アドオン
              </a>
              {' '}をご利用ください。
            </p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-2">お問い合わせ</h2>
            <p>プライバシーに関するご質問は、GitHubのIssueページよりお問い合わせください。</p>
          </section>
        </div>
      </div>

      <Footer />
    </div>
  )
}
