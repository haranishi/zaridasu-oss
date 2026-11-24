## 背景
REQ-069 で追加する音声 Blob を永続化する専用 Storage バケットが必要。既存の `post-photos` バケット（`supabase/schema.sql:353-381`）と同じ RLS・命名規約を踏襲することで、運用の一貫性（所有者削除・admin 削除・MIME 検証）を保つ。別バケットにする理由は: (1) MIME 型の検証範囲が写真と音声で異なる、(2) サイズ上限が異なる（写真 5MB / 音声 1MB）、(3) 将来的な CDN キャッシュポリシーや匿名アクセス制限の独立運用余地を残すため。

**ユーザーストーリー**:
- 投稿者として、録音した鳴き声ファイルが確実に保存され、投稿詳細ページで再生できることを期待する。
- 運営として、不適切な音声ファイルの削除権限を admin に持たせたい。

## 現状の問題
- 現在は写真のみで種判定、音声投稿・判定ができない
- `post-photos` バケットに音声を混ぜると MIME 許可リスト（`image/jpeg, image/png, image/webp, image/heic`）に引っかかり保存できない
- 投稿失敗時に孤立音声ファイルが残ると課金とプライバシーの両面でリスク（REQ-002 と同種の問題）

## 要件

### 機能要件
- [ ] FR-070-01: `supabase/schema.sql` に新バケット定義を追加（`INSERT INTO storage.buckets ... ON CONFLICT (id) DO NOTHING` 冪等パターン、既存 post-photos と同じ）。
  - バケット ID / 名前: `post-audio`
  - `public = true`（pubic read。posts.audio_url で直接再生するため）
  - `file_size_limit = 1048576`（1 MB = 10 秒 opus でも余裕、動画レベルの悪用を抑制）
  - `allowed_mime_types = ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg']`
- [ ] FR-070-02: Storage RLS ポリシー（`storage.objects` テーブル）を既存の post-photos と同構造で追加:
  - `authenticated_upload_audio`: 認証ユーザーのみ INSERT、`bucket_id = 'post-audio'` かつ ファイル名が `\.(webm|mp4|m4a|mp3|ogg)$` に一致
  - `public_read_audio`: 誰でも SELECT
  - `owner_or_admin_delete_audio`: 認証ユーザーで `name LIKE concat(auth.uid()::text, '/%')` または `(auth.jwt()->'app_metadata'->>'role') = 'admin'`
- [ ] FR-070-03: 命名規約 `{user_id}/{uuid}.{ext}` を採用（post-photos と完全一致）。クライアント実装は `src/lib/uploadAudio.ts`（新設）または既存の `src/lib/uploadPhotos.ts` 相当箇所に並列して追加。
- [ ] FR-070-04: 投稿 INSERT 失敗時の孤立クリーンアップ — アップロード済み音声オブジェクトを `supabase.storage.from('post-audio').remove([path])` で削除する。`src/hooks/useOfflineQueue.ts` の既存ロールバックパターンと同じフローで実装。`usePostForm` の送信 try/catch の catch 節に組み込む。
- [ ] FR-070-05: CLI マイグレーション — `supabase/schema.sql` を本番・開発の Supabase SQL Editor で 1 回実行すれば完結する冪等設計（既存ファイルの末尾か Storage セクション付近に追記）。

### 非機能要件
- [ ] NFR-070-01: バケットは CDN 配信（Supabase Storage の既定）に乗り、2026 年時点で想定される同時再生数（〜100 req/s）を捌けること。
- [ ] NFR-070-02: 保存ファイルの TTL は無制限（posts 削除時に arbitrary cleanup は別要件で扱う）。
- [ ] NFR-070-03: アップロード時の `cacheControl` は `3600`（既存と同じ）。
- [ ] NFR-070-04: CORS は Supabase Storage の既定（全オリジン許可）で問題ないことを確認。
