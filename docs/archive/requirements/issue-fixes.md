> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# ザリダス 課題修正 要件定義書

> 作成日: 2026-03-22
> バージョン: 1.0
> 対象: 18件の課題（セキュリティ / ビルド・テスト / パフォーマンス / アクセシビリティ / エラーハンドリング / Git管理）

---

## これは何か

Vite SPA → Next.js 15 App Router 移行の途中で蓄積した 18 件の課題を一括解消するための要件定義書（2026-03-22 / v1.0）。長いためセクション境界で分割し、本文は `issue-fixes/` 配下へ逐語で移した。

## 目的・背景の要約

移行作業と並行して溜まった技術的負債・セキュリティ課題・品質課題をまとめて片付けることが目的。主な課題は、API キーの git 履歴露出、Admin 権限のサーバーサイド検証不足、`vitest.config.ts` のプラグイン不整合によるビルド不能、テスト 19 件失敗・TypeScript エラー 9 件、メモリリーク、アクセシビリティとエラーハンドリングの欠如、未コミットの移行ファイル群。

## 主要な決定事項（要点）

- 課題を FR-001〜FR-018 に整理し、US-001〜US-006（セキュリティ／ビルド・テスト／パフォーマンス／アクセシビリティ／エラーハンドリング／Git 管理）に対応づけた。
- 実行順序は 4 Phase 固定: **Phase 1 ビルド復旧（FR-005 → FR-018 → FR-008 → FR-007 → FR-006）→ Phase 2 セキュリティ（FR-001〜003）→ Phase 3 パフォーマンス + a11y + エラー（FR-009〜016、並行可）→ Phase 4 Git 整理（FR-017）**。ビルドが通らないと他の修正を検証できないため、ビルド復旧が最優先（P0）。
- 各 Phase 完了後に `next build` + `vitest run` + `tsc --noEmit` で回帰確認する。
- FR-001 の API キーローテーションはユーザーが Supabase Console で手動実施する（自動化しない）。

## 分割ファイル

- [01-overview.md](issue-fixes/01-overview.md) — 要件概要（背景・目的／スコープ／前提条件・制約）
- [02-user-stories.md](issue-fixes/02-user-stories.md) — US-001 セキュリティ基盤〜US-006 Git 管理の正常化
- [03-fr-001-008-security-and-build.md](issue-fixes/03-fr-001-008-security-and-build.md) — FR-001〜FR-008（環境変数・Admin 権限・GA ID・i18n・vitest 設定・テスト・TS・ESLint）
- [04-fr-009-018-performance-a11y-error-git.md](issue-fixes/04-fr-009-018-performance-a11y-error-git.md) — FR-009〜FR-018（メモリリーク・無限スクロール上限・alt 属性・フォーカス管理・各種エラー UX・JSX→TSX コミット・Vite 残存物除去）
- [05-nonfunctional-and-implementation-plan.md](issue-fixes/05-nonfunctional-and-implementation-plan.md) — 非機能要件、実装計画（優先度表）、実行順序、次のアクション
