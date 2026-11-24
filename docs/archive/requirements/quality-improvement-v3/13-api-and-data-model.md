## Step 6: API仕様

本改善では新規 API エンドポイントは追加しない。既存の Supabase クライアント直接アクセスを維持し、以下のクライアント側改善を実施する：

### API-001: RPC スロットリングラッパー
- **対象RPC:** `get_user_profile`, `get_user_ranking`, `check_email_exists`
- **方式:** クライアント側ユーティリティ
- **制限:** 同一キーの呼び出しを 1000ms 間隔に制限
- **備考:** サーバー側レートリミットは Supabase の既存制限に依存

### API-002: Background Sync（SW 経由）
- **Method:** POST（Service Worker 内）
- **Path:** Supabase REST API 直接
- **認証:** IndexedDB に保存されたトークンを使用
- **処理フロー:**
  1. `sync` イベント発火
  2. IndexedDB から未送信投稿を取得
  3. 写真アップロード → posts INSERT → AI 分析トリガー
  4. 成功時に IndexedDB エントリ削除
- **エラーハンドリング:** 失敗時は自動リトライ（ブラウザ管理）

---

## Step 7: データモデル・DB設計

### 変更テーブル: posts

**追加制約:**
```sql
ALTER TABLE posts ADD CONSTRAINT chk_user_id_required
  CHECK (is_anonymous = true OR user_id IS NOT NULL);
```

### 外部キー制約変更

| テーブル | カラム | 現在 | 変更後 |
|---------|--------|------|--------|
| comments | user_id | ON DELETE SET NULL | ON DELETE CASCADE |
| likes | user_id | (なし) | ON DELETE CASCADE |
| survey_requests | user_id | ON DELETE SET NULL | ON DELETE CASCADE |
| reports | user_id | (なし) | ON DELETE SET NULL |
| posts | user_id | ON DELETE SET NULL | 変更なし |
| user_badges | user_id | ON DELETE CASCADE | 変更なし |
| user_profiles | id | ON DELETE CASCADE | 変更なし |

### ER図（変更箇所のみ）
```
[auth.users] ──ON DELETE CASCADE──→ [comments]
             ──ON DELETE CASCADE──→ [likes]
             ──ON DELETE CASCADE──→ [survey_requests]
             ──ON DELETE SET NULL──→ [reports]
             ──ON DELETE SET NULL──→ [posts] (変更なし)
```

---

