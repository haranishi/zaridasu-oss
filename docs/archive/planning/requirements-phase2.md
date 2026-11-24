> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# ザリガニダス 要件定義書 Phase 2

> 対象: REQ-005（テストカバレッジ拡大）/ REQ-006（TypeScript 導入）/ REQ-008（写真アップロード失敗処理）
> 作成日: 2026-03-14

---

## これは何か

2026-03-14 時点の Phase 2 要件定義書。長いため見出し境界で分割し、本文は `requirements-phase2/` 配下へ逐語で移した。この入口ファイルは目次と要点のみを持つ。

## 目的・背景の要約

Phase 1 完了後の品質改善フェーズとして、3 つの要件をまとめて定義したもの。写真アップロードの整合性（REQ-008）、テスト基盤の拡充（REQ-005）、型安全性の確保（REQ-006）が対象。

## 主要な決定事項（要点）

- **REQ-008**: `Promise.all` の並列アップロードを `for...of` の逐次実行に変更し、失敗時は成功済みファイルを Storage から削除（ロールバック）する。進捗表示と「3枚中2枚成功」形式のエラーメッセージを追加。
- **REQ-005**: hooks・PostForm バリデーション・認証フロー・エラーハンドリングの順で優先度を付け、`src/test/mocks/` に supabase / auth / localStorage のモックを用意する。カバレッジ目標と 2 週間のスケジュールを設定。
- **REQ-006**: TypeScript を 4 フェーズ（環境構築 → 型定義 → lib/hooks → コンポーネント）で段階導入。Supabase の型はスキーマから自動生成し、`strict: true` は最終フェーズで有効化。CI に型チェックを組み込む。

## 目次

- [REQ-008: 複数写真アップロード途中失敗処理](#req-008-複数写真アップロード途中失敗処理)
- [REQ-005: テストカバレッジ拡大](#req-005-テストカバレッジ拡大)
- [REQ-006: TypeScript 導入](#req-006-typescript-導入)

---

## 分割ファイル

### REQ-008: 複数写真アップロード途中失敗処理

- [01-req-008-overview.md](requirements-phase2/01-req-008-overview.md) — 現状の課題（orphan ファイル発生）とユーザーストーリー・受け入れ条件
- [02-req-008-functional-requirements.md](requirements-phase2/02-req-008-functional-requirements.md) — 機能要件 F1〜F5（逐次化・ロールバック・進捗・エラーメッセージ・切断時の即時失敗）
- [03-req-008-nonfunctional-and-design.md](requirements-phase2/03-req-008-nonfunctional-and-design.md) — 非機能要件と実装設計（`usePostForm.js` の変更箇所）
- [04-req-008-postform-and-tests.md](requirements-phase2/04-req-008-postform-and-tests.md) — `PostForm.jsx` の変更箇所とテストケース

### REQ-005: テストカバレッジ拡大

- [05-req-005-overview.md](requirements-phase2/05-req-005-overview.md) — 現状の課題・ユーザーストーリー・機能要件の入口
- [06-req-005-hooks-tests.md](requirements-phase2/06-req-005-hooks-tests.md) — 優先度 高: hooks のテスト（週1）
- [07-req-005-other-tests.md](requirements-phase2/07-req-005-other-tests.md) — PostForm バリデーション／認証フロー／エラーハンドリング／CI 設定
- [08-req-005-mocks-and-coverage.md](requirements-phase2/08-req-005-mocks-and-coverage.md) — モック設計（supabase / auth / localStorage）・カバレッジ目標・実装スケジュール

### REQ-006: TypeScript 導入

- [09-req-006-overview-and-f1.md](requirements-phase2/09-req-006-overview-and-f1.md) — 現状の課題・ユーザーストーリー・F1 TypeScript 環境構築
- [10-req-006-f2-supabase-types.md](requirements-phase2/10-req-006-f2-supabase-types.md) — F2 Supabase 型定義の自動生成
- [11-req-006-f3-f4-types-and-lib.md](requirements-phase2/11-req-006-f3-f4-types-and-lib.md) — F3 共通型の定義／F4 `lib/` の .ts 変換
- [12-req-006-f5-hooks.md](requirements-phase2/12-req-006-f5-hooks.md) — F5 hooks の .ts 変換
- [13-req-006-f6-and-migration-strategy.md](requirements-phase2/13-req-006-f6-and-migration-strategy.md) — F6 コンポーネントの .tsx 変換と移行戦略（4フェーズ）
- [14-req-006-strict-ci-nonfunctional.md](requirements-phase2/14-req-006-strict-ci-nonfunctional.md) — `strict: true` 移行時の注意点・CI への組み込み・非機能要件

### 全体

- [15-implementation-order.md](requirements-phase2/15-implementation-order.md) — 3 要件の実装順序の推奨
