## 7. データモデル・DB設計

> 本 REQ でテーブル変更は無い。RPC（関数）追加のみ。

### 関数: `get_dashboard_stats(p_user_id uuid default null)`
- **戻り値型**: `jsonb`
- **言語**: `plpgsql`
- **`SECURITY`**: `INVOKER`
- **インデックス前提**:
  - `posts(created_at)` … 月別集計
  - `posts(municipality)` … ランキング
  - `posts(species)` / `posts(info_type)` … 内訳
  - 既存インデックスを `EXPLAIN ANALYZE` で確認、不足分を別 PR でマイグレーション。
- **詳細**: REQ-032 を継承。

### インデックス追加候補（要確認）
- `posts(created_at DESC, id)` — フィード用カバリング
- `posts(municipality, created_at DESC)` — エリアページ用
- `survey_request_responses(survey_request_id, created_at DESC)` — 依頼詳細用

---

## 8. マイグレーション計画

### Migration-092-01: `get_dashboard_stats` RPC 関数追加
- **変更種別**: 関数追加
- **SQL**: REQ-032 の通り。
- **影響範囲**: 既存テーブル無変更。安全。
- **データ移行**: 不要。

### Migration-092-02: パフォーマンス用インデックス追加（必要に応じ）
- **変更種別**: インデックス追加（CONCURRENTLY）
- **SQL**:
  ```sql
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_created_at_desc
    ON posts (created_at DESC, id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_municipality_created_at
    ON posts (municipality, created_at DESC);
  ```
- **影響範囲**: 軽量。`CONCURRENTLY` で本番影響なし。
- **データ移行**: 不要。

> CI（pg-tap）では schema.sql に同じ内容が反映されているか smoke チェック（REQ-060）。

---
