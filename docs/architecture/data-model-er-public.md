# 公開の記録は投稿に集まり、反応・通報・調査依頼が結び付く

[ER図の全体](data-model-er.md)のうち、公開の投稿と、それに結び付く表を列つきで描く。
主キー(PK)・外部キー(FK)・一意(UK)と、役割の分かる列だけを載せる。全列は [schema.sql](../../supabase/schema.sql) を読む。

```mermaid
erDiagram
  auth_users["auth.users"] {
    uuid id PK
  }
  posts {
    uuid id PK
    uuid user_id FK
    uuid reviewed_by FK
    uuid survey_request_id FK
    uuid survey_site_id FK
    text species
    text info_type
    boolean is_anonymous
    text location_disclosure
    text status
    boolean auto_approved
  }
  post_hidden_geo {
    uuid post_id PK, FK
    text locality
    text water_body
  }
  comments {
    uuid id PK
    uuid post_id FK
    uuid user_id FK
    boolean is_admin
  }
  likes {
    uuid id PK
    uuid post_id FK "(post_id, user_id)で一意"
    uuid user_id FK "(post_id, user_id)で一意"
  }
  reports {
    uuid id PK
    uuid post_id FK
    text reason
    boolean resolved
  }
  survey_requests {
    uuid id PK
    uuid user_id FK
    text species
    text urgency
    text status
  }
  survey_request_responses {
    uuid id PK
    uuid request_id FK "(request_id, user_id)で一意"
    uuid user_id FK "(request_id, user_id)で一意"
  }
  survey_request_comments {
    uuid id PK
    uuid request_id FK
    uuid user_id FK
    timestamptz deleted_at
  }
  survey_sites {
    uuid id PK
    uuid user_id FK
    text name
  }
  auth_users |o--o{ posts : "user_id / SET NULL"
  auth_users |o--o{ posts : "reviewed_by / NO ACTION"
  survey_requests |o--o{ posts : "survey_request_id / SET NULL"
  survey_sites |o--o{ posts : "survey_site_id / SET NULL"
  posts ||--o{ reports : "post_id / CASCADE"
  posts ||--o{ comments : "post_id / CASCADE"
  auth_users |o--o{ comments : "user_id / CASCADE"
  posts ||--o{ likes : "post_id / CASCADE"
  auth_users ||--o{ likes : "user_id / CASCADE"
  auth_users ||--o{ survey_requests : "user_id / CASCADE"
  auth_users ||--o{ survey_sites : "user_id / CASCADE"
  posts ||--o| post_hidden_geo : "post_id / CASCADE"
  survey_requests ||--o{ survey_request_responses : "request_id / CASCADE"
  auth_users ||--o{ survey_request_responses : "user_id / CASCADE"
  survey_requests ||--o{ survey_request_comments : "request_id / CASCADE"
  auth_users ||--o{ survey_request_comments : "user_id / CASCADE"
```

## 読むときの注意

- `posts.user_id`は匿名投稿のためnullを許す。`is_anonymous`がfalseなら`user_id`は必須（CHECK `chk_user_id_required`）。
- `posts.survey_request_id`は調査依頼への結果投稿、`survey_site_id`は本人の定点を指す。どちらも親を消すと空になるだけで、投稿は残る。
- `likes`は同じ利用者が同じ投稿に1回だけ、`survey_request_responses`は同じ利用者が同じ依頼に1回だけ結べる。
- `reports`は利用者に結び付かず、`reporter_ip`だけを持つ。
- `post_hidden_geo`は投稿1件につき0か1行で、位置を非公開にした投稿の細かな地名を退避する。
- 誰が何を読めるかは、図ではなく [認可](authorization.md) で決まる。
