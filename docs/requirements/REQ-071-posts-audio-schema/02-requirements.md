## 要件

### 機能要件
- [ ] FR-071-01: `posts` テーブルに `audio_url TEXT` カラムを追加（nullable、Supabase Storage の publicUrl を格納）。`supabase/schema.sql` に `ALTER TABLE posts ADD COLUMN IF NOT EXISTS audio_url TEXT;` を追記（冪等）。
- [ ] FR-071-02: `audio_url` に長さ CHECK 制約を追加: `ALTER TABLE posts ADD CONSTRAINT posts_audio_url_length CHECK (audio_url IS NULL OR char_length(audio_url) <= 500);`（URL 長の濫用防止）。
- [ ] FR-071-03: `audio_url` に形式 CHECK 制約を追加: `ALTER TABLE posts ADD CONSTRAINT posts_audio_url_format CHECK (audio_url IS NULL OR audio_url ~ '^https?://');`（http/https 以外を拒絶し、`javascript:` 等の注入を防ぐ）。
- [ ] FR-071-04: `ai_result JSONB` の構造を以下の形に拡張する。**新規カラム追加は不要**、JSONB のサブキー追加のみ:
  ```json
  {
    "image_analysis": { "detected_species": "bullfrog", "species_match": true, "confidence": 0.88, "image_quality": "good", "is_appropriate": true, "concerns": [], "notes": "...", "analyzed_at": "2026-04-21T12:00:00Z", "photo_count": 2, "analyzed_count": 2, "per_photo": [...] },
    "audio_analysis": { "detected_species": "bullfrog", "species_match": true, "confidence": 0.92, "audio_quality": "good", "is_appropriate": true, "concerns": [], "notes": "...", "analyzed_at": "2026-04-21T12:00:02Z" },
    "combined_decision": { "should_approve": true, "should_reject": false, "reason": "both_modalities_match" },
    "model": "gemini-3.1-flash-lite-preview",
    "analyzed_at": "2026-04-21T12:00:02Z"
  }
  ```
  既存の写真判定結果（`detected_species` などのトップレベルフィールド）は REQ-072 のデプロイ時に `image_analysis.*` へ移行する。移行は `analyze-image` Edge Function が書き込む際に新構造で出力する方向で対応し、既存レコードは旧構造のまま読み取り側で後方互換を保つ。
- [ ] FR-071-05: `protect_post_insert_columns` / `protect_post_status`（`supabase/schema.sql:540-619`）に `audio_url` 列の保護を**追加しない**。audio_url はユーザー投稿時に自分で設定する通常カラムであり、status / ai_result 系の「運用制御カラム」ではないため。REQ-034 の保護対象外として扱う。
- [ ] FR-071-06: インデックス追加: `CREATE INDEX IF NOT EXISTS idx_posts_has_audio ON posts ((audio_url IS NOT NULL)) WHERE audio_url IS NOT NULL;` — 音声付き投稿のみを絞り込むクエリ（管理ダッシュボード等）の高速化用。
- [ ] FR-071-07: 既存投稿のマイグレーション — `audio_url` は NULLABLE のためデータ移行不要。既存レコードは NULL のまま問題なし。
- [ ] FR-071-08: TypeScript 型定義の更新 — `src/types/index.ts` の `Post` インターフェースに `audio_url: string | null` を追加、`ai_result` の型を `ImageAiResult | AudioAiResult | CombinedAiResult` のユニオンで表現。

### 非機能要件
- [ ] NFR-071-01: マイグレーションは冪等 — 同じ SQL を複数回実行してもエラーにならない（既存 `schema.sql` の設計方針と整合）。
- [ ] NFR-071-02: 本番 DB へ適用する際、`ALTER TABLE` 中のロック時間は 1 秒未満（カラム追加 + CHECK は `NOT VALID` にしない即時検証でも posts 規模 < 100k 行なら問題ない想定）。
- [ ] NFR-071-03: バックアップ — マイグレーション前に Supabase Dashboard から posts テーブルのバックアップを手動エクスポート（運用手順として README に記載）。
