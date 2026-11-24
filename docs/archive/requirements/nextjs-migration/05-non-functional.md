## Step 4: 非機能要件

### パフォーマンス

| 指標 | 目標値 | 現状（SPA） |
|------|--------|-------------|
| FCP (First Contentful Paint) | ≤ 1.8s | ~3.0s |
| LCP (Largest Contentful Paint) | ≤ 2.5s | ~4.5s |
| CLS (Cumulative Layout Shift) | ≤ 0.1 | ~0.15 |
| TTI (Time to Interactive) | ≤ 3.5s | ~5.0s |
| Lighthouse Performance | ≥ 80 | ~55 |
| JS バンドルサイズ（gzip） | ≤ 300KB（初回ロード） | ~400KB |
| サーバーレスポンス（TTFB） | ≤ 200ms | N/A（SPA） |

### セキュリティ

- 認証: Supabase Auth（JWT）+ Next.js Middleware で保護ルートを制御
- 環境変数: `NEXT_PUBLIC_` プレフィックスのみクライアント公開、`SUPABASE_SERVICE_ROLE_KEY` はサーバーのみ
- CSRF: Next.js Server Actions で自動保護
- XSS: React のエスケープ + CSP ヘッダー設定
- RLS: 既存の Supabase RLS ポリシーをそのまま継続

### 可用性・信頼性

- Vercel Edge Network による CDN 配信
- ISR によるスタティック HTML のキャッシュ
- Service Worker によるオフラインフォールバック
- エラーバウンダリ（`error.tsx`）による部分的障害の隔離

### アクセシビリティ

- WCAG 2.1 AA 準拠を維持
- セマンティック HTML（Server Components で改善）
- キーボードナビゲーション対応
- スクリーンリーダー対応（ARIA ラベル）

### レスポンシブ対応

- モバイルファースト設計を維持
- ブレークポイント: sm(640px), md(768px), lg(1024px), xl(1280px)
- Tailwind CSS のレスポンシブクラスをそのまま移植

---

