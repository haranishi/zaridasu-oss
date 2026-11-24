import type { Metadata } from 'next'
import HomeShell from './HomeShell'

export const metadata: Metadata = {
  // REQ-199 FR-199-01: root の title.template による「| ザリダス」二重付与を避ける(/lp と同手法)。
  title: { absolute: 'ザリダス - 秋田県外来生物情報マップ' },
  description: '秋田県外来生物出没・分布情報マップ。アメリカザリガニやウシガエルの目撃・捕獲情報をリアルタイムで共有できます。',
  alternates: { canonical: '/' },
}

export default function HomePage() {
  return (
    <>
      {/* REQ-275: クライアント初期化前にも主題を取得できるSSR見出し。地図は /map。 */}
      <h1 className="sr-only">ザリダス - 秋田県外来生物情報マップ</h1>
      <p className="sr-only">
        秋田県内のアメリカザリガニ・ウシガエルなど外来生物の目撃・捕獲・痕跡情報を、
        地図上で投稿・共有できる市民参加型の調査プラットフォームです。
      </p>
      <HomeShell />
    </>
  )
}
