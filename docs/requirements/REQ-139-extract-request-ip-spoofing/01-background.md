## 背景

ザリダスは未ログインユーザーによる匿名投稿を許可しており、スパム/濫用を抑えるために `posts` テーブルへの INSERT に対して **IP 単位の rate limit** をかけている。具体的には:

- 1 分あたり 3 件
- 24 時間あたり 10 件

この IP は `supabase/migrations/20240101000000_initial_schema.sql` の `extract_request_ip()` 関数で取得されており、現在の実装は **HTTP リクエストヘッダー `x-forwarded-for` の先頭値を無条件で信頼**している。

```sql
CREATE OR REPLACE FUNCTION public.extract_request_ip() RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  headers JSONB := COALESCE(current_setting('request.headers', true)::jsonb, '{}'::jsonb);
  ip_header TEXT;
BEGIN
  ip_header := COALESCE(headers ->> 'x-forwarded-for', headers ->> 'x-real-ip', headers ->> 'cf-connecting-ip');
  IF ip_header IS NULL OR btrim(ip_header) = '' THEN RETURN NULL; END IF;
  RETURN btrim(split_part(ip_header, ',', 1));
END;
$$;
```

`x-forwarded-for` は **クライアントが自由に設定できるヘッダー**であり、Supabase エッジ（PostgREST）に届く時点で「攻撃者が指定した値, エッジが追記した実 IP」の形になる。`split_part(ip_header, ',', 1)` は**先頭**を取るため、攻撃者の指定値がそのまま採用される。結果として:

- 攻撃者は HTTP request の `X-Forwarded-For: 1.2.3.4` を毎回ランダム化することで、毎リクエスト「初回 IP」として認識される
- `posts` テーブルの 1 分 3 件 / 24 時間 10 件の制限を**無制限にバイパス**できる
- 匿名投稿スパムを大量送信可能（status=pending で滞留するが、admin の処理コストが青天井になる）

加えて `reporter_ip` カラムには偽装値がそのまま保存されるため:

- `audit_logs` の調査で誤った IP を追跡することになる
- IP ベースの BAN を仮に実装しても、攻撃者は次のリクエストで別 IP に偽装するため無効化される

Supabase / Cloudflare のエッジ環境では、**信頼可能な「真のクライアント IP」**として:

- `cf-connecting-ip` (Cloudflare 経由のみ。エッジが上書きするためクライアントの偽装値は捨てられる)
- `x-forwarded-for` の**末尾**（エッジが追記した値）

のいずれかを採用する必要がある。現状はその逆を行っており、最も信頼できない値を採用している。
