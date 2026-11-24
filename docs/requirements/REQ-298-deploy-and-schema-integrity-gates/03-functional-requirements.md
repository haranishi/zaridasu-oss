## 機能要件

- **FR-298-01（P0）**: `scripts/check-edge-deploy-lag.sh` の変更検出（`:192`）で、`supabase/functions/_shared/` に差分があれば **CHANGED を全関数へ展開する**。展開後に適用するのは `.deploy-ignore` の除外のみとする。`:211-219` の「CHANGED が空なら skip して exit 0」は `_shared` 展開後に評価されること（`_shared` 単独変更で skip されないこと）。

- **FR-298-02（P1）**: 未デプロイ検知に「**本番の関数 `updated_at` が `_shared/` の最終コミット時刻より古い**」比較を追加する。既存の deploy-lag（関数ディレクトリ自身の commit 時刻との比較）とは別条件として評価し、`MODE=main` では error、`MODE=pr` では warning とする。`_shared` の最終コミット時刻は `git log -1 --format=%cI -- supabase/functions/_shared/` で取得する（deploy-lag ジョブは `fetch-depth: 0` で checkout しているため取得可能）。

- **FR-298-03（P1）**: `scripts/check-migration-drift.sh` に**内容ドリフト検知**を追加する。
  - 本番クエリを `select version, name, statements from supabase_migrations.schema_migrations` に拡張する
  - `statements` を**正規化**（前後空白の削除、連続空白の1個化、行コメント `--` とブロックコメント `/* */` の除去、末尾セミコロンの正規化）したうえでハッシュ（sha256）を取り、リポジトリ側の `.sql` を同じ正規化規則でハッシュ化して突合する
  - 不一致は `MODE=main` では error、`MODE=pr` では warning とする
  - ベースライン3本（`20240101000000` / `000001` / `000002`）は既知の書き換え済みファイルであるため、**除外リストに理由付きで登録**する（`supabase/ci/migration-drift-ignore.txt` 仮）。除外は `.deploy-ignore` と同じく「理由コメント必須」の運用にする
  - `statements` の格納形式（配列か単一文字列か、`supabase db push` 経由と直接 psql 適用で差があるか）は実装前に本番の1行を実測して確認する（→ 要確認）

- **FR-298-04（P1）**: 乖離検知を本番デプロイのゲートにする。
  - 最低限、**migration-drift の (a) 方向（本番にあるがリポジトリに無い）**を `deploy` の `needs` に入る位置へ移す。現行は `edge-functions-deploy-lag` ジョブに相乗りしているため、ゲート対象にする判定だけを**別ジョブへ切り出す**（deploy-lag のような時刻ベースの flaky 要素を含まない、決定論的な判定のみをゲートにする）
  - 理想形として、`deploy` の前段に「**本番未適用 migration が 0件**」であることを確認するゲートを置く。0件でない場合はデプロイを止め、runbook の手動 `supabase db push` 手順へ誘導する
  - secrets 未設定時は既存方針どおり notice + exit 0 とし、fork PR などでCIを壊さない
  - ゲート化にあたり「どの判定を error でデプロイ阻止にするか」を明文化して `ci.yml` のコメントに残す（現行 `:469` の「情報系ジョブのため除外」を更新する）

- **FR-298-05（P1）**: 関数 EXECUTE の REVOKE を CI で再確定する。`supabase/ci/reapply-after-grants.txt` の**宣言ファイル方式を関数権限へ拡張**する。
  - 一括 GRANT ステップ（`ci.yml:274`）の後に、関数 EXECUTE の REVOKE を再適用する
  - 実装方式は (a) 該当 migration をこの宣言ファイルへ追記する、または (b) 関数 EXECUTE の REVOKE 専用の宣言ファイル（`supabase/ci/revoke-function-execute.sql` 仮）を新設して schema.sql の REVOKE と同期させる、のいずれかを選ぶ（→ 未確定事項2）
  - どちらの方式でも「schema.sql に REVOKE を追加したら宣言側にも追記する」運用ルールをファイル冒頭に明記する（既存 `reapply-after-grants.txt` の記述形式に合わせる）

- **FR-298-06（P1）**: 主要な SECURITY DEFINER 関数に pgTAP の権限 assertion を追加する。
  - 少なくとも `get_dormant_users` / `record_lifecycle_email` / `get_push_subscriptions_for_user` / `detect_ai_anomalies` について、`anon` が EXECUTE 権限を**持たない**ことを `function_privs_are` または `has_function_privilege` で検証する
  - schema.sql の REVOKE 行を1行削除すると、このテストが**落ちる**ことを確認する（ガードが実際に反応することの検証）

- **FR-298-07（P1）**: vault / pg_net のスタブを用意し、pg_net webhook ラッパ7本を CI で適用・検証する。
  - `supabase/ci/storage_stub.sql` と同方式で `supabase/ci/pgnet_vault_stub.sql`（仮）を新設する。`net.http_post` は実際にHTTPを投げず、呼び出し引数（url / headers / body）を検証用テーブルへ記録するスタブ実装にする
  - `rls-tests` ジョブで、スタブ適用後に `supabase/migrations/20260717000001_webhook_secret_headers.sql` を実適用する（storage RLS と同じ「実 migration から適用して定義のドリフトを防ぐ」方針）
  - pgTAP で最低限次を検証する:
    - Vault に secret がある場合、`private.edge_webhook_headers` の戻り値に `x-webhook-secret` が**載る**
    - Vault に secret が無い場合、**載らない**（かつ例外を投げず fail-soft である）
    - 各ラッパが呼ぶ URL のパス（`/functions/v1/<name>`）が、リポジトリの関数ディレクトリ名と一致する（REQ-285 FR-285-07 の突合をDB側から補完する）
  - スタブが本番の pg_net と挙動が違う点（非同期性・戻り値の request_id 等）は、スタブファイル冒頭に明記する

- **FR-298-08（P2）**: CI の PostgreSQL を **17** に統一する。`ci.yml:234` の pgTAP イメージを `FROM postgres:17` ＋ `postgresql-17-pgtap` に、`:307` の schema-drift サービスを `image: postgres:17` に変更する。psql クライアント（`postgresql-client-16`）と `pg_prove` の導入もバージョンを揃える。PG17 で通らない箇所が出た場合は、それ自体が「本番とCIの挙動差」の実測結果であるため、修正内容を記録する。

- **FR-298-09（P3）**: `supabase/config.toml` の seed 参照を実態に合わせる。空の `supabase/seed.sql` を置くか、`[db.seed] enabled = false` にする（→ 未確定事項3）。判断の理由を config.toml のコメントに残す。
