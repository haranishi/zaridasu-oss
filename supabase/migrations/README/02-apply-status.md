## ✅ 適用状況: 全 59 本 本番適用済み（2026-07-29 確認）

`20240101000000` 〜 `20260728000001` の **全 migration がリモート（本番）適用済み**であることを確認した（2026-07-29。本番 `supabase_migrations.schema_migrations` の実測 59 件 = リポジトリの .sql 59 本）。

> **2026-07-29 の是正（REQ-286）**: `20260728000001_drop_legacy_analyze_image_webhook.sql` は 2026-07-28 に `supabase db push` で本番へ適用済みだったが、**コミットされないまま残っていた**（git 管理下 58 本 / 本番 59 本）。同日にコミットし本索引へ追加した。以後この乖離は `scripts/check-migration-drift.sh`（CI）が自動検知する。

- かつて本節が警告していた `20260616000005_fix_reporter_ip_column_protection.sql`（reporter_ip 列保護の是正）も**適用済み**。`posts.reporter_ip`（投稿者 IP = PII）の露出は解消している。
- 以後、未適用 migration が発生した場合はこの節を復活させて明記し、`supabase db push` 後に再び本節へ戻すこと（適用状況はこの README ではなく `supabase migration list` が常に正）。

---
