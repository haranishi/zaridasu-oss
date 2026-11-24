## API 仕様

### 既存 Edge Function の変更
- **入力スキーマ**: 変更なし（hash は posts レコードから自動取得）
- **出力スキーマ**: 既存に加えて以下を追加
  ```json
  {
    "audio_analysis": {
      ...
      "copied_from_post_id": "uuid|null",
      "dedup_status": "hit|miss|skipped"
    }
  }
  ```
- **新規 HTTP ステータス**: `429 Too Many Requests`（rate limit 超過時）
  ```json
  {
    "error": "rate_limit_exceeded",
    "retry_after_seconds": 86400,
    "limit": 3,
    "current": 4
  }
  ```

---

## データモデル・DB 設計

### 既存 posts テーブルの拡張
| カラム名 | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| audio_hash | text | YES | NULL | 音声 SHA-256（hex 64 文字）。NULL=既存データ or 計算失敗 |
| image_hashes | text[] | YES | NULL | 画像 SHA-256 配列（photos の順序に対応） |

**バリデーション:**
- `audio_hash` は CHECK 制約で `~ '^[a-f0-9]{64}$'` を強制
- `image_hashes` の各要素も同様

**インデックス:**
- `idx_posts_audio_hash ON posts (audio_hash) WHERE audio_hash IS NOT NULL`
- `idx_posts_image_hashes_gin ON posts USING gin (image_hashes) WHERE image_hashes IS NOT NULL`

**RLS:**
- 既存 posts ポリシーが SELECT/INSERT を許可しているため、追加ポリシー不要
- ただし **column-protection trigger**（REQ-034）に `audio_hash` / `image_hashes` を追加して **user による直接更新を禁止**

---
