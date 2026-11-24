## 受入基準

- **AC-01**: `supabase/functions/_shared/` の1ファイルだけを変更したコミットを main に置いた状態で `scripts/check-edge-deploy-lag.sh` を `MODE=main` で実行すると、**全関数が判定対象になり**、本番が古い場合に exit 1 する。skip の notice が出ない。
- **AC-02**: 本番の関数 `updated_at` が `_shared/` の最終コミット時刻より古い状態を作ると、`MODE=main` で error、`MODE=pr` で warning が出る。
- **AC-03**: 適用済み migration の `.sql` を「意味を変えずコメントと空白だけ」書き換えても検知されない（正規化が効いている）。一方、**SQL文を1つ追加または変更**すると `MODE=main` で exit 1 する。ベースライン3本は除外リストにより error にならず、除外理由がファイルに記載されている。
- **AC-04**: 「本番に適用済みだがリポジトリに無い migration」がある状態で main push すると、**`deploy` ジョブが実行されない（またはブロックされる）**。現行のように deploy が並行成功しない。
- **AC-05**: `schema.sql` の関数 REVOKE 行を1行削除して `rls-tests` を実行すると、pgTAP が**落ちる**。削除を戻すと通る。
- **AC-06**: `rls-tests` ジョブで pg_net webhook ラッパ7本が適用され、「Vault に secret がある時 `x-webhook-secret` が載る／無い時は載らず例外も出ない」を検証する pgTAP が通る。ラッパが参照する関数名がリポジトリの関数ディレクトリ名と一致することも検証される。
- **AC-07**: `rls-tests` / `schema-drift` の PostgreSQL が **17** で動作し、既存の pgTAP テストが全て通る。`supabase/config.toml:22` の宣言と一致している。
- **AC-08**: `supabase start`（またはローカルでの `supabase db reset`）がシード段階でエラー・警告を出さない。
- **AC-09**: secrets（`SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF`）が未設定の環境（fork PR 等）で、追加したチェックがいずれも notice を出して exit 0 する（CIを壊さない）。
- **AC-10**: `lint` / `type-check` / 既存652テストがパスする。

## 未確定事項（実装着手前に決める）

| # | 論点 | 選択肢 | 決定 |
|---|---|---|---|
| 1 | ゲート化する判定の範囲 | A. migration-drift の (a) 方向のみ / B. (a)+(b)+未デプロイ検知 / C. さらに内容ドリフトも含める | 未定 |
| 2 | 関数 EXECUTE の REVOKE 再確定方式 | A. `reapply-after-grants.txt` へ該当 migration を追記 / B. 専用の `revoke-function-execute.sql` を新設 | 未定 |
| 3 | seed.sql の扱い | A. 空ファイルを置く / B. `[db.seed] enabled = false` | 未定 |
| 4 | 内容ドリフト検知の除外リストの粒度 | A. ファイル単位の除外 / B. 「ハッシュ固定（このハッシュなら許容）」方式 | 未定 |
| 5 | 未デプロイ・乖離ゲートを別ジョブに切り出すか | A. `edge-functions-deploy-lag` に相乗りのまま `needs` を追加 / B. 決定論的判定のみ別ジョブへ分離 | 未定 |

## 要確認

- **`supabase_migrations.schema_migrations.statements` の実データ形式**: FR-298-03 は `statements` 列でのハッシュ突合を前提としているが、格納形式（`text[]` 配列か単一 text か、`supabase db push` と直接 psql 適用で差があるか、`--`コメントが保存されるか）は**本番の実データを1行取得して確認してから**実装する。形式が想定と違う場合は、代替として「リポジトリの `.sql` を正規化したハッシュを別テーブル（または migration のコメントヘッダ）に記録して突合する」方式へ切り替える。
- **PG17 への切り替えで既存 pgTAP が通るか**: FR-298-08 は未検証である。`postgresql-17-pgtap` パッケージの入手可否（Debian/Ubuntu の apt リポジトリ）と、PG17 での `schema.sql` 適用の成否を実測してから確定する。
- **pg_net スタブの忠実度**: `net.http_post` の非同期性（`net._http_response` への遅延書き込み）は CI では再現しない。スタブで検証できるのは「**どんな引数で呼ばれたか**」までであり、「実際に200が返るか」は本番でしか確認できない。この限界は REQ-285 FR-285-08（pg_net 失敗の可視化）が担う領域として切り分ける。
- **`_shared` 全関数展開のCI時間**: FR-298-01 により `_shared` 変更PRでは判定対象が12〜14関数になる。Management API 問い合わせ回数が増えるため、レート制限とジョブ時間（現行 `timeout-minutes: 15`）に収まるかを実装時に確認する。
