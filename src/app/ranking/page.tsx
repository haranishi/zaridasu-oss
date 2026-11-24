import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 3600

// REQ-171: 投稿数の順位づけではなく「発見の多様性」と貢献を主題にした文言へ更新
// REQ-312 FR-312-02: og:url / og:title / twitter:* の親継承を解消（buildPageMetadata へ一本化）。
// REQ-322 FR-322-01: 画面内（ボトムナビ・ヘッダー・パンくず・h1・フッター）は「ランキング」で
// 統一した。`<title>` だけ「みんなの記録」のままだと**4 つ目の名前**になるので先頭を揃える。
// REQ-171 の言い換え自体は括弧で残す（順位づけを主題にしない、というフレーミングは
// 本文側の ranking.framing / タブ順で担保しており、そこは変えていない）。
export const metadata: Metadata = buildPageMetadata({
  path: '/ranking',
  title: 'ランキング（みんなの記録）',
  description: '秋田県の外来生物調査の記録。発見の多様性（情報種類・種・地域のカバレッジ）と、市民の報告がもたらす分布把握への貢献を可視化します。',
})

export { default } from '@/views/RankingPage'
