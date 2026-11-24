# 設計

要件は [requirements.md](requirements.md)。作業は3つの変更（DB・Edge Functions・アプリとCI）に分け、PRも分ける。

## 前提

ブラウザはSupabaseのAPI（PostgREST・Storage・Auth）を直接呼ぶ。Next.js経由のAPIは `/api/og` と `/api/nearby-water` だけ。だから防御線は、RLS・テーブルと列の権限・SECURITY DEFINER関数の実行権限・Storageのポリシー・Edge Functionの認証になる。公開キー（anon）は誰でも持てる前提で考える。

## DB（要件1〜6、9の表）

migrationは追記のみで、冪等にする。本番の実状態が見えないので、関数は `to_regprocedure` で存在を確かめ、無ければ飛ばす。たとえば `get_audit_logs` は、引数5つの古い版が本番にだけ残っている疑いがある（REQ-316）が、手元には6つの版しかない。制約も名前を決め打ちせず、カタログから探す。

**権限（要件1）。** 4つに分けて、`REVOKE ... FROM PUBLIC` を必ず先に打つ（`FROM anon` だけではPUBLIC経由で実行できる）。

| 区分 | 関数 | 付与 |
|---|---|---|
| 内部専用 | 週次ダイジェストの宛先と集計、配信停止率、購読の無効化と掃除、全員分の再計算、IP取得、`req_is_admin`、`_kpi_assert_admin`、`private.call_ai_edge_function` | service_roleのみ |
| 管理者・本人用 | 管理画面のKPI・監査・ユーザー管理・位置の公開レベル、`delete_own_account`、`get_my_post_location` ほか | authenticated＋service_role |
| 公開が仕様 | `get_user_*` 6本、`apply_unsubscribe`、`resolve_unsubscribe_token`、`get_my_experiment_variants`（未ログインは空を返す） | anon＋authenticated＋service_role |
| 上記以外 | 最後に掃き出し、PUBLICとanonから外す。外した名前をNOTICEに出す | authenticatedは現状維持 |

既定の権限は `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` で、PUBLICと、`public` スキーマのanon・authenticatedへの自動付与を外す。`schema.sql` の旧行（`IN SCHEMA public ... FROM PUBLIC`）は動いていなかった（REQ-298の実測）ので置き換える。
CIは、Supabaseの既定の付与（一括GRANTと、既定権限へのGRANT）をまねた後でこのmigrationを当てる。許可リストのテストは、その最終状態を調べる。トリガー関数は直接呼べないので対象外。

**NULLの素通り（要件2）。** `get_user_progress` と `get_user_collection` の `v_is_owner` を `COALESCE(..., false)` にする。同型の書き方（`IF NOT v_x`）は全関数を検索して、この2本だけだった。

**日時（要件3）。** 1本のトリガー関数 `pin_created_at_on_client_write` を、10表に `BEFORE INSERT OR UPDATE` で付ける。実行者が `anon`・`authenticated` かつ管理者でないときだけ、INSERTは `now()`、UPDATEは旧値に戻す。SECURITY INVOKERにして、`current_user` で本当の実行者を見る。トリガー名は `aaa_` で始め、他のトリガーより先に動かす。
削除してから作り直すと枠が戻る点は、この変更では塞がない（既知の限界。AIの呼び出しは別に上限がある）。

**配信停止トークン（要件4）。** テーブルのSELECT権限を外し、`unsubscribe_token` 以外の全列に列単位で付け直す（列はカタログから組み立てる）。画面は `*` で読んでいない。CIの一括GRANTが打ち消すので、`reapply-after-grants.txt` に足す。トークンの再発行はしない（brief）。

**退会（要件5）。** `protect_post_status` は、旧い持ち主が `auth.users` からもう消えているときだけ、`user_id` のNULL化を通す。それ以外は従来どおり旧値に戻す。`audit_logs.admin_id` の外部キーは `ON DELETE SET NULL` に変える。

**INSERT（要件6）。** `protect_post_insert_columns` の最新の定義に、3列の初期化を足す。

**コメント通知（要件9）。** `comment_notification_claims`（コメントIDが主キー、RLSあり・ポリシーなし、service_roleだけ）を足す。

## Edge Functions（要件7〜9）

- `aggregateResults`：失敗した写真があれば `is_appropriate` を不明（null）にして自動承認に進ませない。`failed_count` を結果に残す。
- ハッシュ：流用の前に、現在の投稿の写真をサーバーが取得してSHA-256を比べる。流用元は、`ai_result` に検証済みの印がある投稿だけ。分析時に原本を取得できたときだけ、印を付ける。
- 取得：`_shared/mediaFetch.ts` に、URLの検査・`redirect: 'error'`・逐次読みと上限を集める。ホストは `SUPABASE_URL`（追加は `AI_MEDIA_ALLOWED_HOSTS`）に限る。
- `notify-comment`：先に `comment_notification_claims` へ挿入し、重複なら送らない。送信に失敗したら行を消す。表が無い・その他の失敗では送らない（安全側）。

## アプリとCI（要件10・11）

編集の写真は新規投稿と同じ「原本のままなら拒否」を共通化する。削除は音声とAI縮小版のパスを集めて消す。非公開スポットの待ち行列は、ログアウトの確認と退会の処理に組み込む。画像のホストは `NEXT_PUBLIC_SUPABASE_URL` から作る。バックアップの既定に2バケットを足し、tarは作業フォルダ内に作ってtrapで消す。Vercel CLIは、直近の成功デプロイが使った版に固定する。

## テスト

DB：`req316_function_execute_default_closed`、`rls_created_at_pinned`、`rls_private_profile_anon`、`rls_unsubscribe_token_column`、`rls_account_deletion`、`rls_post_insert_ops_columns`。直す前の失敗を確かめる。
Edge：`aggregateResults`・ハッシュ検証・メディア取得・通知の請求の単体テスト。アプリ：編集・削除・待ち行列の単体テスト。

## 戻し方

DBはmigrationを足す形なので、戻すには逆向きのmigrationを足す。権限の変更だけを戻すなら、該当関数に `GRANT EXECUTE` を打つ。コードはPRのrevert。
