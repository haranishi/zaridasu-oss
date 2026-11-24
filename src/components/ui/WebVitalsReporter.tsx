'use client'

import { useEffect } from 'react'
import { onLCP, onINP, onCLS, onTTFB, onFCP, type Metric } from 'web-vitals'
import { trackEvent } from '@/lib/analytics'

// REQ-232: dataLayer 型宣言は src/types/gtm.d.ts に一本化。送出は共通 trackEvent 経由。
// イベント名 'web_vital' とパラメータは不変（GA4 既存定義を保持）。
function send(metric: Metric) {
  trackEvent('web_vital', {
    metric_name: metric.name,
    metric_value:
      metric.name === 'CLS'
        ? Math.round(metric.value * 10000) / 10000
        : Math.round(metric.value),
    metric_id: metric.id,
    metric_rating: metric.rating,
    metric_navigation_type: metric.navigationType,
  })
}

export default function WebVitalsReporter() {
  useEffect(() => {
    onLCP(send)
    onINP(send)
    onCLS(send)
    onTTFB(send)
    onFCP(send)
  }, [])
  return null
}
