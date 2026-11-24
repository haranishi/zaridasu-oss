## 背景

DB 側（PostgreSQL トリガー）が投げる業務例外を、クライアントが**日本語の自然言語文面**で識別している。同時に、その日本語メッセージが翻訳キーより優先して表示されるため、4 言語分の翻訳が一度も使われない。両者は同じ 1 本の構造問題（「エラー種別が機械可読なキーで表現されていない」）の表と裏である。

### 問題A: DBレートリミットの検出が SQL の日本語メッセージの部分一致に依存している — High

`src/hooks/posts/usePostForm.ts:385-387`:

```ts
// DB トリガーによるレートリミットエラーを検出（P0001 + 投稿上限キーワード）
// クライアント側の localStorage チェックをバイパスされた場合にここに到達する
if (typedErr.code === 'P0001' && typedErr.message?.includes('投稿上限')) {
```

送出元は `supabase/schema.sql:259-264`:

```sql
IF NEW.user_id IS NOT NULL THEN
  SELECT COUNT(*) INTO recent_count FROM posts
  WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '24 hours';
  IF recent_count >= 5 THEN
    RAISE EXCEPTION '24時間以内の投稿上限（5件）に達しました';
  END IF;
END IF;
```

TypeScript が SQL の**自然言語文面に文字列一致で依存**している。文言を 1 文字変える（英語化・言い換え・i18n 化・「上限」を「制限」に直す等）と分岐が静かに死に、`:388-393` の localStorage 上限同期が行われない。その結果、**以後もクライアント側の事前チェックをすり抜けて DB を叩き続ける**（クライアント側チェックは localStorage のタイムスタンプ列に依存しており、DB 側で弾かれたことを反映できなくなる）。型でもテストでも守られていない。

**同じ `schema.sql` に正しい前例が既にある**: `:1487` `RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';` / `:1490` `RAISE EXCEPTION 'invalid disclosure level: %', p_level USING ERRCODE = '22023';`（同型が `:1505`, `:1508` にも）。ERRCODE で分類する作法はこのリポジトリで既に確立しているのに、レートリミット系だけ文面依存のままである。

あわせて、制限値「5」が**独立した 3 箇所のリテラル**として存在する。

| 場所 | 表現 |
|---|---|
| `src/lib/constants.ts:438` | `export const SPAM_LIMIT_POSTS = 5 as const` |
| `supabase/schema.sql:262` | `IF recent_count >= 5 THEN` |
| `supabase/schema.sql:263` | メッセージ内の `（5件）` |

どれか 1 つを変えても他は追従せず、CI で検知されない。
