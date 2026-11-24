## 背景

ザリダスではフロント・admin 双方で、ユーザー入力（検索キーワード）を Supabase / PostgREST のフィルタクエリに**文字列連結**で渡している。具体的には:

1. **公開検索（usePostList）**: トップページのキーワード検索で `comment` / `municipality` を `or()` 句で OR 検索
2. **Admin posts 検索**: `/admin/posts` のキーワードフィルタで `comment` を `ilike` 検索
3. **Admin comments 検索**: `/admin/comments` のキーワードフィルタで `content` を `ilike` 検索

このうち `.or()` 句は PostgREST のフィルタ DSL を文字列で組み立てる仕様で、**カンマ・括弧・ドット・パーセント・アンダースコア・バックスラッシュ**などが構文文字として解釈される。現在のコードはこれらを一切エスケープせずに `${filters.search}` を直接埋め込んでおり、悪意のあるユーザーが任意のフィルタを差し込める **PostgREST filter injection** に該当する。

攻撃例（公開検索）:

```
filters.search = `xxx),municipality.eq.abc,user_id.eq.uuid-of-admin`
```

これにより `or()` 句から抜け出して別カラムのフィルタを追加することが可能になる。RLS で `status = 'approved'` の posts のみ読めるとはいえ:

- 他カラム（`reporter_ip` / `user_id` 等の本来検索 UI から触らせない列）でのフィルタを実行できる
- `posts.user_id.eq.<UUID>` で特定ユーザーの投稿のみ抽出（プライバシー）
- 大量の `or` 連結を埋め込んで DoS（PostgREST のクエリパース負荷増大）

加えて `.ilike()` 単体の使用箇所も、`%` `_` のワイルドカードを無効化していないため:

- `filters.keyword = '%%%%%%%%%%%%%%%%%%%%%%'` のような入力で正規表現様 DoS
- `_` (任意 1 文字) を多用した pattern で trigram index を効かせない検索

ザリダスは admin 画面の検索 UI が `audit_logs` を生成するため、特に admin の filter injection は監査ログへの偽情報注入経路にもなり得る。
