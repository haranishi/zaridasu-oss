# REQ-076: Phase 1 — Gemini モデルダウングレードと preview 依存解消

> **親要件**: REQ-074
> **位置づけ**: Phase 1 / **REQ-075（評価基盤）の完了が前提依存**
> **作成日**: 2026-04-22
> **ステータス**: TODO

---

## これは何か

REQ-074（AI コスト削減）の Phase 1。`analyze-audio` のモデルを評価ベースで安価な系列へ切り替え、
`analyze-image` のハードコードされた **preview 依存を解消**し、モデル切替に伴う自動承認/リジェクト
閾値を再キャリブレーションする。コード変更は数行だが、**A/B 評価という重い前提**を持つ。

## 主要な決定事項の要点

- **REQ-075（評価基盤）の完了が必須の前提依存**。評価基盤無しでの切り替えは禁止。
- **切り替えは環境変数のみで制御できること**（コードデプロイ無しで rollback 可能）。
  `analyze-image` は `GEMINI_IMAGE_MODEL` を新設し、デフォルトを GA 版モデルにする。
- **許容精度低下幅は recall -3pt / precision -2pt 以内**（REQ-074 準拠）。
- **コスト削減目標は analyze-audio が -50〜70%**。analyze-image はコスト維持で、
  preview リスクの解消が主目的。
- **ロールバックは環境変数変更のみで 5 分以内**。切替直後 24 時間は manual review 件数を監視し、
  急増したら即時 rollback。
- **要確認（TBD）**: Gemini Flash-Lite 系が音声入力をサポートしているか。非対応なら
  analyze-audio は Flash 維持とし、コスト削減は Phase 2/3 に委ねる。
- プロンプト本体の変更、入力データ圧縮（Phase 2）、Context Caching（Phase 3）は含まない。

## 目次（各部品）

- [01-overview-scope-preconditions.md](REQ-076-ai-model-downgrade/01-overview-scope-preconditions.md)
  — 要件概要：現行モデルと課題の表、本要件の 3 つの狙い、スコープ（含む／含まない）、前提条件・制約。
- [02-user-stories.md](REQ-076-ai-model-downgrade/02-user-stories.md)
  — US-076-01（安全なモデル切替）と US-076-02（preview 依存リスクの除去）の受け入れ条件・優先度・見積もり。
- [03-functional-requirements.md](REQ-076-ai-model-downgrade/03-functional-requirements.md)
  — FR-076-01〜05：analyze-audio のモデル切替、analyze-image の環境変数化（Before/After コード）、閾値再キャリブレーション、A/B 評価レポート、ロールバック手順の文書化。
- [04-non-functional-requirements.md](REQ-076-ai-model-downgrade/04-non-functional-requirements.md)
  — 非機能要件：コスト削減目標、精度許容範囲、レイテンシ、可用性（rollback 時間・監視）。
- [05-impact-and-unchanged-specs.md](REQ-076-ai-model-downgrade/05-impact-and-unchanged-specs.md)
  — 影響範囲（コード変更表・追加環境変数表・DB スキーマ・ドキュメント追加）と、API / 画面 / データモデルが変更なしである旨。
- [06-acceptance-criteria-and-risks.md](REQ-076-ai-model-downgrade/06-acceptance-criteria-and-risks.md)
  — 受け入れ基準 AC-076-01〜06 と、リスク・トレードオフ表（音声入力非対応、精度低下、GA 未達、ログのモデル名混在）。
- [07-plan-and-summary.md](REQ-076-ai-model-downgrade/07-plan-and-summary.md)
  — 実装優先度と計画（P1/P2 の項目・依存・見積もり）、サマリー、次のアクション 3 点。
