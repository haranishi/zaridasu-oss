### 8.6 テーブル: `field_safety_reports`

| カラム | 型 | NULL | 説明 |
|---|---|---:|---|
| id | uuid | NO | PK |
| mission_id | uuid | NO | field_missions FK |
| user_id | uuid | NO | auth.users FK |
| reason | text | NO | 定義済み理由 |
| note | text | YES | 最大500文字、サニタイズ |
| created_at | timestamptz | NO | 作成日時 |
| resolved_at / resolved_by | timestamptz / uuid | YES | 管理対応 |

同一ユーザー・同一ミッションの短時間重複を制限する。

### 8.7 ER図

```text
[exploration_cells] 1 ── N [field_missions]
         |                     |
         |                     1
         |                     |
         |                     N
         └────── 1 ── N [field_sessions] N ── 1 [users]
                               |
                               0..1
                               |
                               1
                            [posts]
                               |
                               1
                               |
                               0..1
                      [cell_contributions]

[field_missions] 1 ── N [field_safety_reports]
```

### 8.8 クライアントデータモデル: IndexedDB `offline-outbox`

既存 `zaridasu-offline / pending-posts` を後方互換マイグレーションし、編集下書きと送信確定Outboxを区別する。これはSupabaseテーブルではなく、端末内の同一オリジンストレージである。

| フィールド | 型 | 必須 | 説明 |
|---|---|---:|---|
| local_id | number | YES | 端末内キー |
| schema_version | number | YES | マイグレーション判定 |
| client_submission_id | uuid | YES | 全再試行で固定 |
| owner_user_id | uuid | YES | 表示・同期の所有者分離 |
| state | text | YES | draft/queued/preparing/uploading/finalizing/retry_wait/needs_auth/needs_edit/needs_review/synced |
| form_data | object | YES | 観察、セル、ミッション、位置、精度、公開レベル |
| mission_snapshot | object | YES | ミッションID、版、安全情報、期限 |
| media | Blob[] | YES | EXIF除去・圧縮済み写真／音声 |
| media_manifest | object[] | YES | role、index、MIME、size、SHA-256、upload state |
| created_at / updated_at | ISO string | YES | 端末時刻 |
| attempt_count | number | YES | 再試行回数 |
| last_attempt_at / next_attempt_at | ISO string | NO | 再試行制御 |
| lease_owner / lease_expires_at | string / ISO string | NO | 多重送信・クラッシュ復旧 |
| server_post_id | uuid | NO | 受付確認後のみ |
| error_code | stable key | NO | i18n可能な機械判定 |

**マイグレーション:**

- 旧 `pending` は `draft` として移行し、ユーザー確認なしで自動送信しない。
- 旧 `sending` は `retry_wait` へ戻す。
- 新規フィールドがない旧レコードは削除せず、`needs_edit` として不足内容を案内する。
- upgrade失敗時は旧DBを消去せず、エクスポート／再試行導線を出す。

---

