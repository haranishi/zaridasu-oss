## つまずきポイント

- **service_role / SQL Editor は RLS を素通りする**: 「SQL Editor で見えた = 危険」ではない。実露出は anon キー確認（C-4）で判定。service_role キーはフロント/ログに絶対置かない。
- **`has_column_privilege` の罠**: テーブル単位の `GRANT SELECT` があると列 REVOKE があっても `has_column_privilege` は true を返し得る（列 REVOKE は列固有 grant のみ除去）。列保護（reporter_ip 等）の検証はテーブル grant の構成に依存するため、本番の実 grant（`information_schema.role_table_grants` / `\dp`）で確認する。
- **ALTER DEFAULT PRIVILEGES は遡及しない**: 既存オブジェクトには効かず「以後この文を実行したロールが作る」分にのみ作用する。既存関数の PUBLIC EXECUTE は migration の明示 REVOKE で剥がしている。
- **Rerun 忘れ**: 修正後に Advisor を Rerun しないと古い警告が残って見える。必ず再実行して 0 件を確認。
- **UI の名前・位置は変わる**: SSL / Network Restrictions / Exposed schemas / Advisor のメニューはアップデートで動く。本文の「要確認」は実画面表記を優先。

---

## 参考

- Supabase — Production Checklist: https://supabase.com/docs/guides/platform/going-into-prod （確認日: 2026-06-16）
- Supabase — Database Advisors（Security Advisor / Splinter）: https://supabase.com/docs/guides/database/database-advisors （確認日: 2026-06-16）
- Supabase — Hardening the Data API（Exposed schemas / Data API 無効化）: https://supabase.com/docs/guides/database/hardening-data-api （確認日: 2026-06-16）
- Supabase — Network Restrictions: https://supabase.com/docs/guides/platform/network-restrictions （確認日: 2026-06-16）
- Supabase — SSL Enforcement: https://supabase.com/docs/guides/platform/ssl-enforcement （確認日: 2026-06-16）
- Supabase Splinter — lint 一覧: https://supabase.github.io/splinter/ （確認日: 2026-06-16）
- PostgreSQL — GRANT / `ALTER DEFAULT PRIVILEGES`: https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html （確認日: 2026-06-16）
- 社内: `docs/requirements/REQ-221-supabase-production-hardening.md` / Obsidian `02_notes/Security_Research/runbooks/Supabase_RLS監査手順.md`
