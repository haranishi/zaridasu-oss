# REQ-012: テストカバレッジの拡充

## これは何か

カスタムフック・ライブラリ・ユーティリティ・管理画面ビューのテスト不足を、重要度順の 3 フェーズで埋める要件。全文は同名ディレクトリの部品ファイルへ逐語で分割してある（入口のみ新規要約）。

## 目的・背景の要約

19 個のフック中 6 個、14 個の lib モジュール中 2 個、4 個の utils モジュール中 2 個しかテストが存在せず、管理画面ビュー（8 ファイル）にはテストがゼロ。重要度の高いモジュールから優先的にテストを追加し、コアロジックのリグレッション検知能力を確保する。

## 主要な決定事項の要点

- Phase 1（Critical）は `useOfflineQueue` / `offlineStore` / `imageProcessor` / `useAdminStats` の 4 本。オフラインキュー・画像処理・統計集計はバグが発覚しにくく本番不具合へ直結するため最優先。
- Phase 2（High）は `useLike` / `rpcThrottle` / `auditLog` と、`AdminPostsPage` / `AdminDashboard` の統合テスト。Phase 3（Medium）は `useFocusTrap` / `usePostDraft` / `useSurveyRequests` / `geocodeCache` / `municipalityLabel`。
- テストは Jest + React Testing Library で記述し、Supabase クエリは `jest.mock` で外部依存なしに実行できるようにする。IndexedDB は fake-indexeddb を使う。
- 数値目標は Phase 1 完了で hooks 50% 以上、Phase 2 完了で lib 30% 以上。CI で自動実行する。
- 緊急度 High / 重要度 Critical。REQ-009（分割）・REQ-010（最適化）・REQ-011（依存修正）を安全に進めるための前提として最優先で対応する。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-current-coverage-gaps.md](REQ-012-test-coverage/01-current-coverage-gaps.md) | 背景と現状の問題。hooks / lib / utils / 管理画面ビューごとのファイル別テスト有無・行数・重要度の一覧表 |
| [02-goal-and-requirements.md](REQ-012-test-coverage/02-goal-and-requirements.md) | 目的、機能要件 FR-012-01〜14（Phase 1 Critical / Phase 2 High / Phase 3 Medium）、非機能要件 NFR-012-01〜05 |
| [03-acceptance-impact-and-priority.md](REQ-012-test-coverage/03-acceptance-impact-and-priority.md) | 受入条件 AC-01〜05、影響範囲、優先度の判断 |
