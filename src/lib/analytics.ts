/**
 * REQ-232: GA4 行動イベントの汎用送出ユーティリティ。
 *
 * 計測経路は GTM/dataLayer の 1 経路に統一する（@next/third-parties 等は併設しない）。
 * `page_view` は GA4 拡張計測（ブラウザ履歴イベント）に委ねるため、本関数からは
 * 送出しない（NFR-232-01 二重計上防止）。
 *
 * ガード方針（既存 lpAnalytics / WebVitalsReporter と同基準）:
 *   1. SSR ガード（typeof window === 'undefined' で no-op）
 *   2. production ガード（NODE_ENV !== 'production' で no-op）
 *   3. window.dataLayer を初期化してから push
 *
 * push 失敗・例外は握りつぶし、呼び出し元の本来処理（投稿・いいね・調査依頼など）を
 * 決して止めない（影響範囲: 他機能への影響リスク参照）。
 *
 * 計測仕様書（tracking plan）は docs/requirements/REQ-232-ga4-behavioral-events.md を参照。
 */

/**
 * 送出可能なイベント名のユニオン。
 * GA4 側のキーイベント/レポート定義を壊さないため、既存イベント名は不変。
 */
export type AnalyticsEventName =
  // ── 既存（不変）──────────────────────────────────────────────
  // LP（REQ-176 が主管）
  | 'lp_view'
  | 'lp_scroll'
  | 'lp_cta_signup'
  | 'lp_cta_map'
  | 'lp_faq_open'
  // Web Vitals
  | 'web_vital'
  // 認証（REQ-033 が主管・挙動不変）
  | 'sign_up'
  | 'login'
  | 'sign_up_initiated'
  // ── 投稿ファネル（REQ-232 FR-232-02）─────────────────────────
  | 'post_start'
  | 'post_media_attached'
  | 'post_submit'
  | 'post_success'
  | 'post_fail'
  | 'post_save_offline'
  // ── エンゲージ（REQ-232 FR-232-03）───────────────────────────
  | 'like'
  | 'comment_post'
  | 'report_submit'
  | 'ai_identify_view'
  // ── 地図/検索/ギャラリー（REQ-232 FR-232-04）─────────────────
  | 'map_interact'
  | 'map_filter_bounds'
  | 'gallery_view'
  | 'search'
  // ── 調査依頼（REQ-232 FR-232-05）─────────────────────────────
  | 'survey_request_start'
  | 'survey_request_submit'
  // ── 紹介ストーリー / バナー opt-out（REQ-284 FR-284-16）───────
  | 'intro_prompt_shown'
  | 'intro_open'
  /** params: { page: 1..6 } */
  | 'intro_page_view'
  | 'intro_complete'
  | 'onboarding_completed'
  | 'intro_optout'
  /** params: { banner: 'signup' | 'install' } */
  | 'banner_optout'
  // ── 起動時ホーム（2026-10-19）。座標・個人情報は送らない ────────────
  /** params: { target: 'map' | 'guide' | 'about' } ヒーローの副ボタン・ガイドリンク・記録の使われ方リンク */
  | 'home_cta'
  /** params: { banner: 'fieldwork' | 'monitor' | 'research' } */
  | 'home_banner'
  /** params: { gap: 'species' | 'absence' | 'area' } 「まだ足りない記録」のカード */
  | 'home_gap'
  /** 未ログインで記録しようとした操作。params: { entry: 'home_hero' | 'home_gap' | 'header' | 'bottom_nav' | 'onboarding' } */
  | 'post_intent'

/**
 * GA4（GTM dataLayer）へ行動イベントを送出する。
 * SSR / 非 production / dataLayer 未定義環境では安全に no-op となる。
 */
export function trackEvent(
  name: AnalyticsEventName,
  params: Record<string, unknown> = {},
): void {
  if (typeof window === 'undefined') return
  if (process.env.NODE_ENV !== 'production') return
  try {
    if (!Array.isArray(window.dataLayer)) window.dataLayer = []
    window.dataLayer.push({ event: name, ...params })
  } catch {
    // dataLayer.push の失敗は計測のみ諦め、呼び出し元の処理は継続する。
  }
}
