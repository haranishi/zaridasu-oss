## 現状の問題

### 現状の `protect_post_status`（最新: 20260424000001）

```sql
IF (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
  NEW.status            := OLD.status;
  NEW.rejection_reason  := OLD.rejection_reason;
  NEW.rejection_message := OLD.rejection_message;
  NEW.reviewed_at       := OLD.reviewed_at;
  NEW.reviewed_by       := OLD.reviewed_by;
  NEW.auto_approved     := OLD.auto_approved;
  -- REQ-079: hash 改竄禁止
  NEW.audio_hash        := OLD.audio_hash;
  NEW.image_hashes      := OLD.image_hashes;
END IF;
```

実際の本番 schema.sql:540-578 は REQ-034 で `is_official` / `is_flagged` / `reporter_ip` / `ai_result` / `ai_analyzed_at` も保護済み。ただし 20260424000001 の `CREATE OR REPLACE FUNCTION protect_post_status` でこの 5 列が落ちている **可能性が高い**（hash 追加 migration が REQ-034 を上書きしている）。

→ migration 適用順を確認すると `20260424000001` は schema.sql の REQ-034 拡張（schema.sql:540）より後に走ることになるため、本番では **REQ-034 の 5 列保護が消えた可能性** がある。これは本 REQ で検出 + 統合して修正する必要がある。

### `owner_update` policy

`supabase/schema.sql:123`:
```sql
DO $$ BEGIN CREATE POLICY "owner_update" ON posts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```
- `USING (auth.uid() = user_id)` — 自分の投稿のみ UPDATE 可
- `WITH CHECK (auth.uid() = user_id)` — UPDATE 後も自分の投稿のままであること

これは `user_id` が変更されると WITH CHECK で弾かれるはずだが、**`user_id` を他人 UUID にする UPDATE の場合、新値が他人 UUID = `auth.uid()` ではないため policy で弾かれる**。これは安全側。
→ ただし「自分から他人」への移譲は弾かれるが、「`user_id=NULL`（is_anonymous=true）に戻す」は弾かれる（user_id=NULL ≠ auth.uid()）。ここは現状の policy で OK。

→ `user_id` 改竄は実際にはほぼ policy で守られている。ただし `protect_post_status` で明示的に固定すれば二重防御になり、policy 変更時のリグレッションに強くなる。

### 未保護カラム棚卸し（要 OLD 固定）

| カラム | 導入 REQ | 攻撃シナリオ | 必要保護 |
|---|---|---|---|
| `user_id` | 初期 | policy で守られているが二重防御推奨 | OLD 固定 |
| `ai_failure_count` | REQ-125 / REQ-128 | 再判定スキップを 0 リセットして AI コスト枯渇 | OLD 固定 |
| `audio_url` | REQ-070 | 承認後に違法 URL に差し替え | OLD 固定（承認済み投稿の場合）or 全面 OLD 固定 |
| `audio_duration_ms` | REQ-082 | UI 上の再生時間表示の改竄 | OLD 固定 |
| `weather` | REQ-051 系 | 観測時刻と矛盾する気象後付け | OLD 固定 |
| `temperature` | 同上 | 同上 | OLD 固定 |
| `humidity` | 同上 | 同上 | OLD 固定 |
| `survey_request_id` | REQ-084 | 他人の依頼への紐付けなりすまし | OLD 固定 |
| `survey_duration_minutes` | REQ-085 系 | 調査時間の改竄 | OLD 固定 |
| `is_official` | 初期 | REQ-034 で保護済みだが migration drift で消えた疑い | OLD 固定 |
| `is_flagged` | 初期 | REQ-034 で保護済みだが migration drift で消えた疑い | OLD 固定（自己フラグ解除を防ぐ） |
| `reporter_ip` | REQ-034 | 同上、 IP ログ消去防止 | OLD 固定 |
| `ai_result` | REQ-034 | 同上、ai_perfect バッジ自己付与防止 | OLD 固定 |
| `ai_analyzed_at` | REQ-034 | 同上 | OLD 固定 |

`audio_url` は「承認前なら投稿者が自分で差し替え可能」という UX が必要かは要議論。ただし安全側に倒すなら全面 OLD 固定が無難（差し替えるなら削除→新規投稿で OK）。
