/**
 * REQ-176: LP（/lp）計測イベントを GTM dataLayer へ送出する。
 * REQ-232: 送出口は汎用 trackEvent に一本化（production / SSR ガードを共通化）。
 *          イベント名・パラメータは不変（GA4 既存定義を壊さない）。
 * イベント定義は docs/requirements/REQ-176-marketing-landing-page.md FR-176-10 を参照。
 */
import { trackEvent } from '@/lib/analytics'

export type LpEventName = 'lp_view' | 'lp_scroll' | 'lp_cta_signup' | 'lp_cta_map' | 'lp_faq_open'

export function pushLpEvent(event: LpEventName, params: Record<string, unknown> = {}): void {
  trackEvent(event, params)
}

/**
 * REQ-236 (FR-236-04): シェア操作の GA4 イベント `share` を送出する。
 *
 * `share` は REQ-232 の `AnalyticsEventName` ユニオン（src/lib/analytics.ts）には
 * 含まれない別 REQ 由来のイベントのため、`trackEvent` を介さず GTM dataLayer の
 * 同一パターン（SSR ガード→production ガード→dataLayer.push、失敗は握りつぶし）で
 * 直接送出する。GA4 推奨イベント名 `share` に揃える（method=x/line/web_share/copy）。
 *
 * PII は載せない（content_id は投稿 UUID で非 PII / FR-236-04・NFR）。
 */
export interface ShareEventParams {
  /** 共有経路。GA4 `method` パラメータ（GA4 推奨）に対応。 */
  method: 'x' | 'line' | 'web_share' | 'copy'
  /** 投稿 ID（非 PII）。GA4 `content_id` に対応。 */
  content_id?: string
  /** content_type（既定 'post'）。 */
  content_type?: string
}

export function trackShare({ method, content_id, content_type = 'post' }: ShareEventParams): void {
  if (typeof window === 'undefined') return
  if (process.env.NODE_ENV !== 'production') return
  try {
    if (!Array.isArray(window.dataLayer)) window.dataLayer = []
    window.dataLayer.push({
      event: 'share',
      method,
      content_type,
      ...(content_id ? { content_id } : {}),
    })
  } catch {
    // dataLayer.push の失敗は計測のみ諦め、呼び出し元のシェア処理は継続する（NFR-236-03）。
  }
}
