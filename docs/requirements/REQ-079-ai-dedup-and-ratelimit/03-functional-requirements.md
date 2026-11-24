## 機能要件

### FR-079-01: クライアント側のハッシュ計算
- **説明:** 音声 Blob / 画像 File の SHA-256 を計算
- **入力:** Blob / File
- **処理:**
  1. `await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())`
  2. ArrayBuffer → hex 文字列に変換
- **出力:** 64 文字の hex 文字列
- **バリデーション:** ハッシュ計算は 500ms 以内（モバイルでも）
- **エラーハンドリング:** 失敗時は hash NULL でアップロード続行（既存挙動互換）

### FR-079-02: posts テーブルに hash カラム追加
- **説明:** `audio_hash text` と `image_hashes text[]`（複数枚対応）を追加
- **`image_hashes` の理由:** posts.photos が text[] のため、画像も配列で対応
- **NULL 許容:** 既存データ保護のため NULL 可
- **インデックス:** ハッシュ検索高速化のため
  - `idx_posts_audio_hash ON (audio_hash) WHERE audio_hash IS NOT NULL`
  - `idx_posts_image_hashes_gin ON (image_hashes) USING gin WHERE image_hashes IS NOT NULL`

### FR-079-03: Edge Function での hash dedup
- **説明:** Edge Function 起動時に同一 hash の過去判定を検索し、存在すれば再利用
- **処理（analyze-audio の場合）:**
  1. record.audio_hash が NULL なら通常処理にスキップ
  2. `posts WHERE audio_hash = $1 AND id != $2 AND ai_result->'audio_analysis' IS NOT NULL AND ai_analyzed_at > now() - interval '30 days'` を検索
  3. ヒットすれば過去結果を copy + `copied_from_post_id` を記録
  4. ヒットしなければ通常処理
- **出力:** 既存と同型の `audio_analysis`（コピー or 新規）
- **エラーハンドリング:** dedup ロジック失敗時は通常処理にフォールバック

### FR-079-04: reanalysis rate limit
- **説明:** `reanalysis=true` 経路の呼び出し回数を投稿あたり日次制限
- **処理:**
  1. リクエスト冒頭で `audit_logs WHERE action = 'ai_reanalysis' AND target_id = $post_id AND created_at > now() - interval '24 hours'` の COUNT を取得
  2. COUNT >= `AI_REANALYSIS_DAILY_LIMIT` なら 429 で即 return
  3. 通常処理に進む際に `audit_logs` に `ai_reanalysis` を INSERT
- **入力:** `reanalysis=true`、`record.id`
- **出力:** 通常時 200、上限超過時 429
- **エラーハンドリング:** audit_logs 取得失敗時は **fail-closed**（rate limit を厳しく適用）

### FR-079-05: dedup 統計のロギング
- **説明:** dedup hit / miss を集計可能にする
- **記録項目:** `audit_logs.metadata.ai_call.dedup_status`（'hit' / 'miss' / 'skipped'）
- **目的:** Phase 4 の効果測定

---
