## 4. 非機能要件

### パフォーマンス（KPI / SLO）

| 指標 | 現状（推定） | 目標 | 計測方法 |
|---|---|---|---|
| LCP（モバイル / `/`） | ~3.0s | **≤ 2.5s** | Lighthouse mobile + 本番 web-vitals |
| INP（モバイル / `/`） | TBD | **≤ 200ms** | 本番 web-vitals |
| CLS（モバイル / `/`） | TBD | **≤ 0.1** | Lighthouse + web-vitals |
| TTFB（モバイル / `/`） | TBD | **≤ 600ms** | web-vitals（Vercel Edge） |
| First Load JS（`/`） | ~232KB | **≤ 200KB gzip** | size-limit |
| First Load JS（`/admin/posts`） | ~243KB | **≤ 220KB gzip** | size-limit |
| Lighthouse Performance（`/`, モバイル） | ~80 | **≥ 85** | lhci（mobile preset） |
| Lighthouse Performance（`/`, デスクトップ） | TBD | **≥ 95** | lhci |
| Supabase 列単位の egress（投稿一覧 1 ページ） | 全列 | **必要列のみ** | クエリレビュー |

### セキュリティ
- 既存 RLS / CSP を弱めない（`'unsafe-inline'` の解消は別 REQ で扱う）。
- next/image の Supabase remotePatterns は `pathname: '/storage/v1/object/public/**'` のまま（拡張しない）。
- 集約 RPC は `SECURITY INVOKER` で実装し RLS を尊重（REQ-032）。

### 可用性・信頼性
- 動的 import で chunk が落ちた場合、再読込ボタン付き fallback を提供。
- Lighthouse / size-limit は CI で blocking ではなく **warn → 段階的に error** に格上げ。

### アクセシビリティ
- 既存の WCAG 2.1 AA 適合（REQ-013, REQ-031, REQ-056）を **回帰させない**。
- 画像最適化時 `alt` を空文字にしない（REQ-022 AC）。

### レスポンシブ
- 既存ブレークポイント（モバイル < 768px / タブレット < 1024px / PC）を踏襲。
- モバイル LCP / INP を最優先 KPI に置く。

---
