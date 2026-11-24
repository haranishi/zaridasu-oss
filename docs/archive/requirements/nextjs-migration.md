> ⚠️ **アーカイブ（2026-07-18 / REQ-282）**: Next.js 移行は完了済み（現行スタックは README 参照）。

# ザリダス Next.js 移行 要件定義書

**作成日:** 2026-03-21
**バージョン:** 1.0
**対象プロジェクト:** ザリダス（秋田県外来生物情報マップ）

---

## これは何か

React + Vite の SPA だったザリダスを Next.js 15（App Router）へ全面移行するために書かれた要件定義書。
US-001〜006／FR-001〜010／SC-001〜004／API-001〜003 と 5 フェーズの実装計画を定義している。
本文が長いため以下の部品ファイルへ逐語で分割し、このファイルは入口（索引）とした。

## 目的・背景の要約

SPA では ①クローラーが JS 実行後に解析するためインデックスが遅れる ②初回表示が遅い
③SNS シェア時に投稿ごとのタイトル・画像が出ない ④サイトマップが静的で個別投稿を含まない、
という構造的限界があった。SSR/SSG/ISR、`generateMetadata`、`sitemap.ts` でこれらを解決するのが移行の狙い。

## 主要な決定事項の要点

- **対象**：Vite SPA → Next.js 15 App Router への全面移行、レンダリング戦略の最適化、
  動的 OGP・サイトマップ・構造化データ、next-pwa、既存 UI/Tailwind と 19 フック・3 コンテキストの移植。
- **対象外（変更しない）**：Supabase の DB スキーマ・Storage・Auth 設定、Vercel ホスティング、UI デザイン。
- **主要な技術判断**：ルーティングは App Router、認証は Middleware + Cookie ベース（`@supabase/ssr`）、
  Leaflet は `dynamic` import（`ssr: false`）、画像は `next/image`、Tailwind は v4、全面 TypeScript 化。
  i18n は i18next を継続（将来 next-intl 検討）、テストは Vitest 継続（将来 Playwright 追加）。
- **段階リリース**：Phase 1 基盤 → Phase 2 SEO 重要ページ（投稿詳細を SSR 化して効果を早期検証）→
  Phase 3 メインページ → Phase 4 認証済みページ → Phase 5 PWA・最適化。
- **期待効果**：投稿詳細の即時インデックス、FCP/LCP 40〜60% 改善見込み、投稿ごとの OGP カード、
  全承認済み投稿を含む動的サイトマップ。

## 目次（部品ファイル）

| ファイル | 内容 |
|---|---|
| [01-overview-scope.md](nextjs-migration/01-overview-scope.md) | Step 1 要件概要：背景・目的（SPA の 4 課題と解決策）、スコープ、前提条件・制約 |
| [02-user-stories.md](nextjs-migration/02-user-stories.md) | Step 2 ユーザーストーリー US-001〜US-006（SEO、動的 OGP、初回表示高速化、サイトマップ、機能移植、多言語 SEO） |
| [03-fr-routing-rendering-supabase.md](nextjs-migration/03-fr-routing-rendering-supabase.md) | Step 3 冒頭と FR-001 App Router ルーティング、FR-002 レンダリング戦略、FR-003 Supabase サーバー/クライアント分離 |
| [04-fr-metadata-auth-map-pwa-i18n-image.md](nextjs-migration/04-fr-metadata-auth-map-pwa-i18n-image.md) | FR-004 動的メタデータ 〜 FR-010 画像最適化（サイトマップ、認証ミドルウェア、Leaflet 動的 import、PWA、i18n） |
| [05-non-functional.md](nextjs-migration/05-non-functional.md) | Step 4 非機能要件：パフォーマンス、セキュリティ、可用性・信頼性、アクセシビリティ、レスポンシブ |
| [06-screen-specs-top-and-post.md](nextjs-migration/06-screen-specs-top-and-post.md) | Step 5 画面仕様 SC-001 トップページ、SC-002 投稿詳細ページ |
| [07-screen-specs-dashboard-admin-and-api.md](nextjs-migration/07-screen-specs-dashboard-admin-and-api.md) | SC-003 ダッシュボード、SC-004 管理者ページ、Step 6 API 仕様 API-001〜003 |
| [08-data-model-and-migration-plan.md](nextjs-migration/08-data-model-and-migration-plan.md) | Step 7 データモデル・DB 設計（既存スキーマ維持）、Step 8 マイグレーション計画（DB／コード移行 M-001〜） |
| [09-implementation-plan-stack-and-summary.md](nextjs-migration/09-implementation-plan-stack-and-summary.md) | Step 9 実装優先度と計画（Phase 1〜5）、技術スタック比較（移行前後）、サマリーと次のアクション |
