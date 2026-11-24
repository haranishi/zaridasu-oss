# REQ-134: 本番 `audit_logs` の `admin_all_audit_logs` ポリシー残存（drift）の解消

## これは何か

REQ-020 で決めた「`audit_logs` は append-only（admin であっても UPDATE/DELETE 禁止）」が、本番のポリシー残存によって破られている問題の要件定義。本文は下記の部品ファイルに逐語のまま分割してある。

## 目的・背景の要約

repo 上の migration は `admin_all_audit_logs` を DROP し、`admin_read_audit_logs`（SELECT）と `admin_insert_audit_logs`（INSERT）の2本に分離している。しかし本番の `pg_policies` には `admin_all_audit_logs`（cmd=`ALL`）がいまだ共存している。

真因は **`supabase/schema.sql:343-346` に `CREATE POLICY "admin_all_audit_logs"` が残っていること**で、schema.sql ベースで `supabase db reset` するたびにポリシーが復活する構造になっている。この状態では admin JWT を持つ者（漏洩・内部不正の双方）が `DELETE FROM audit_logs` で証跡を消せるため、「誰がいつ何を削除したか」が追えなくなる。

## 主要な決定事項の要点

- **drift 源の除去と本番の是正を両方やる。** migration（`20260513000006_drop_admin_all_audit_logs.sql`）で本番のポリシーを落とし、あわせて **schema.sql 側の `CREATE POLICY` ブロックそのものを 2 本構成に置換**する。片方だけでは `db reset` で再発する。
- **migration は冪等に書く。** 想定外の別名ポリシー（`audit_logs_admin_all` 等）も列挙して DROP し、必要な 2 本は `duplicate_object` を握りつぶす `DO $$` ブロックで再作成する。
- **恒久的な invariant を CI に持たせる。** pg-tap で「`admin_all_audit_logs` が `pg_policies` に存在しない」「`cmd IN ('UPDATE','DELETE')` のポリシーが 0 本」を assert し、復活させる migration が入ったら PR をブロックする。
- **RLS deny はエラーにならず `0 rows affected` になる** PostgreSQL の仕様を前提にテストを書く。
- **既存の書き込み経路は壊れない。** `writeAuditLog` は `admin_insert_audit_logs` で許可されたまま、トリガー由来の INSERT と `get_audit_logs` RPC は `SECURITY DEFINER` で RLS をバイパスするため影響なし。
- **REQ-133（reports drift）とセットで対応する。** 監査ログ側の改竄経路を残したまま reports を直しても意味がない。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-and-problems.md](REQ-134-audit-logs-admin-all-policy-removal/01-background-and-problems.md) | 背景（drift の3つの疑い・schema.sql の該当SQL）と現状の問題（コード上の矛盾・攻撃シナリオ・関連 REQ） |
| [02-goals-and-functional-requirements.md](REQ-134-audit-logs-admin-all-policy-removal/02-goals-and-functional-requirements.md) | 目的3点と機能要件 FR-134-01〜03（migration 全文・schema.sql 置換内容・コメント整合） |
| [03-nfr-and-test-requirements.md](REQ-134-audit-logs-admin-all-policy-removal/03-nfr-and-test-requirements.md) | 非機能要件 NFR-134-01/02（冪等性・ロールバック容易性）とテスト要件 FR-134-04/05（pg-tap 7ケース・CI統合） |
| [04-acceptance-and-impact.md](REQ-134-audit-logs-admin-all-policy-removal/04-acceptance-and-impact.md) | 受入条件 AC-134-01〜07（Given/When/Then）と影響範囲（変更対象ファイル・他機能への影響） |
| [05-priority.md](REQ-134-audit-logs-admin-all-policy-removal/05-priority.md) | 優先度（緊急度・重要度とも Critical）と理由 |
