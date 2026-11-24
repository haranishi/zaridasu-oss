## 運用ルール（厳守）

- **適用済み migration は統合・改名・削除しない。** 本番 DB の `supabase_migrations.schema_migrations` 履歴（適用済みバージョンの台帳）と不整合になり、以後の `db push` が壊れる。過去ファイルの中身も原則書き換えない（すでに適用された SQL を書き換えても本番には再実行されないため、ファイルと実体がずれるだけ）。
- **修正は「新しい migration を追加」で行う。** 既存の挙動を直したいときは、連番末尾に新しいファイルを足して上書き定義する（本リポジトリは `CREATE OR REPLACE` / `DROP ... IF EXISTS` / `IF NOT EXISTS` による**冪等**な追記スタイル。例: `protect_post_status()` は複数 migration で段階的に再定義されている）。
- **ファイル名は連番（`YYYYMMDDHHMMSS_説明.sql` 形式の昇順）末尾に追加する。** タイムスタンプが既存の最大値より後になるようにする（適用順＝ファイル名の辞書順）。
- **本番反映は `supabase db push`。** ローカル検証は `supabase db reset`（全 migration を頭から再適用）でも確認できる。CI でも migration 適用と RLS テスト（`supabase/tests/`）が走る。
- **秘密値はコミットしない。** service_role キー等は Vault / Supabase Dashboard Secrets にのみ置く。
- **🚫 Supabase ダッシュボードの Database Webhooks 機能を使わない（REQ-287 FR-287-07）。** DB トリガーは必ず migration で定義する。理由は 2 つある。(1) ダッシュボードで作ったトリガーは**リポジトリ管理外**になり、clone しても再現できず CI も検証しない。(2) 同機能は生成するトリガー定義に **`Authorization: Bearer <service_role JWT>` をリテラルで埋め込む**ため、`pg_get_triggerdef()` を読める者に秘密値が露出する。実際に 2026-07-28、この経路で作られた `analyze-image-on-insert` が発見され、Edge Function の二重起動と service_role キーの露出を招いた（`20260728000001` で削除済み）。pg_net から Edge Function を叩く場合は `private.call_ai_edge_function()` / `public.call_lifecycle_edge_function()` のように **Vault からキーを読むラッパ**を経由すること。

## 新規 migration 追加時のチェックリスト（REQ-282 C-3）

新しい migration を足したら、以下を同じ PR で満たす:

1. **本README索引に1行追記**（ファイル名・日付・目的・対応REQ・本番反映欄）。本数の集計表も更新。
2. **`supabase/schema.sql` を同期**（schema.sql は「migration の積み上げ結果＝確定スキーマ」。CI rls-tests / schema-drift は schema.sql を適用するため、ここに反映しないと新しい定義がテストされない）。
3. **列レベル REVOKE / 列保護トリガーを含むなら** `supabase/ci/reapply-after-grants.txt` に追記（Supabase 既定 GRANT の後に再適用が要る／REQ-282 C-2）。
4. **`supabase db push` を実施し、本README の本番反映欄を ✅ にする**（適用状況の正は常に `supabase migration list`）。
5. 破壊的・不可逆な操作（列削除・データ移行）は runbook 化を検討する。
6. **関数を足したら、実行権限を明示する（REQ-316）。** postgres が作る関数は、既定では匿名・ログイン済みから実行できない（`ALTER DEFAULT PRIVILEGES`）。画面や管理画面から呼ぶ関数は、`GRANT EXECUTE ON FUNCTION ... TO authenticated`（匿名にも見せてよいなら `anon` も）を同じ migration に書く。匿名に見せてよい SECURITY DEFINER 関数は、`supabase/tests/req316_function_execute_default_closed.sql` の許可リストに理由つきで足す（足さないと CI が落ちる）。
   - 拡張（`CREATE EXTENSION`）を後から入れたときも、既定が閉じているので、その関数に必要な EXECUTE を明示する。
   - DB テストの補助関数（`_set_jwt` など）も同じ。ログイン済み・匿名に切り替えた後で呼ぶなら、`GRANT EXECUTE ... TO PUBLIC` を添える。

## squash（初期化統合）について（REQ-282 C-4 判断記録）

**適用済み migration の squash / 統合 / 改名 / 削除は行わない**（本番 DB の `supabase_migrations.schema_migrations` 履歴と不整合になり、以後の `db push` が壊れる）。本数が多くても、履歴の追跡可能性（どの変更がいつ・なぜ入ったか）とセキュリティ監査の証跡を優先する。

将来どうしても baseline を作りたくなった場合の唯一安全な形は「**新規環境専用の baseline を別途用意し、既存本番の履歴テーブルは一切触らない**」方式に限る（既存環境には従来どおり増分 migration を流し続ける）。それでも運用が二系統に割れるコストが履歴短縮の利得を上回るため、現時点では **squash しない** を確定とする。日々の俯瞰は本 README の索引で足りる。

---
