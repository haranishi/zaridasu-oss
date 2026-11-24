> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# ザリダス 品質改善要件定義書 v3

**プロジェクト:** ザリダス（秋田県外来生物情報マップ）
**作成日:** 2026-03-23
**技術スタック:** Next.js 15 + React 19 + TypeScript + Supabase + Tailwind CSS + Leaflet
**ステータス:** ドラフト

---

## これは何か

v2 品質改善（TypeScript strict 化・CSP ヘッダー・RLS 統合・AbortController 導入）の次段として、
2026-03-23 時点で残存していた品質課題 38 件を洗い出し、FR-001〜FR-037 として定義した要件定義書。
本文が長いため、以下の部品ファイルへ逐語で分割し、このファイルは入口（索引）とした。

## 目的・背景の要約

セキュリティ・パフォーマンス・アクセシビリティ・PWA・コード品質・データ整合性・UX・インフラの
8 領域に未解決課題が残っていた。とくに CSP の `unsafe-inline`/`unsafe-eval` 許可による XSS 耐性不足、
RPC のキャンセル不可とキャッシュ無制限増加によるメモリリーク、PostForm のフォーカストラップ未実装、
Service Worker のキャッシュバージョニング不在、オフラインキューの競合状態が主要な問題だった。

## 主要な決定事項の要点

- **対象 38 件 / FR 37 件**：セキュリティ 5・パフォーマンス 6・アクセシビリティ 5・SEO 1・PWA 4・
  コード品質 6・データ整合性 4・UX/UI 4・インフラ 3。
- **対象外**：新機能開発（プッシュ通知・リアルタイム更新等）、UI デザインの大幅変更、
  テストカバレッジの大規模拡張、Edge Functions 新規作成、モバイルネイティブアプリ。
- **制約**：既存 124 テスト全パス、Vercel デプロイ互換、後方互換性、ダウンタイムなしのマイグレーション。
- **実装順序は 4 フェーズ**：Phase 1 セキュリティ・データ整合性（P1）→ Phase 2 パフォーマンス・
  アクセシビリティ（P1-P2）→ Phase 3 UX・コード品質（P2-P3）→ Phase 4 PWA・インフラ（P2-P3）。
- **DB 変更は 2 本**：posts テーブルへの CHECK 制約追加（Migration-001）と外部キー CASCADE 変更（Migration-002）。

## 目次（部品ファイル）

| ファイル | 内容 |
|---|---|
| [01-overview-scope.md](quality-improvement-v3/01-overview-scope.md) | Step 1 要件概要：背景・目的、スコープ（対象 38 件／対象外）、前提条件・制約 |
| [02-user-stories-1.md](quality-improvement-v3/02-user-stories-1.md) | Step 2 ユーザーストーリー US-001 セキュリティ強化 〜 US-004 PWA 強化 |
| [03-user-stories-2.md](quality-improvement-v3/03-user-stories-2.md) | Step 2 ユーザーストーリー US-005 コード品質 〜 US-008 インフラ整備 |
| [04-fr-security.md](quality-improvement-v3/04-fr-security.md) | Step 3 機能要件の冒頭と FR-001〜FR-005（CSP nonce・CHECK 制約・ミドルウェア・スロットリング・バリデーション共通化） |
| [05-fr-performance.md](quality-improvement-v3/05-fr-performance.md) | FR-006〜FR-011：RPC キャンセル、キャッシュ掃除、キュー制限、LRU、スケルトン、ロールバックタイムアウト |
| [06-fr-accessibility-seo.md](quality-improvement-v3/06-fr-accessibility-seo.md) | FR-012〜FR-017：フォーカストラップ、alt 生成、aria-atomic、label、aria-label、OG 画像検証 |
| [07-fr-pwa.md](quality-improvement-v3/07-fr-pwa.md) | FR-018〜FR-021：SW キャッシュバージョニング、マニフェスト拡充、エラー種別判定、Background Sync |
| [08-fr-code-quality.md](quality-improvement-v3/08-fr-code-quality.md) | FR-022〜FR-027：relatedPosts 型修正、ESLint コメント、エラーバウンダリ、スケルトン、Zod、エラーハンドリング統一 |
| [09-fr-data-integrity-ux.md](quality-improvement-v3/09-fr-data-integrity-ux.md) | FR-028〜FR-034：オフラインキュー排他制御・バリデーション、楽観的更新、空状態、天気エラー、タイムアウト、削除確認 |
| [10-fr-infra.md](quality-improvement-v3/10-fr-infra.md) | FR-035〜FR-037：環境変数ビルド時検証、Sentry 統合、外部キー CASCADE 修正 |
| [11-non-functional.md](quality-improvement-v3/11-non-functional.md) | Step 4 非機能要件：パフォーマンス、セキュリティ、可用性・信頼性、アクセシビリティ、レスポンシブ |
| [12-screen-specs.md](quality-improvement-v3/12-screen-specs.md) | Step 5 画面仕様 SC-001〜SC-003（ホーム、投稿フォーム、管理画面エラーバウンダリ） |
| [13-api-and-data-model.md](quality-improvement-v3/13-api-and-data-model.md) | Step 6 API 仕様（API-001/002）と Step 7 データモデル・DB 設計（posts 変更、外部キー、ER 図） |
| [14-migration-plan.md](quality-improvement-v3/14-migration-plan.md) | Step 8 マイグレーション計画：Migration-001 CHECK 制約、Migration-002 CASCADE 変更 |
| [15-implementation-plan.md](quality-improvement-v3/15-implementation-plan.md) | Step 9 実装優先度と計画（Phase 1〜4）、カテゴリ別サマリー、次のアクション |
