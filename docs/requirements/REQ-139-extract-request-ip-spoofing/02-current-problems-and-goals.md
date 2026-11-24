## 現状の問題

### コード

- `supabase/migrations/20240101000000_initial_schema.sql:224-233` — `extract_request_ip()` の本体。`x-forwarded-for` の先頭を信用。
- `supabase/migrations/20240101000000_initial_schema.sql:259-294` — `check_post_rate_limit()` がこの関数を呼び、`reporter_ip` で COUNT する。
- `supabase/migrations/20240101000000_initial_schema.sql:250-257` — `set_post_reporter_ip()` が INSERT 時に `reporter_ip` をセット。

### データ

- `posts.reporter_ip` (`:77`)、`audit_logs.reporter_ip` (`:126`) に偽装値が混入し得る。既存データに無効値が含まれている可能性あり。

### 攻撃シナリオ（既に成立可能）

```bash
for i in $(seq 1 100); do
  curl -X POST "$SUPABASE_URL/rest/v1/posts" \
    -H "apikey: $ANON_KEY" \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 192.0.2.$((RANDOM % 254))" \
    -d '{"lat":40,"lng":140,"species":"a","info_type":"observation",...}'
done
```

毎リクエストで `reporter_ip` が異なるため、1 分 3 件 / 24 時間 10 件の制限はすべて初回扱いで通過する。

### 既存テスト

- pg-tap テスト (`supabase/tests/`) で rate limit のテストはあるが、IP 偽装シナリオを意識したテストはない（`set_config('request.headers', ...)` で固定 IP を指定する形）。

## 目的

1. クライアントが偽装可能なヘッダーを信頼せず、エッジが上書きする値を採用する
2. 匿名投稿の rate limit (1 分 3 件 / 24 時間 10 件) を IP 偽装で回避不能にする
3. 中期的には匿名投稿廃止（認証必須化）の選択肢も用意する
4. 既存 `reporter_ip` データの取り扱い方針を明確化する
