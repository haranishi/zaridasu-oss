> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# 要件定義: QA-001 E2Eテスト（Playwright）

- **ID**: QA-001
- **優先度**: 🔴 高（重要フローの品質保証）
- **使用ツール**: Playwright（Microsoft 製、無料 OSS）
- **作成日**: 2026-03-20

---

## これは何か

Playwright による E2E テスト導入を 2026-03-20 に検討した当時の要件定義。分量が多いため本ファイルを入口とし、本文は同名ディレクトリ配下の部品に逐語で分割している。

## 目的・背景

当時は Vitest + React Testing Library のユニット/コンポーネントテスト（11ファイル）しかなく、投稿→承認→地図表示のようなフロー全体を通した検証がなかった。ブラウザ固有の挙動（Leaflet の地図描画、EXIF 読み取り、Service Worker）とレスポンシブ表示も手動確認に依存しており、デプロイ前にリグレッションを自動検知する仕組みが存在しなかった。それを Playwright で埋めるのがこの文書の狙い。

## 主要な決定事項（要点）

- ツールは Playwright（無料 OSS）。テスト対象フローを P1（クリティカルパス5本）／P2（重要フロー5本）／P3（エッジケース5本）に優先度分けする。
- テストは本番とは別の**テスト用 Supabase プロジェクト**に対して実行し、`global-setup.ts` で一般/管理者のテストユーザーを作る。
- ブラウザは Chromium（デスクトップ1280x720・モバイル375x812）と WebKit（375x812）。Firefox は CI 時間短縮のため将来対応。
- CI は GitHub Actions の `playwright.yml` で `main` への PR 時に自動実行し、HTML レポートをアーティファクト保存する。
- 非機能目標は P1 全体で 2 分以内、Flaky rate 5% 以下（CI のみ `retries: 1`）。

## 部品

- [01-issues-and-user-stories.md](requirements-e2e-testing/01-issues-and-user-stories.md) — 当時の課題5点と、開発者・管理者のユーザーストーリー。
- [02-target-flows.md](requirements-e2e-testing/02-target-flows.md) — F1: テスト対象フロー15シナリオ（P1/P2/P3の一覧表）。
- [03-test-environment-and-data.md](requirements-e2e-testing/03-test-environment-and-data.md) — F2 ディレクトリ構成、F3 テストデータ戦略、F4 ブラウザ・デバイスマトリクス。
- [04-ci-integration.md](requirements-e2e-testing/04-ci-integration.md) — F5: GitHub Actions への統合（`playwright.yml` の全文）。
- [05-nonfunctional-and-implementation.md](requirements-e2e-testing/05-nonfunctional-and-implementation.md) — 非機能要件の表と、新規/変更ファイルの実装設計。
- [06-prep-and-test-perspectives.md](requirements-e2e-testing/06-prep-and-test-perspectives.md) — 実装前の準備作業（コード不要）とメタテストの観点。
- [07-user-flow.md](requirements-e2e-testing/07-user-flow.md) — P1 テスト対象の画面遷移・ユーザーフロー図。
