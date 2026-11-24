> ⚠️ **アーカイブ（2026-07-18 / REQ-282）**: Next.js 移行は完了済み。残課題はその後の REQ 群で消化された。

# ザリダス Next.js 移行 - 残作業要件定義書

**作成日:** 2026-03-21
**現在の進捗:** 約70% 完了（ビルド成功・全ページ動作確認済み）

---

## これは何か

Vite SPA → Next.js App Router 移行が約 70% 完了した時点（2026-03-21）で、残作業を Phase A〜D に整理した要件定義書。長いため Phase 境界で分割し、本文は `nextjs-migration-remaining/` 配下へ逐語で移した。

## 目的・背景の要約

App Router のルーティング（全 23 ルート）・レンダリング戦略・SEO・Supabase クライアント分離・認証ミドルウェア・Leaflet 動的インポートまでは完了済み。残るのは TypeScript 全面移行（85 JSX + 28 JS）、Vite 旧コード削除、ESLint Warning（200+ の未使用 import）解消、PWA の next-pwa 移行、react-router-dom に依存したテスト 6 ファイルの修正で、これらを Phase 分けして片付けるのが本書の目的。

## 主要な決定事項（要点）

- **Phase A クリーンアップが最優先**（他 Phase に依存なし）。Vite 旧コード（`App.jsx` / `main.jsx` / `vite.config.js` / `index.html`）削除 → ESLint 修正 → ビルド確認の順で即時実行する。
- **Phase B TypeScript 移行は Phase A 完了後**。B-1 Context → B-2 hooks → B-3 lib/utils の基盤から始め、B-4〜B-10 のコンポーネント、最後に B-11 ビューへ進む段階実行。
- TypeScript の `strict` は**まず `false` で移行し、後から `true`** にする段階方針。型は既存の `src/types/index.ts` と `database.types.ts` を活用する。
- **Phase C（テスト修正）は Phase B 完了後、Phase D（PWA）は Phase A 完了後で B と並行可**。工数は A: S / B: XL / C: M / D: M。

## 分割ファイル

- [01-current-status-and-phase-a.md](nextjs-migration-remaining/01-current-status-and-phase-a.md) — 現状サマリー（完了/未完了の一覧）と Phase A クリーンアップ（目的・構成図・対象ファイル一覧）
- [02-phase-b-typescript-b1-b5.md](nextjs-migration-remaining/02-phase-b-typescript-b1-b5.md) — Phase B の目的と構成図 前半（B-1 Context〜B-5 UI コンポーネント）
- [03-phase-b-typescript-b6-b11.md](nextjs-migration-remaining/03-phase-b-typescript-b6-b11.md) — Phase B 構成図 後半（B-6 投稿系〜B-11 ビュー）と移行方針
- [04-phase-c-tests-and-phase-d-pwa.md](nextjs-migration-remaining/04-phase-c-tests-and-phase-d-pwa.md) — Phase C テスト修正と Phase D PWA 対応の構成図
- [05-priority-and-next-actions.md](nextjs-migration-remaining/05-priority-and-next-actions.md) — 実行優先度と依存関係（Phase 間の順序・工数表）、次のアクション
