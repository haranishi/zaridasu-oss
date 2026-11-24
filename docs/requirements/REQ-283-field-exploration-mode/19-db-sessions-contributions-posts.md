### 8.3 テーブル: `field_sessions`

| カラム | 型 | NULL | 説明 |
|---|---|---:|---|
| id | uuid | NO | PK |
| mission_id | uuid | NO | field_missions FK |
| cell_id | uuid | NO | exploration_cells FK |
| user_id | uuid | NO | auth.users FK |
| state | text | NO | active/abandoned/submitted/approved/rejected |
| client_idempotency_key | uuid | NO | 二重作成防止 |
| started_at / completed_at | timestamptz | YES | 所要時間 |
| arrival_accuracy_m | numeric | YES | 到着精度 |
| arrival_distance_m | numeric | YES | 公開中心／集合地点との距離 |
| risk_flags | jsonb | NO | 不正リスク。本人へ詳細非表示 |
| post_id | uuid | YES | posts FK、提出後 |
| created_at / updated_at | timestamptz | NO | 監査用 |

**制約・インデックス:**

- UNIQUE `(user_id, client_idempotency_key)`
- UNIQUE `(post_id) WHERE post_id IS NOT NULL`
- ユーザーごとのactiveは部分UNIQUE
- `(mission_id, state, created_at)`

**RLS:**

- SELECT: 本人またはadmin
- INSERT: 本人、publishedミッションに限る
- UPDATE: 状態遷移RPC経由
- DELETE: 原則不可

### 8.4 テーブル: `cell_contributions`

承認済み投稿からセル進捗へ反映した事実を冪等に保持する。

| カラム | 型 | NULL | 説明 |
|---|---|---:|---|
| id | uuid | NO | PK |
| cell_id | uuid | NO | exploration_cells FK |
| post_id | uuid | NO | posts FK、UNIQUE |
| user_id | uuid | NO | auth.users FK |
| contribution_type | text | NO | presence/absence/revisit/first_fill |
| quality_score | integer | NO | 算出時品質 |
| calculation_version | integer | NO | 再現性 |
| approved_at | timestamptz | NO | 承認日時 |

**RLS:**

- 公開SELECTなし。公開値は集計RPCから返す。
- 本人は自分の貢献要約のみRPCで取得。
- INSERT/UPDATEは承認処理のみ。

### 8.5 既存 `posts` への追加

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---:|---|---|
| entry_mode | text | NO | `opportunistic` | opportunistic/field_mission |
| field_session_id | uuid | YES | - | field_sessions FK |
| field_evidence | jsonb | YES | - | 写真indexと役割、品質 |
| client_submission_id | uuid | YES | - | オフライン／再送の冪等キー |
| client_created_at | timestamptz | YES | - | 端末で送信を確定した時刻。信頼済み時刻ではない |

既存投稿はすべて `opportunistic` として扱い、回帰を起こさない。

**制約・インデックス:**

- UNIQUE `(user_id, client_submission_id) WHERE client_submission_id IS NOT NULL`
- 同一キーに異なる内容が来た場合は上書きせず409とする

