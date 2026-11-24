## 2. 現状の問題（実測値・2026-07-29）

### A. 🔴 本番適用済み migration が未コミット

| 観点 | 本数 |
|---|---:|
| git 管理下の migration（`git ls-files 'supabase/migrations/*.sql'`） | **58** |
| ローカル作業ツリー上の migration（`ls supabase/migrations/*.sql`） | **59** |
| 本番 `supabase_migrations.schema_migrations` の適用済み件数 | **59** |

未コミットの 1 本は `supabase/migrations/20260728000001_drop_legacy_analyze_image_webhook.sql`（本番の適用済み最新バージョン = `20260728000001`）。

`git status --porcelain` の未追跡ファイル:

```
?? docs/requirements/REQ-283-field-exploration-mode.md
?? docs/requirements/REQ-284-intro-story-modal-and-permanent-optout.md
?? supabase/migrations/20260728000001_drop_legacy_analyze_image_webhook.sql
```

（本要件と REQ-285 の文書も同様に未追跡で追加される。）

### B. 🟡 migration 索引が陳腐化している

`supabase/migrations/README.md`:

- `:3` — 「全 **58 本**」（実体は 59 本）
- `:18` — 「`20240101000000` 〜 `20260717000001` の全 migration がリモート（本番）適用済み（2026-07-18）」（本番の最新は `20260728000001`）
- 索引テーブル（`:146-152` 付近）の最終行は `20260717000001_webhook_secret_headers.sql`。`20260728000001` の行が無い

同 README の「新規 migration 追加時のチェックリスト（REQ-282 C-3）」は次の 4 点を同じ PR で満たすことを求めているが、**1・2・4 の記録が未履行**である（4 の `db push` 自体は実施済みだが、README の反映欄が更新されていない）。

1. 本 README 索引に 1 行追記・本数集計の更新 → **未実施**
2. `supabase/schema.sql` の同期 → **判定と記録が未実施**（後述 C のとおり実質は変更不要）
3. `supabase/ci/reapply-after-grants.txt` への追記（列 REVOKE / 列保護を含む場合）→ 該当なし
4. `db push` 実施と反映欄の ✅ 化 → **push は実施済み・README 反映欄は未更新**

### C. `schema.sql` は本件では変更不要（誤検知しないための記録）

`supabase/schema.sql` に旧トリガー `analyze-image-on-insert` は**存在しない**（grep 0 件）。当該トリガーは Supabase ダッシュボードで作られたリポジトリ管理外のオブジェクトであり、schema.sql に載っていたことが無いためである。したがって本 migration は「schema.sql との同期不要」が正しい判定である。

ただしチェックリスト上は「同期した／不要だった」のどちらであるかを**明示的に記録すべき**であり、それが無い現状は追跡不能である。

### D. `private` スキーマが schema.sql に含まれないのは設計どおり（欠陥ではない）

実測では `supabase/schema.sql` に `private.` の記述は 0 件であり、`edge_webhook_headers` / `trigger_analyze_image` / `trigger_enrich_place` も含まれない。これは**意図された方針**である。

`supabase/migrations/20260615000006_lifecycle_notifications.sql:534-535`:

> ※ migration 側にのみ定義（schema.sql 単独適用＝CI rls-tests では vault/pg_cron が無いため）。
> 既存 enrich-place / AI webhook と同じ「pg_net/cron トリガーは migration のみ」方針。

CI の `rls-tests` は `psql -f supabase/schema.sql` でスキーマを構築する（`.github/workflows/ci.yml:251`）ため、vault / pg_cron / pg_net を要する定義を schema.sql に入れると適用できない。方針として正しい。

**ただし帰結として、「DB のトリガーが参照する Edge Function が実在するか」を CI が検証できる範囲に無い。** これは REQ-285 で未デプロイ 7 本が長期間見逃された構造的背景であり、本要件の乖離検知（FR-286-04）を設計する際の制約として扱う。

### E. 乖離を検知する仕組みが無い

現在 CI にあるのは次の 2 つで、いずれも本件の故障モードを拾わない。

- `rls-tests` / `schema-drift`（`ci.yml:196-`, `:282-`）— schema.sql の**適用可能性と型生成**を検証する。「本番に何が適用されているか」は見ていない
- `check-edge-deploy-lag.sh` — Edge Function の話であり migration は対象外

「本番の `schema_migrations` に存在するバージョンが、リポジトリにファイルとして存在するか」を突合する経路は存在しない。

---
