# REQ-071: posts テーブルに audio_url カラム追加＋AI 音声判定結果カラム拡張

## これは何か

REQ-069（録音 UI）／REQ-070（Storage バケット）に続く最終段として、`posts` レコードと音声ファイルを紐付け、REQ-072 の Gemini 音声判定結果の保存場所を定義する DB スキーマ要件。
本文は全文を下の部品ファイルへ逐語で移動してある（この入口の要約部分のみ新規記述）。

## 目的・背景の要約

現状は写真のみで種判定しており、音声投稿・判定ができない。`posts` に音声 URL 列が無く、導入済みの `ai_result JSONB` は単一写真判定を前提とした構造のため、音声判定結果の入り場所が定義されていない。管理者が画像判定と音声判定を同じ `ai_result` の中で並べて見られる形にして、審査判断を一貫させる。

## 主要な決定事項の要点

- **`audio_url TEXT` を nullable で追加**し、Supabase Storage の publicUrl を格納する。既存レコードは NULL のままでよく、データ移行は不要。
- **CHECK 制約を 2 本**付ける — 長さ 500 文字以内（URL 長の濫用防止）と `^https?://` の形式（`javascript:` 等の注入を拒絶）。
- **新規カラムは増やさず `ai_result JSONB` のサブキーで拡張**する。`image_analysis` / `audio_analysis` / `combined_decision` / `model` / `analyzed_at` の構造にし、既存のトップレベルフィールドは REQ-072 デプロイ時に `image_analysis.*` へ移行。**既存レコードは旧構造のままで、読み取り側が後方互換を保つ**。
- **`audio_url` は列保護（`protect_post_insert_columns` / `protect_post_status`）の対象に追加しない**。ユーザーが投稿時に自分で設定する通常カラムであり、status / ai_result のような運用制御カラムではないため。REQ-034 の保護対象外。
- 音声付き投稿の絞り込み用に**部分インデックス** `idx_posts_has_audio` を追加。
- マイグレーションは**冪等**（`IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS` → 再追加）。posts が 10 万行未満の想定なので `NOT VALID` を使わない即時検証でもロックは 1 秒未満。
- 適用前に Supabase Dashboard から posts を手動エクスポートする運用手順を README に記載する。
- TypeScript 側は `ImageAiAnalysis` / `AudioAiAnalysis` / `CombinedDecision` を定義し、`AiResult` に**後方互換用の旧トップレベルフィールドも併記**する。
- **緊急度・重要度ともに High**。理由は、REQ-072 の Edge Function が書き込むカラムと構造を事前定義しないと、Webhook が動作しても書き込み先が無いため。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-background-and-problems.md](REQ-071-posts-audio-schema/01-background-and-problems.md) | 背景（ユーザーストーリー 2 件）と現状の問題（該当する schema.sql の行番号） |
| [02-requirements.md](REQ-071-posts-audio-schema/02-requirements.md) | 機能要件 FR-071-01〜08（カラム追加、2 つの CHECK、`ai_result` の新構造 JSON、列保護の非対象、インデックス、型定義）と非機能要件 NFR-071-01〜03 |
| [03-api-and-data-model.md](REQ-071-posts-audio-schema/03-api-and-data-model.md) | API / データモデル仕様 — `schema.sql` へ追記する SQL 全文と `src/types/index.ts` の型定義全文 |
| [04-acceptance-criteria.md](REQ-071-posts-audio-schema/04-acceptance-criteria.md) | 受入条件 AC-071-01〜07（冪等性、制約違反、後方互換、型テスト、pg-tap） |
| [05-impact-and-priority.md](REQ-071-posts-audio-schema/05-impact-and-priority.md) | 影響範囲（変更ファイルと読み取り側の型調整先）と優先度の判断理由 |
