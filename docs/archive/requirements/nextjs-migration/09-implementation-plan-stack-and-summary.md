## Step 9: 実装優先度と計画

| Phase | 優先度 | 項目 | 依存関係 | 見積もり | 該当 Migration |
|-------|--------|------|----------|---------|---------------|
| **Phase 1: 基盤** | P1 | Next.js プロジェクトセットアップ | なし | S | M-001 |
| | P1 | Supabase クライアント分離 | M-001 | S | M-002 |
| | P1 | 共通レイアウト・プロバイダー | M-002 | M | M-003 |
| | P1 | 認証フロー（Middleware + Callback） | M-003 | M | M-005 |
| **Phase 2: SEO 重要ページ** | P1 | 投稿詳細ページ（SSR + SEO） | M-003 | M | M-006 |
| | P1 | 動的サイトマップ | M-002 | S | — |
| | P1 | 静的ページ（About 等） | M-003 | S | M-004 |
| **Phase 3: メインページ** | P1 | トップページ（地図 + 一覧） | M-006 | L | M-007 |
| | P2 | 調査依頼ページ | M-006 | S | M-008 |
| | P2 | トレンド・ランキング（ISR） | M-003 | M | M-008 |
| | P2 | プロフィールページ | M-005 | S | M-008 |
| **Phase 4: 認証済みページ** | P2 | ダッシュボード | M-005 | M | M-008 |
| | P2 | 管理者ページ | M-005 | L | M-008 |
| **Phase 5: PWA・最適化** | P3 | PWA 対応（next-pwa） | M-007 | M | M-009 |
| | P3 | パフォーマンス最適化 | 全ページ | M | M-010 |
| | P3 | E2E テスト | 全ページ | M | M-010 |

---

## 技術スタック比較（移行前後）

| 項目 | 現在（Vite SPA） | 移行後（Next.js） |
|------|-----------------|-------------------|
| フレームワーク | React 18 + Vite 5 | **Next.js 15 + React 19** |
| ルーティング | react-router-dom v6 | **App Router（ファイルベース）** |
| レンダリング | CSR のみ | **SSR / SSG / ISR / CSR 混合** |
| SEO | react-helmet-async | **`generateMetadata()` + `sitemap.ts`** |
| Supabase | `@supabase/supabase-js` | **`@supabase/ssr` + `@supabase/supabase-js`** |
| 認証保護 | Context 内で判定 | **Middleware + Cookie ベース** |
| 画像最適化 | 手動（imageUtils.js） | **`next/image` 自動最適化** |
| PWA | vite-plugin-pwa | **next-pwa** |
| i18n | i18next + react-i18next | **i18next 継続**（将来 next-intl 検討） |
| 地図 | Leaflet（直接 import） | **Leaflet（`dynamic` import, `ssr: false`）** |
| スタイリング | Tailwind CSS 3 | **Tailwind CSS v4** |
| 型安全 | 一部 TypeScript | **全面 TypeScript** |
| テスト | Vitest + Testing Library | **Vitest 継続**（将来 Playwright 追加） |

---

## サマリーと次のアクション

### サマリー

本要件定義書では、ザリダスの React + Vite SPA から Next.js 15 App Router への移行に必要な全要件を定義した。移行により以下の改善が期待される：

- **SEO:** 投稿詳細ページが SSR でレンダリングされ、Google 検索に即時インデックス可能に
- **パフォーマンス:** Server Components + ストリーミングで FCP/LCP が 40-60% 改善見込み
- **SNS シェア:** 動的 OGP で投稿ごとのカード表示が実現
- **サイトマップ:** 全承認済み投稿が含まれる動的サイトマップで効率的クロールが可能に

### 次のアクション

1. **本要件定義書のレビュー・承認**
2. **Phase 1（基盤）の実装開始:** Next.js プロジェクト作成 → Supabase 分離 → レイアウト → 認証
3. **Phase 2（SEO 重要ページ）:** 投稿詳細を SSR で実装し、SEO 効果を早期に検証
4. **段階リリース:** Phase 2 完了時点で一度デプロイし、Lighthouse・Search Console で効果測定
