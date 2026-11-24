## デプロイ後検証

### 1. `UPDATED_AT` が今に近いことを確認

```bash
npx supabase functions list --project-ref edxmkqmjzbarjdgnkcvc
```

各関数の `UPDATED_AT` が **数分以内** になっていれば成功。古いまま残っている関数があれば、その関数を単体デプロイし直す。

### 2. ログで起動を確認

```bash
npx supabase functions logs <name> --project-ref edxmkqmjzbarjdgnkcvc --since 5m
```

deploy 直後の `boot` ログが見えれば OK。

### 3. 機能の疎通確認

REQ-127 のように Gemini との接続を変えた場合は、本番投稿を 1 件作って `posts.ai_result` が正しく更新されること、もしくは `/admin/posts` でレビューカードが期待通り表示されることを確認する。

`ai_call_logs` の最新レコードを確認するクエリ:

```sql
select id, function_name, status, error_kind, error_message, created_at
from ai_call_logs
order by created_at desc
limit 5;
```

新エラー種別（`gemini_truncated` / `gemini_safety`）が想定通り記録されることを 1 件以上目視確認する。

