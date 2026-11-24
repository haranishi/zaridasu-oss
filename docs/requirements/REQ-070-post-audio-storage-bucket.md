# REQ-070: Supabase Storage に post-audio バケット追加

## これは何か

REQ-069 で録音した音声 Blob を永続化する**専用 Storage バケット `post-audio`** を追加する要件。
緊急度 High / 重要度 High。

## 目的・背景（要約）

既存の `post-photos` と同じ RLS・命名規約を踏襲しつつ、**別バケットにする**。理由は 3 つ。
(1) MIME 型の検証範囲が写真と音声で異なる、(2) サイズ上限が異なる（写真 5MB / 音声 1MB）、
(3) 将来の CDN キャッシュポリシーや匿名アクセス制限を独立して運用する余地を残すため。

`post-photos` に音声を混ぜると MIME 許可リストに引っかかって保存できない。また投稿失敗時に
孤立音声ファイルが残ると課金とプライバシーの両面でリスクがある（REQ-002 と同種の問題）。

本要件が無いと REQ-071 の `audio_url` に入れる URL を生成できない。

## 主要な決定事項（要点）

- バケットは **`public = true`**（`posts.audio_url` から直接再生するため）。
- **`file_size_limit = 1048576`（1 MB）**。10 秒の opus なら余裕があり、動画レベルの悪用を抑制できる。
- 許可 MIME は `audio/webm` / `audio/mp4` / `audio/mpeg` / `audio/ogg` の 4 種。
- 命名規約は **`{user_id}/{uuid}.{ext}`** で `post-photos` と完全一致させる。
- RLS は 3 本（`authenticated_upload_audio` / `public_read_audio` / `owner_or_admin_delete_audio`）。
  削除は **所有者または admin のみ**。
- **投稿 INSERT が失敗したらアップロード済み音声を `storage.remove` する**（孤立クリーンアップ）。
  `usePostForm` の送信 try/catch の catch 節に、既存ロールバックパターンと同じ形で組み込む。
- SQL は `ON CONFLICT (id) DO NOTHING` と `DROP POLICY IF EXISTS` による**冪等設計**で、
  `supabase/schema.sql` を 1 回実行すれば完結する。
- 保存ファイルの TTL は無制限（posts 削除時の cleanup は別要件）。`cacheControl` は既存と同じ `3600`。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-and-requirements.md](REQ-070-post-audio-storage-bucket/01-background-and-requirements.md) | 背景・ユーザーストーリー・現状の問題と、機能要件 FR-070-01〜05／非機能要件 NFR-070-01〜04 |
| [02-api-and-data-model.md](REQ-070-post-audio-storage-bucket/02-api-and-data-model.md) | `schema.sql` へ追記する SQL 全文（バケット定義＋RLS 3 本）と `uploadAudio()` のシグネチャ案 |
| [03-acceptance-impact-priority.md](REQ-070-post-audio-storage-bucket/03-acceptance-impact-priority.md) | 受入条件 AC-070-01〜06、影響範囲、優先度と理由 |
