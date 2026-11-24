'use client'

import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import PageHeaderShell from './PageHeaderShell'
import HeaderDesktopNav from './HeaderDesktopNav'

/**
 * REQ-320 FR-320-02: 下層ページ（/about・/dataset・/species・/area）の共通ヘッダー。
 *
 * ■ 何を直しているか
 * Round 1 の採点でヘッダーが **4 種類**あった（同じサイトを回っている感覚が切れる）:
 *   ① 白 + ハンバーガー + ロゴ（/ /trends /ranking）… Header.tsx
 *   ② 赤ベタ + 戻る矢印（/about /dataset /terms /privacy）
 *   ③ 無し（/species）
 *   ④ 白 + 戻る矢印 + ピン（/area）
 * ②③④ をこのコンポーネント（見た目は PageHeaderShell）に寄せ、①と**同じ意匠**
 * （白 / 下 1px 境界 / 中央にロゴ＋ページ名 / 高さ h-12 / 同じコンテナ）に揃える。
 * 違うのは左のコントロールだけ（アプリ本体はハンバーガー、下層ページは戻る矢印）。色は変えない。
 *
 * ■ Server Component から直接使える
 * props は文字列だけで関数を受け取らないため、`/dataset` や `/species/[species]` のような
 * Server Component からラッパー無しで呼べる（BottomNav はコールバックを要求するので
 * PageBottomNav 経由になる。そちらとは事情が違う）。
 * i18n すら不要なページ（/terms・/privacy）は PageHeaderShell を直接使う。
 *
 * ■ h1 の扱い（REQ-320 AC-04）
 * /about・/dataset・/area は **旧ヘッダーの中に h1 があった**。素の <span> に置き換えると
 * ページから h1 が消えるので、`asH1` を渡した場合だけ見出し要素として描画する。
 * /species は本文側に h1 を持っているので `asH1` を渡さない（h1 の重複を作らない）。
 */
export interface PageHeaderProps {
  /** 中央に出すページ名。i18n 済みの文字列か、Server Component 側の確定文字列を渡す。 */
  title?: string
  /** title の代わりに i18n キーで渡す場合（クライアント側で言語切替に追従させたいとき）。 */
  titleKey?: string
  /** 戻る先。既定はホーム（地図）。 */
  backHref?: string
  /** ページ名をこのヘッダーの h1 として描画するか。 */
  asH1?: boolean
}

export default function PageHeader({ title, titleKey, backHref = '/', asH1 = false }: PageHeaderProps) {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <PageHeaderShell
      title={title ?? (titleKey ? t(titleKey) : t('header.pageTitle.home'))}
      backHref={backHref}
      backLabel={t('common.backToTop')}
      asH1={asH1}
      // REQ-323 FR-323-01: 1024px 以上ではボトムタブが消えるので、下層ページにも
      // ヘッダー水平ナビを出す。これが無いと /about・/dataset・/species・/area は
      // **広い画面でアプリ本体への導線がゼロ**になる（REQ-320 FR-320-01 が直した状態への逆戻り）。
      // 投稿・ログインは PageBottomNav と同じく地図（/）へ送る。
      nav={<HeaderDesktopNav onPostClick={() => router.push('/map?post=1')} onLoginClick={mode => router.push(`/?auth=${mode}`)} />}
    />
  )
}
