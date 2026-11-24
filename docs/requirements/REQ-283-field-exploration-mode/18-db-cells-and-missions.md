## 8. データモデル・DB設計

### 8.1 テーブル: `exploration_cells`

投稿の生座標とは分離した、一般公開用の探索単位。

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---:|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| cell_key | text | NO | - | 安定したセル識別子 |
| municipality | text | NO | - | 市町村 |
| center_lat | decimal(8,5) | NO | - | 公開用粗化中心 |
| center_lng | decimal(8,5) | NO | - | 公開用粗化中心 |
| min_lat / max_lat | decimal(8,5) | NO | - | MVP矩形境界 |
| min_lng / max_lng | decimal(8,5) | NO | - | MVP矩形境界 |
| state | text | NO | `unexplored` | 公開状態 |
| access_level | text | NO | `restricted` | public/restricted/hidden |
| safety_status | text | NO | `pending` | pending/approved/suspended |
| priority_score | integer | NO | 0 | 推薦優先度 |
| last_verified_at | timestamptz | YES | - | 最終承認記録 |
| last_absence_survey_at | timestamptz | YES | - | 最終有効不在確認 |
| confidence_band | text | NO | `unknown` | low/medium/high/unknown |
| safe_access_note | text | YES | - | 公開歩道等の説明 |
| daylight_only | boolean | NO | true | 日中限定 |
| created_at / updated_at | timestamptz | NO | now() | 監査用 |

**インデックス:**

- UNIQUE `cell_key`
- `(municipality, state, safety_status)`
- `(min_lat, max_lat, min_lng, max_lng)`
- `(priority_score DESC) WHERE safety_status='approved'`

**RLS:**

- SELECT: `access_level='public' AND safety_status='approved'` の公開投影
- 正本テーブルの書込: adminのみ
- rawな関連投稿は公開テーブルから辿れない

### 8.2 テーブル: `field_missions`

| カラム | 型 | NULL | 説明 |
|---|---|---:|---|
| id | uuid | NO | PK |
| cell_id | uuid | NO | exploration_cells FK |
| title | text | NO | ミッション名 |
| mission_type | text | NO | new/revisit/absence/event |
| status | text | NO | draft/published/suspended/ended |
| species | text | YES | 対象種 |
| starts_at / ends_at | timestamptz | YES | 公開期間 |
| estimated_minutes | integer | NO | 所要時間 |
| difficulty | text | NO | easy/standard/advanced |
| arrival_radius_m | integer | NO | 既定50 |
| required_evidence | jsonb | NO | 写真役割 |
| min_survey_minutes | integer | NO | 不在確認等 |
| reward_preview_xp | integer | NO | 見込み |
| safety_notes | jsonb | NO | 安全表示 |
| created_by | uuid | NO | admin |
| created_at / updated_at | timestamptz | NO | 監査用 |

**RLS:**

- 公開SELECT: publishedかつ期間内、安全セルのみ
- INSERT/UPDATE/DELETE: adminのみ

