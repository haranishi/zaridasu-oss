## `migration-gate` が赤いときの読み方

| CI のメッセージ | 意味 | 対処 |
|---|---|---|
| 本番に適用済みですが、リポジトリに存在しません | 本番へ直接当てた migration が未コミット | その `.sql` をリポジトリへコミットする。リポジトリから本番を再現できない状態なので最優先 |
| リポジトリにありますが本番未適用です | 上の手順 3 が未実施 | `supabase db push` する |
| 適用済み migration のファイルが後から書き換えられています | 適用済みの `.sql` を編集した（内容ドリフト） | 下記「絶対にやらないこと」を参照 |
| README の本数表記 N が実ファイル数 M と一致しません | 索引の更新漏れ | 手順 5 |

## 絶対にやらないこと: 適用済み migration ファイルの編集

**一度本番へ適用した `.sql` は編集しない。変更は必ず新しい migration で出す。**

version が同じだと `supabase db push` は二度と流さないので、ファイルを書き換えても本番には届かない。
その結果「リポジトリと `schema.sql` は新しい定義／本番だけ古い定義」という乖離が生まれ、
CI は `schema.sql` を適用してテストするので**緑のまま**になる。

これは実際に起きた。`20260513000014_protect_official_flag_service_role_bypass.sql` は REQ-208 の
修正時にファイルを直接書き換えられ、**本番だけ REQ-208 前の関数定義で動いていた**
（2026-08-03 に `pg_get_functiondef()` で実測して発覚。是正は `20260803000001`）。

2026-08-03 以降は `scripts/check-migration-drift.sh` の内容ドリフト検知がこの型を捕まえる。
本番の `supabase_migrations.schema_migrations.statements`（適用された SQL 本文）と
リポジトリの `.sql` を、コメントと空白を正規化したうえでハッシュ突合している。

## 関連

- `docs/runbooks/edge-function-deploy.md` — Edge Function 側のデプロイ順序
- `docs/runbooks/backup-restore.md` — 破壊的 migration の前に取るバックアップ
- `supabase/migrations/README.md` — migration 索引（本数表記を CI が検証）
- `scripts/check-migration-drift.sh` — 本ゲートの実装
