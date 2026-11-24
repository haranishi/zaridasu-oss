## 1. 要件概要

### 背景・目的
- **背景**：ザリダスは Next.js 15 App Router + React 19 + Supabase SSR 構成で、市民参加型の地図アプリ。モバイル比率が高く、Leaflet を中心に依存ライブラリが重い（leaflet 一式で 100KB+）。
- **症状**：
  - HomePage（`/`）が **全部 Client Component**（`src/app/(home)/HomePageClient.tsx` が `'use client'` の re-export、`src/views/HomePage.tsx` も `'use client'`）。RSC を全く活かせていない。
  - First Load JS が `/` で約 **232KB**、`/admin/posts` で約 **243KB**（REQ-062 計測値）。モバイル 4G では LCP 悪化要因。
  - `leaflet.heat` がサイドエフェクト import で常時バンドル（REQ-026）。
  - 投稿一覧は生 `<img>` で配信、`toThumbnailUrl()` 実装済みなのに未使用（REQ-022）。
  - useStats が 6–7 個並列クエリ + 全件 2000 行 fetch → クライアント集計（REQ-032）。
  - 重い依存（exifr / i18next / date-fns v2 / fix-webm-duration / lucide-react）が tree-shaking 不十分。
  - `next.config.ts` に `images.formats` / `experimental.optimizePackageImports` などの最適化フラグ未設定。
- **目的**：初回ロード時間短縮、バンドル削減、Core Web Vitals 改善、Supabase 通信量削減により **モバイルでの体感速度を底上げ** する。

### スコープ
**対象**：
- 全公開ルート（`/`, `/trends`, `/area/[municipality]`, `/dashboard`, `/post/[id]`, `/requests`, `/about` 等）の First Load JS 削減
- 画像配信（Supabase Storage 起点）の next/image 化と AVIF/WebP 化
- フォント（next/font/google Inter）のサブセット最適化
- Supabase クエリの列指定 / 集約 RPC 化 / N+1 解消
- Server / Client Component 境界の見直し
- Next.js キャッシュ戦略（fetch cache / revalidate / ISR / Route Segment Config）
- 依存パッケージの棚卸し（重いライブラリの dynamic import / 代替）
- Core Web Vitals 計測の本番継続化（web-vitals → GA4）

**対象外**：
- Supabase インフラのアップグレード（プラン変更）
- CDN（Vercel Edge）以外への移行
- 完全な i18next 削除（運用継続）
- React Server Actions への全面置換（後続検討）

### 前提条件・制約
- **技術スタック**（変更不可）：Next.js 15 App Router / React 19 / TypeScript 5.9 / Supabase（PostgreSQL/Auth/Storage/Edge Functions）/ Tailwind 3 / Vercel
- **既存 REQ との整合**：REQ-010, REQ-022, REQ-026, REQ-032, REQ-041, REQ-062 の方針と矛盾しないこと。本書はそれらの上位ロードマップ。
- **Supabase Storage**：画像は public bucket に配置済み（`*.supabase.co/storage/v1/object/public/**`）。next/image remotePatterns 設定済み。
- **CSP 制約**：`script-src` に `'unsafe-inline'` あり（Next.js 制約）。CSP を一段厳しくする変更は本 REQ ではしない。
- **PWA**：`public/sw.js` 自前管理。Service Worker で奇妙なキャッシュをすると本最適化の効果が見えなくなるため、検証時は SW を必ず unregister する。

---
