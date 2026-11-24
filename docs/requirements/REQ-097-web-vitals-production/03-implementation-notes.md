## 実装メモ

### コード例（`src/components/common/WebVitalsReporter.tsx`）
```tsx
'use client'

import { useEffect } from 'react'
import { onLCP, onINP, onCLS, onTTFB, onFCP, type Metric } from 'web-vitals'

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>
  }
}

function send(metric: Metric) {
  if (typeof window === 'undefined') return
  if (process.env.NODE_ENV !== 'production') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({
    event: 'web_vital',
    metric_name: metric.name,
    metric_value: metric.name === 'CLS'
      ? Math.round(metric.value * 10000) / 10000
      : Math.round(metric.value),
    metric_id: metric.id,
    metric_rating: metric.rating,
  })
}

export function WebVitalsReporter() {
  useEffect(() => {
    onLCP(send)
    onINP(send)
    onCLS(send)
    onTTFB(send)
    onFCP(send)
  }, [])
  return null
}
```

### GA4 側の集計
- 「探索レポート」→ カスタムディメンション `metric_name`, `metric_rating` を作成
- パーセンタイル（P75）で LCP / INP / CLS を可視化
- Search Console の Core Web Vitals レポートと突き合わせて実機値を比較

### CSP（注意）
`window.dataLayer.push` 経由なので CSP の `script-src` に追加変更は不要（既存の GTM 設定で完結）。
