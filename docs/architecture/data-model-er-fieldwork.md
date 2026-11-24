# 現地調査は、計画から地点、結果へと本人の表をたどる

[ER図の全体](data-model-er.md)のうち、非公開の現地調査・個人の場所・水域の情報提供を列つきで描く。
主キー(PK)・外部キー(FK)・一意(UK)と、役割の分かる列だけを載せる。全列は [schema.sql](../../supabase/schema.sql) を読む。

```mermaid
erDiagram
  auth_users["auth.users"] {
    uuid id PK
  }
  posts {
    uuid id PK
  }
  private_spots {
    uuid id PK
    uuid user_id FK
    text name
  }
  survey_plans {
    uuid id PK
    uuid user_id FK
    text title
    date planned_on
    text status
  }
  survey_plan_stops {
    uuid id PK
    uuid plan_id FK
    uuid user_id FK
    text source
    uuid source_id "外部キーなし。座標は複製"
    text status
  }
  survey_stop_posts {
    uuid stop_id PK, FK
    uuid post_id PK, FK
    uuid user_id FK
    text kind
  }
  rare_sightings {
    uuid id PK
    uuid user_id FK "(user_id, client_id)で一意"
    uuid stop_id FK
    uuid client_id "(user_id, client_id)で一意"
    text species_key
    timestamptz observed_at
  }
  water_reports {
    uuid id PK
    uuid user_id FK "(user_id, client_id)で一意"
    uuid published_water_body_id FK, UK
    uuid reviewed_by FK
    uuid client_id "(user_id, client_id)で一意"
    text status
  }
  community_water_bodies {
    uuid id PK
    text name
  }
  auth_users ||--o{ private_spots : "user_id / CASCADE"
  auth_users ||--o{ survey_plans : "user_id / CASCADE"
  survey_plans ||--o{ survey_plan_stops : "plan_id / CASCADE"
  auth_users ||--o{ survey_plan_stops : "user_id / CASCADE"
  survey_plan_stops ||--o{ survey_stop_posts : "stop_id / CASCADE"
  posts ||--o{ survey_stop_posts : "post_id / CASCADE"
  auth_users ||--o{ survey_stop_posts : "user_id / CASCADE"
  auth_users ||--o{ rare_sightings : "user_id / CASCADE"
  survey_plan_stops |o--o{ rare_sightings : "stop_id / SET NULL"
  auth_users ||--o{ water_reports : "user_id / CASCADE"
  community_water_bodies |o--o| water_reports : "published_water_body_id / NO ACTION"
  auth_users |o--o{ water_reports : "reviewed_by / SET NULL"
```

## 読むときの注意

- 計画を消すと地点も消える。地点を消すと、地点と投稿のリンク(`survey_stop_posts`)は消え、希少種(`rare_sightings`)は残って`stop_id`だけが空になる。
- `survey_plan_stops.source_id`は外部キーではない。元の場所の座標を複製して持つので、元を消しても計画は残る。
- `survey_stop_posts`の主キーは`(stop_id, post_id)`で、同じ地点に同じ投稿を2回結べない。
- `rare_sightings`は`posts`と結ばない。公開の投稿・写真・コメントの経路へ混ぜないため。`(user_id, client_id)`が一意で、端末からの再送が二重にならない。
- `water_reports.published_water_body_id`は一意で、公開表に載るまではnull。公開表の`community_water_bodies`は提出者・メモ・写真を持たない。
- 非公開の写真は表でなく、Storageの`rare-photos`・`water-report-photos`に置く。行を消しても写真の実体は消えない（[データモデル](data-model.md)）。
