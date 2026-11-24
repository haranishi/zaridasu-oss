## 本番適用状況サマリー

| 区分 | 本数 |
|---|---|
| 適用済み（✅） | **67** |
| 未適用 | **7** |
| 合計 | **74** |

- 2026-10-21 に security-hardening の7本（`20261021120000`〜`20261021120600`）を追加した。**本番には未適用**。main へのリリース前に `supabase db push --linked`（先に `--dry-run` で対象が7本だけと確認）が要る。migration-gate は main への push で未適用を error にする。
- 適用状況の正は常に `supabase migration list`。2026-10-03にREQ-316（一部）とREQ-330を本番適用。`MODE=main UNAPPLIED_SEVERITY=error` のmigration-drift確認で全66本の内容一致・未適用0本を確認。`db push --dry-run` も適用予定なし。
- 2026-06-17 時点で警告していた `20260616000005`（reporter_ip 列保護）の未適用は解消済み（適用確認: 2026-07-18）。

- 2026-10-09 に `20261008100350_water_discovery_reports.sql`（水域の情報提供）を本番へ増分適用した（`supabase db push --linked`。適用前に `--dry-run` で対象がこの1本だけと確認）。`supabase migration list --linked` で全67本が本番に記録されていることを確認し、本番の表・RLS・ポリシー・非公開の写真置き場・実行権限を読み取りで確認した。migration-drift の内容突合（`MODE=main`）は、トークンが必要なため未実施。
- 画面（フロントエンド）の公開は、main へのリリース PR で別に行う。
