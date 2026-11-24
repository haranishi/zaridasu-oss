## 背景

`reports` テーブルは「投稿への通報」を保存し、`flag_post_on_reports` トリガーで 3 件以上の未解決通報が集まると `posts.is_flagged=true` を自動的に立てる重要なテーブルである。本番 `pg_policies` を確認したところ、INSERT 用ポリシーが 2 つ共存している:

- `public_insert_reports`（`WITH CHECK (true)` — 完全無検証）
- `validated_insert_reports`（`WITH CHECK (post_id IS NOT NULL AND reason <> '')` — バリデーション付き）

PostgreSQL の PERMISSIVE ポリシーは同一コマンド（FOR INSERT）で複数定義された場合 **OR 結合**される仕様（[Postgres Docs: Policies Applied by Command Type](https://www.postgresql.org/docs/current/sql-createpolicy.html)）。`WITH CHECK (true)` が含まれている限り、validated 側の制約は事実上バイパスされ、anon ロールでも無検証で INSERT が通る。

repo 側（`supabase/migrations/20240101000000_initial_schema.sql:194` と `supabase/schema.sql:234`）には `public_insert_reports` のみが定義されており、`validated_insert_reports` を作る migration は存在しない。つまり本番にだけ手動追加された痕跡（schema drift）が残り、drift をクリーンアップする migration が必要。

## 現状の問題

### コード上の定義

- `supabase/schema.sql:234`
  ```sql
  DO $$ BEGIN CREATE POLICY "public_insert_reports" ON reports FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  ```
- `supabase/migrations/20240101000000_initial_schema.sql:194` も同一内容。
- `supabase/schema.sql:217-225` の `reports` テーブル定義:
  ```sql
  CREATE TABLE IF NOT EXISTS reports (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    post_id     UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    reason      TEXT        NOT NULL CHECK (reason IN ('spam','wrong_location','inappropriate','other')),
    comment     TEXT,
    reporter_ip TEXT,
    resolved    BOOLEAN     DEFAULT FALSE
  );
  ```
  - `reason` は `NOT NULL` + `CHECK` で enum 制限済み（DB レベルで NULL/空文字は弾ける）
  - `comment` は長さ上限なし → 巨大ペイロード送信可能（数 MB の TEXT 投げられる）
  - `post_id` は `NOT NULL` だが、存在しない UUID を投げると FK エラーになるだけで policy 自体は通る

### 攻撃シナリオ

1. anon クライアントが `INSERT INTO reports (post_id, reason, comment) VALUES (<任意のpost_id>, 'spam', '<10MB string>')` を 3 回繰り返す
2. `public_insert_reports` の `WITH CHECK (true)` で素通り（OR 結合のため `validated_insert_reports` の制約は無視される）
3. `flag_post_on_reports` トリガーが発火 → `posts.is_flagged = TRUE` がセットされる
4. `is_flagged` 投稿は管理 UI の通報キューに送られ、無関係の通報スパムで管理者の運用負荷を増大 + UI 上で no-show 化（投稿者から見ると「いつのまにか自分の投稿が表示されない」）

### REQ-020/REQ-034 との関係

- REQ-020: `audit_logs` の整合性保護を扱うが、`reports` には触れていない
- REQ-025: `reports` の policy 整理は議論されていない
- 本 REQ は新規領域なので独立して進める
