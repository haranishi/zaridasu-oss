# REQ-075: Phase 0 — AI 判定評価基盤の整備

> **親要件**: REQ-074
> **位置づけ**: Phase 0 / **全 Phase の前提依存**（評価基盤無しに後続 Phase の精度影響を判定できない）
> **作成日**: 2026-04-22
> **ステータス**: TODO

---

## 要件概要

### 背景・目的
現状、`analyze-audio` / `analyze-image` Edge Function の **判定精度を計測する手段が存在しない**。本番投稿の手動 review 結果と AI 結果の突き合わせは可能だが、施策ごとの A/B 評価には不向き。

本要件は **ラベル付き評価データセット**、**自動評価スクリプト**、**API コスト可視化** の 3 点を整備し、後続 Phase 1〜4 の効果と精度影響を定量的に測定可能にすることを目的とする。

### スコープ
**含む:**
- `tests/fixtures/audio/` 配下に音声評価データセット（最低 100 件、各クラス均等）
- `tests/fixtures/images/` 配下に画像評価データセット（最低 100 件、各クラス均等）
- `scripts/eval-ai-analysis.ts` — Edge Function を CLI から実行し confusion matrix を出力
- `scripts/calc-ai-cost.ts` — Gemini API 呼び出しログから月次コストを集計
- 管理画面 `/admin/ai-cost` — 直近 30 日の呼び出し回数・推定コストを可視化
- 既存閾値（`AUTO_APPROVE_BOTH=0.75` 等）の妥当性レポート

**含まない:**
- AI 判定ロジック・モデルそのものの変更（Phase 1 以降のスコープ）
- リアルタイムアラート（コスト急増通知）— 必要なら別要件

### 前提条件・制約
- 評価データセットは **個人情報を含まない** こと。本番投稿から派生させる場合は位置情報・投稿者 ID をストリップした上でフィクスチャ化
- フィクスチャの著作権処理：自前録音 or CC0 / CC-BY ソース のみ（出典を `tests/fixtures/audio/SOURCES.md` に記録）
- CLI スクリプトは `pnpm` 経由で実行可能なこと
- Gemini API コスト集計は **`audit_logs` または別途新設するログテーブル** から計算

---

## 分割ファイル

本文は以下に逐語で分割した（この入口は目次と概要のみ）。

- [01-user-stories.md](REQ-075-ai-evaluation-harness/01-user-stories.md) — US-075-01〜03（精度影響の計測 / コスト施策の金額確認 / 既存閾値の妥当性確認）
- [02-functional-requirements.md](REQ-075-ai-evaluation-harness/02-functional-requirements.md) — FR-075-01〜06（音声・画像の評価データセット、評価実行スクリプト、コスト集計、AI呼び出しログ、コストダッシュボード）
- [03-nfr-and-screen-spec.md](REQ-075-ai-evaluation-harness/03-nfr-and-screen-spec.md) — 非機能要件（パフォーマンス・セキュリティ・再現性）と SC-075-01 AI コストダッシュボードの画面仕様
- [04-api-spec.md](REQ-075-ai-evaluation-harness/04-api-spec.md) — API-075-01 AI コスト集計（管理画面用）
- [05-data-model-and-migration.md](REQ-075-ai-evaluation-harness/05-data-model-and-migration.md) — 案A（`audit_logs` 拡張・推奨）／案B（`ai_call_logs` 新設）とマイグレーション計画
- [06-priority-risks-acceptance.md](REQ-075-ai-evaluation-harness/06-priority-risks-acceptance.md) — 実装優先度と計画、リスク・トレードオフ、受け入れ基準 AC-075-01〜05、サマリーと次のアクション

### 決めるべき論点（要点）

- AI 呼び出しログを **案A（`audit_logs` 拡張）** で足すか **案B（`ai_call_logs` 新設）** で足すか。推奨は案A。
- フィクスチャの調達方法（自前録音 / CC0・CC-BY ソース）。出典は `tests/fixtures/audio/SOURCES.md` に記録する。
- 完了後は REQ-076（Phase 1 モデル切替）に着手する。
