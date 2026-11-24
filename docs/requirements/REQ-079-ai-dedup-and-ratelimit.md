# REQ-079: Phase 4 — Hash dedup と reanalysis rate limit

> **親要件**: REQ-074
> **位置づけ**: Phase 4 / 全 Phase の最後（DB スキーマ変更を伴うため）
> **作成日**: 2026-04-22
> **ステータス**: TODO

---

## これは何か

AI 判定コスト削減 Phase 4 の要件定義。**同一素材の再判定をハッシュで省く（dedup）**のと、
**ユーザー由来の再判定（`reanalysis=true`）に日次上限を掛ける**の2本立て。

## 目的・背景

`analyze-audio` / `analyze-image` には2つの穴が残っている。①同じファイルを別投稿で使い回しても
毎回 Gemini を呼ぶ。②`reanalysis=true` に回数制限がない。スパム・連投・デバッグ目的の連打で
不要な API 呼び出しが発生するため、本要件で抑止する。

削減効果は他 Phase より小さい（**-10% 程度**）が、**悪用シナリオでの安全装置**としての価値が大きい。

## 主要な決定事項（要点）

- `posts` に `audio_hash text` / `image_hashes text[]`（SHA-256・hex 64文字）を追加。**NULL 許容**なので
  既存投稿は自動的に dedup スキップ＝**後方互換完全・フィーチャーフラグ不要**。
- ハッシュ計算は**クライアント側**（`crypto.subtle.digest`）。失敗したら hash NULL のまま続行。
- dedup は**直近 30 日**の同一ハッシュを検索し、ヒットすれば結果を copy して
  `copied_from_post_id` を記録。**combined_decision は再計算**し、audio/image 単独判定のみ copy する。
- rate limit は `AI_REANALYSIS_DAILY_LIMIT`（既定 3）。カウントは `audit_logs` から算出＝**追加テーブル不要**。
  超過は 429。`audit_logs` 取得失敗時は **fail-closed**（厳しい側に倒す）。
- hash カラムは REQ-034 の column-protection 対象に加え、**user による直接更新を禁止**する。
- dedup ロジックが失敗したら**通常処理へフォールバック**する（判定は必ず完了させる）。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-overview.md](REQ-079-ai-dedup-and-ratelimit/01-overview.md) | 要件概要（背景・目的／スコープの含む・含まない／前提条件・制約） |
| [02-user-stories.md](REQ-079-ai-dedup-and-ratelimit/02-user-stories.md) | ユーザーストーリー US-079-01（dedup）/ US-079-02（rate limit）と受け入れ条件 |
| [03-functional-requirements.md](REQ-079-ai-dedup-and-ratelimit/03-functional-requirements.md) | 機能要件 FR-079-01〜05（hash 計算・カラム追加・dedup・rate limit・統計ロギング） |
| [04-non-functional.md](REQ-079-ai-dedup-and-ratelimit/04-non-functional.md) | 非機能要件（コスト削減目標・性能・セキュリティ・互換性） |
| [05-impact-scope.md](REQ-079-ai-dedup-and-ratelimit/05-impact-scope.md) | 影響範囲（変更ファイル一覧・追加環境変数・DB スキーマ変更） |
| [06-api-and-data-model.md](REQ-079-ai-dedup-and-ratelimit/06-api-and-data-model.md) | API 仕様（出力追加フィールド・429 レスポンス）とデータモデル・DB 設計 |
| [07-migration-plan.md](REQ-079-ai-dedup-and-ratelimit/07-migration-plan.md) | マイグレーション計画（Migration-079-01/02 の Up/Down SQL と影響範囲） |
| [08-acceptance-and-risks.md](REQ-079-ai-dedup-and-ratelimit/08-acceptance-and-risks.md) | 受け入れ基準 AC-079-01〜06 とリスク・トレードオフ表 |
| [09-priority-and-summary.md](REQ-079-ai-dedup-and-ratelimit/09-priority-and-summary.md) | 実装優先度と計画（P1〜P3）、サマリー、次のアクション |
