## 影響範囲

### コード変更
| ファイル | 変更内容 |
|---|---|
| `src/hooks/usePostForm.ts` | 投稿作成前に hash 計算、DB INSERT に含める |
| `src/lib/uploadAudio.ts` | hash 計算ユーティリティの呼び出し（or 別 lib に分離） |
| `src/lib/hash/sha256.ts`（新規） | SHA-256 計算共通関数 |
| `supabase/functions/analyze-audio/index.ts` | dedup 検索 + rate limit |
| `supabase/functions/analyze-image/index.ts` | 同上 |
| `supabase/schema.sql` | カラム追加 |
| `supabase/migrations/YYYYMMDD_add_post_hashes.sql`（新規） | カラム + index + RLS 拡張 |
| `supabase/migrations/001_rls_and_audit_triggers.sql`（既存修正 or 新マイグレーション） | column-protection に hash カラム追加（REQ-034 拡張） |

### 環境変数追加
| 変数名 | デフォルト | 説明 |
|---|---|---|
| `AI_REANALYSIS_DAILY_LIMIT` | `3` | 1 投稿あたりの日次再判定上限 |
| `AI_DEDUP_LOOKBACK_DAYS` | `30` | dedup 検索の遡及日数 |
| `AI_DEDUP_ENABLED` | `true` | dedup フィーチャーフラグ |

### DB スキーマ変更
- `posts.audio_hash text NULL`
- `posts.image_hashes text[] NULL`
- インデックス 2 個追加
- RLS ポリシー（column-protection trigger）拡張

---
