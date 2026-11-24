## Step 1: 要件概要

### 背景・目的

現在の「ザリダス」は React + Vite による SPA（Single Page Application）として構築されている。SEO・初回表示速度・SNSシェア時のOGP対応において SPA の構造的限界に直面しており、Next.js（App Router）への移行により以下を実現する。

| # | 課題 | Next.js による解決 |
|---|------|-------------------|
| 1 | Google クローラーが JS を実行してから解析するため、インデックスに遅延が出る | SSR/SSG でサーバー側で HTML を生成し、即時インデックス可能に |
| 2 | 初回表示が遅い（JS ダウンロード → 実行 → レンダリング） | Server Components で HTML をストリーミング配信、FCP/LCP を大幅改善 |
| 3 | SNS シェア時に投稿ごとのタイトル・画像が表示されない | 動的 OGP（`generateMetadata`）で投稿ごとの og:title, og:image を生成 |
| 4 | サイトマップが静的ファイルで個別投稿を含まない | `sitemap.ts` で全投稿を動的に含むサイトマップを自動生成 |

### スコープ

**対象:**
- React + Vite SPA → Next.js 15 App Router への全面移行
- SSR/SSG/ISR によるレンダリング戦略の最適化
- 動的 OGP・サイトマップ・構造化データの実装
- PWA 機能の Next.js 対応（next-pwa）
- 既存 UI コンポーネント・Tailwind CSS の移植
- 既存 19 フック・3 コンテキストの移植

**対象外（変更しない）:**
- Supabase データベーススキーマ（テーブル・RLS・トリガー）
- Supabase Storage（post-photos バケット）
- Supabase Auth の設定（Google OAuth・メール認証）
- Vercel ホスティング環境
- UIデザイン・カラースキーム

### 前提条件・制約

| 区分 | 内容 |
|------|------|
| 技術 | Next.js 15（App Router）、React 19、Tailwind CSS v4 |
| 技術 | Supabase JS クライアントはサーバー／クライアント両対応が必要（`@supabase/ssr`） |
| 技術 | Leaflet.js はブラウザ依存（`window`）→ `dynamic import` + `ssr: false` 必須 |
| 技術 | TypeScript を全面採用（既存 .jsx → .tsx、既存 .ts はそのまま） |
| 運用 | 移行中も現行 SPA は稼働継続（段階リリース可） |
| 制約 | 既存 URL 構造を維持（`/post/:id`, `/request/:id` 等）、リダイレクト不要 |

---

