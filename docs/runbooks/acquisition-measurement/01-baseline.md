## 1. ベースライン（施策開始前のゼロ点）

`measured_on = 2026-07-29`（本番 Supabase `edxmkqmjzbarjdgnkcvc` の実測）。

| 指標 | 値 | 備考 |
|---|---:|---|
| 登録ユーザー（`auth.users`） | **9** | うちメール確認済み 9 |
| 投稿総数（`posts`） | **18** | 2026-07-28 にテスト投稿 33 件を削除した後の値 |
| 承認済み投稿 | **12** | |
| 投稿したことがあるユーザー | **3** | |
| **週次アクティブ投稿者数（WAC・直近7日）** | **1** | North Star Metric |
| 月次アクティブ投稿者数（直近30日） | 1 | |
| 調査依頼（`survey_requests`） | 1 | |
| コメント / いいね | 2 / 1 | |
| Web Push 購読 | 0 | 未稼働 |
| 最初の投稿 / 最新の投稿 | 2026-03-04 / 2026-07-26 | |

KGI: **2027-03-31 までに認証済み登録 1,000 人**（品質条件つき）。
North Star: **WAC**。

再取得するクエリ:

```sql
select
  (select count(*) from auth.users) as registered_users,
  (select count(*) from auth.users where email_confirmed_at is not null) as confirmed_users,
  (select count(*) from posts) as posts_total,
  (select count(*) from posts where status='approved') as posts_approved,
  (select count(distinct user_id) from posts where user_id is not null) as ever_posted_users,
  (select count(distinct user_id) from posts
     where created_at >= now() - interval '7 days' and user_id is not null) as wac_7d,
  (select count(distinct user_id) from posts
     where created_at >= now() - interval '30 days' and user_id is not null) as mac_30d,
  now()::date as measured_on;
```

> GA4 側の流入元別セッションはこの時点で**施策 URL が未配布のため実質ゼロ**。
> 初回の意味のある比較は、施策開始から 7 日後に行う。

---
