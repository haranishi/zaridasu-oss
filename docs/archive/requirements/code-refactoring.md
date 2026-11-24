> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# コード整理・リファクタリング 要件定義書

## これは何か

肥大化したファイル・`any` 型・重複コードを解消するためのリファクタリング要件定義書。
US-001〜004、FR-001〜FR-006、対象ファイル一覧、優先度 P1〜P3 の実装計画を定義している。
本文が長いため以下の部品ファイルへ逐語で分割し、このファイルは入口（索引）とした。

## 目的・背景の要約

コードベースの成長にともない最大 965 行のファイルが生まれ、型安全性の欠如とコード重複が発生していた。
具体的には ①`Record<string, any>` / `: any` の多用 ②400 行超のファイルが 10 個 ③フォーカストラップ・
天気アイコン・日付ロケールの重複 ④`@/` エイリアスと相対パスの混在 ⑤管理画面のハードコード日本語
⑥`themeClasses` ヘルパーの不統一、の 6 点が課題。影響範囲が読みにくく開発効率が落ちていた。

## 主要な決定事項の要点

- **対象**：型定義整備と `any` 排除、400 行超ファイルの分割、重複コードの共通化、
  インポートパスの `@/` 統一、定数ファイル分割、テーマクラスヘルパーの統一適用。
- **対象外**：機能追加・UI 変更、DB スキーマ／マイグレーション変更、テスト追加、管理画面の i18n 対応、
  パフォーマンス最適化（いずれも別タスク）。
- **大前提**：既存の動作・UI を変更しない（リファクタリングのみ）。Next.js 15 App Router + React 19 の
  アーキテクチャと Supabase クライアントの呼び出しパターンを維持し、ビルドと既存テストが通ること。
- **優先度**：P1 = FR-001 型定義 → FR-003 重複共通化 → FR-002a AdminPostsPage(965 行)/FR-002b PostForm(733 行) 分割。
  P2 = DetailPage・MapView・AuthModal の分割と定数ファイル分割。P3 = インポートパス統一とテーマヘルパー統一。
- **検証方法**：各ステップ後に `next build` + `tsc --noEmit` で動作確認。P2・P3 は既存開発と並行可能。

## 目次（部品ファイル）

| ファイル | 内容 |
|---|---|
| [01-overview-scope-and-user-stories.md](code-refactoring/01-overview-scope-and-user-stories.md) | 要件概要（背景・目的、スコープ、前提条件・制約）とユーザーストーリー US-001〜US-004 |
| [02-fr-001-002-types-and-file-split.md](code-refactoring/02-fr-001-002-types-and-file-split.md) | 機能要件の冒頭、FR-001 Post 型定義の整備、FR-002 大規模ファイルの分割 |
| [03-fr-003-006-dedupe-imports-constants-theme.md](code-refactoring/03-fr-003-006-dedupe-imports-constants-theme.md) | FR-003 重複コードの共通化、FR-004 インポートパス統一、FR-005 定数ファイル分割、FR-006 テーマクラスヘルパー統一 |
| [04-non-functional-and-other-specs.md](code-refactoring/04-non-functional-and-other-specs.md) | 非機能要件（パフォーマンス・保守性・互換性）と画面仕様／API 仕様／データモデル・DB 設計／マイグレーション計画 |
| [05-implementation-plan-files-and-summary.md](code-refactoring/05-implementation-plan-files-and-summary.md) | 実装計画（P1〜P3）、対象ファイル一覧（行数・問題・対応 FR）、サマリー（課題の全体像・期待効果・次のアクション） |
