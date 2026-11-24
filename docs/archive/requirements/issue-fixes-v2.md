> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# ザリダス 品質改善要件定義書 v2

> 作成日: 2026-03-22
> 対象: Next.js 15 + React 19 + TypeScript + Supabase + Tailwind CSS + Leaflet
> 課題数: 41件（セキュリティ7件 / パフォーマンス6件 / アクセシビリティ6件 / SEO 7件 / PWA 5件 / コード品質6件 / データ整合性4件）

---

## これは何か

Vite SPA → Next.js 15 App Router 移行後の包括調査で検出した 41 件の品質課題を、Step 1〜9 の形式で要件化した文書（2026-03-22 時点）。長いため Step 単位で分割し、本文は `issue-fixes-v2/` 配下へ逐語で移した。

## 目的・背景の要約

本番稼働中（https://zaridasu.com）のアプリについて、セキュリティ・パフォーマンス・アクセシビリティ・SEO・PWA・コード品質・データ整合性の各面を本番運用水準へ引き上げることが目的。新機能開発・テストカバレッジ拡大・UI リニューアル・Edge Function 新規追加は対象外。既存 124 テスト全パスと後方互換の維持が制約。

## 主要な決定事項（要点）

- 41 件の課題を **29 個の FR（FR-001〜FR-029）** に整理し、US-001〜US-007 の 7 ユーザーストーリーに紐づけた。
- **4 Phase の実装順**を決定: P1 セキュリティ・データ整合性 → P2 パフォーマンス・アクセシビリティ → P3 SEO・PWA → P4 コード品質。TypeScript strict 化は影響範囲が最大のため最後に置く。
- アクセシビリティは **WCAG 2.1 AA 準拠**を基準とする。
- 各 Phase 完了後に `next build` + 全テスト実行 + Vercel デプロイで検証する。
- DB 変更は Migration-001（RLS ポリシー整理）のみ。新規画面は SC-001 エラーページ、改修は SC-002 オフラインページ。

## 分割ファイル

- [01-step-1-overview.md](issue-fixes-v2/01-step-1-overview.md) — Step 1 要件概要（背景・目的／スコープ／前提条件・制約）
- [02-step-2-user-stories-us-001-004.md](issue-fixes-v2/02-step-2-user-stories-us-001-004.md) — Step 2 ユーザーストーリー US-001 セキュリティ〜US-004 SEO
- [03-step-2-user-stories-us-005-007.md](issue-fixes-v2/03-step-2-user-stories-us-005-007.md) — Step 2 ユーザーストーリー US-005 PWA／US-006 コード品質／US-007 データ整合性
- [04-step-3-fr-001-009-security-performance.md](issue-fixes-v2/04-step-3-fr-001-009-security-performance.md) — Step 3 機能要件 FR-001〜FR-009（セキュリティ・パフォーマンス）
- [05-step-3-fr-010-019-a11y-seo.md](issue-fixes-v2/05-step-3-fr-010-019-a11y-seo.md) — FR-010〜FR-019（アクセシビリティ・SEO・Service Worker）
- [06-step-3-fr-020-027-pwa-code-quality.md](issue-fixes-v2/06-step-3-fr-020-027-pwa-code-quality.md) — FR-020〜FR-027（PWA・TypeScript strict・エラーバウンダリ・hooks 修正）
- [07-step-3-fr-028-029-and-step-4-nonfunctional.md](issue-fixes-v2/07-step-3-fr-028-029-and-step-4-nonfunctional.md) — FR-028/029 オフラインキューと Step 4 非機能要件
- [08-step-5-screens-and-step-6-api.md](issue-fixes-v2/08-step-5-screens-and-step-6-api.md) — Step 5 画面仕様（SC-001/SC-002）と Step 6 API 仕様（API-001/API-002）
- [09-step-7-data-model-and-step-8-migration.md](issue-fixes-v2/09-step-7-data-model-and-step-8-migration.md) — Step 7 データモデル・DB 設計と Step 8 マイグレーション計画
- [10-step-9-implementation-plan.md](issue-fixes-v2/10-step-9-implementation-plan.md) — Step 9 実装優先度と計画（Phase 1〜4 の FR 一覧・見積もり）
- [11-summary-and-next-actions.md](issue-fixes-v2/11-summary-and-next-actions.md) — カテゴリ別サマリーと次のアクション
