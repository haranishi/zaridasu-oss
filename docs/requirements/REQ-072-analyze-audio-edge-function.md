# REQ-072: analyze-audio Edge Function（Gemini 鳴き声判定）

## これは何か

写真判定の `analyze-image` と対になる音声版 Edge Function `analyze-audio` を新設し、Gemini の audio understanding でウシガエルの鳴き声を判定する要件。全文は同名ディレクトリの部品ファイルへ逐語で分割してある（入口のみ新規要約）。

## 目的・背景の要約

現在は写真のみで種判定を行っており、鳴き声だけの投稿は常に `pending` のまま滞留して admin の手作業負荷になる。Gemini API は `audio/mp3` / `wav` / `ogg` / `webm` を画像と同じ `inline_data: { mime_type, data: base64 }` で受け付けられるため、`analyze-image` とほぼ同構造で実装できる。投稿者は鳴き声投稿でも写真と同じ自動承認を期待し、運営は pending → auto_approve / auto_reject / admin review という同一フローでの一貫した審査を求めている。

## 主要な決定事項の要点

- `supabase/functions/analyze-audio/index.ts` を新規作成し、`analyze-image` と同じ構造（`corsHeaders` / `GEMINI_API_KEY` / `GEMINI_MODEL` / `SPECIES_LABELS` / `handleRequest` export / `serve(handleRequest)`）に揃える。
- DB Webhook は `posts` の INSERT と UPDATE 両方で起動し、内部で条件分岐する。早期 return は `no_audio` / `already_analyzed`（冪等性）/ `no_api_key` の 3 種で、いずれも 200 を返す。
- **エラー時も HTTP 200 を返す**（音声 fetch 失敗・Gemini 5xx・JSON パース失敗はすべて `ai_result.audio_analysis.error` に記録するだけ）。Webhook のリトライ嵐を避けるための決定。
- タイムアウトは音声取得 10 秒 / Gemini 30 秒。Gemini 呼び出しは 1 実行あたり最大 1 回（音声は 1 ファイルのみ）。
- `analyze-image` との同時実行で `ai_result` を read-modify-write すると後勝ちで一部が消えるため、JSONB 部分更新（`ai_result || jsonb_build_object(...)`）または advisory lock で競合対策する。**実装詳細は REQ-073 で一体設計する。**
- 緊急度・重要度とも High。UI（REQ-069）・Storage（REQ-070）・Schema（REQ-071）が揃っても AI 判定が無ければ鳴き声投稿は手動審査のみになり価値が半減する。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-background-and-requirements.md](REQ-072-analyze-audio-edge-function/01-background-and-requirements.md) | 背景（Gemini の音声対応・ユーザーストーリー）、現状の問題、機能要件 FR-072-01〜（Webhook 設定・早期 return・音声取得・base64・Gemini 呼び出し・プロンプト）、非機能要件 NFR-072-01〜06 |
| [02-api-and-data-model.md](REQ-072-analyze-audio-edge-function/02-api-and-data-model.md) | ファイル冒頭の設定定数、`ai_result.audio_analysis` の出力形式、Supabase Dashboard での設定手順 |
| [03-acceptance-impact-and-priority.md](REQ-072-analyze-audio-edge-function/03-acceptance-impact-and-priority.md) | 受入条件 AC-072-01〜10（Given/When/Then）、影響範囲、優先度 |
