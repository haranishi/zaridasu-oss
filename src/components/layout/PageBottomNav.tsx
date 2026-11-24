'use client'

import { useRouter } from 'next/navigation'
import BottomNav from './BottomNav'
import { BOTTOM_NAV_SPACER_HEIGHT } from '@/lib/layout'

/**
 * REQ-320 FR-320-01: Server Component のページ（/about・/dataset・/species・/area）へ
 * ボトムナビを出すためのクライアント側ラッパー。
 *
 * BottomNav は `onPostClick` / `onLoginClick` という**関数 props** を要求する Client Component
 * なので、Server Component からは直接描画できない（関数はシリアライズできない）。
 * CollectionPage.tsx:121 が既に「投稿・ログインは地図（/）へ送る」実装をしているので、
 * その使い方をそのままラッパー化する。
 *
 * ■ なぜナビを足すのか
 * `/species` と `/area` は sitemap.ts に載る **検索エンジンからの着地ページ**で、
 * そこへ来た人がアプリ本体（地図・投稿）へ進む導線を持っていなかった（Round 1 採点 #1）。
 */
export default function PageBottomNav() {
  const router = useRouter()
  return (
    <BottomNav
      onPostClick={() => router.push('/map?post=1')}
      onLoginClick={mode => router.push(`/?auth=${mode}`)}
    />
  )
}

/**
 * 本文の末尾に置く逃げ幅。`fixed` のナビは通常フローを押し下げないので、
 * これが無いとフッターの最終行がナビの下に潜る。
 * 高さの根拠は lib/layout.ts の BOTTOM_NAV_SPACER_HEIGHT を参照。
 *
 * REQ-323 FR-323-01: ナビ自体が lg(1024px) 以上で消えるので、逃げ幅も同じ境界で消す。
 * 残すと「何も無い 72px の帯」が下端に居座り、余白の減点になる。
 */
export function BottomNavSpacer() {
  return <div aria-hidden="true" className="lg:hidden" style={{ height: BOTTOM_NAV_SPACER_HEIGHT }} />
}
