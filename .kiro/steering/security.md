# セキュリティ方針

更新日：2026-10-21。経緯と調査の記録は [security-hardening](../specs/security-hardening/brief.md)。現在の挙動の正本は [docs/current/privacy.md](../../docs/current/privacy.md)。

## 防御線はどこにあるか

ブラウザは Supabase の API（PostgREST・Storage・Auth）を直接呼ぶ。Next.js 経由の API は `/api/og` と `/api/nearby-water` だけ。だから守るのは、アプリの画面ではなく、RLS・テーブルと列の権限・DB 関数の実行権限・Storage のポリシー・Edge Function の認証になる。公開キー（anon）は誰でも持っている前提で考える。

## 守る規則

1. **関数は既定で閉じる。** 作った関数は、明示の `GRANT` が無ければ匿名・ログイン済みから実行できない。匿名に見せてよい SECURITY DEFINER 関数は、テストの許可リストに理由つきで足す。`REVOKE ... FROM anon` だけでは PUBLIC 経由で実行できるので、`FROM PUBLIC` を先に打つ。
2. **申告された値を信じない。** `created_at`・画像のハッシュ・画像や音声の URL は、ブラウザが書ける。回数制限は受付時刻で数え、判定の流用はサーバーが原本から計算したハッシュだけで行い、サーバーが取得する URL は自分の Storage に限る。
3. **NULL は「拒否」に畳む。** 未ログインでは `auth.uid()` が NULL になり、`IF NOT v_xxx` や `<> 'admin'` は素通りする。比較は `COALESCE(..., false)` か `IS DISTINCT FROM` で書く。
4. **位置と写真は、出口を数える。** 希少種の生息地は、公開の画面・集計・データセット・Storage のどこから漏れても採集圧になる。新しい出口（API・集計・書き出し）を足すときは、非公開のデータが混ざらないことをテストで確かめる。
5. **ユーザーが書ける列に、運用の値を置かない。** 承認の状態・AI の結果・研究採用・失敗回数は、INSERT でも UPDATE でも一般ユーザーから守る（保護トリガー）。
6. **秘密は URL にも置かない。** 配信停止トークンのように、持っているだけで操作できる値は、列の権限で隠す。公開の列にしたい値だけを `GRANT SELECT (列)` で足す。

## 公開前に必ず通る検査（落ちる理由）

| 検査 | 守るもの | 場所 |
|---|---|---|
| 関数の実行権限の許可リスト | 規則1 | `supabase/tests/req316_function_execute_default_closed.sql` |
| 非公開テーブルに触れる関数の許可リスト | 規則4 | `npm run private-tables:check` |
| 回数制限と `created_at` の固定 | 規則2 | `supabase/tests/rls_created_at_pinned.sql` |
| 匿名・本人・他人の返し分け | 規則3 | `supabase/tests/rls_private_profile_anon.sql` |
| 秘密情報の走査 | 規則6 | `npm run secrets:scan`（試験ファイルも対象） |
| 依存の脆弱性（本番依存の high 以上） | — | `npm run audit` |

DB の検査は CI の `rls-tests` と同じ手順で動く。手元に Postgres が無いときは、CI を唯一の門番として見る（`docs/architecture/operations-ci.md`）。

## 新しい機能を足すときの問い

- ブラウザが直接書ける列に、信用してはいけない値は無いか。
- 未ログインで呼ばれたとき、何を返すか（0 行・空・エラー）。
- 新しい関数・テーブル・バケットは、誰に読ませ、誰に書かせるか。`GRANT` に書いたか。
- 退会したとき、その人のデータは何が消え、何が残るか。公開 URL にその人の UID が残らないか。
- 失敗したとき、安全な側（送らない・承認しない・公開しない）に倒れるか。

## 判断待ち

[brief.md](../specs/security-hardening/brief.md) の「本人の判断が要るもの」を参照。未決のまま実装しない。
