# Supabase migrations 一覧（ザリダス）

> 対象: `supabase/migrations/*.sql` 全 **74 本**（読み取り専用の索引）
> 目的: 本番適用済みの migration 群を時系列で俯瞰し、各ファイルの目的・対応 REQ・主な変更・本番反映状況を一望できるようにする
> 関連: `supabase/schema.sql`（最新の確定スキーマ＝migration の積み上げ結果）/ `docs/runbooks/supabase-hardening-checklist.md`（最小権限・本番設定）/ `docs/requirements/`（REQ 現況台帳＝各インデックス文書）
> 最終更新: 2026-10-21（security-hardening の7本を追加。67本は本番に適用済み、7本は未適用）

---

## 主要な決定事項（要点）

- **本当の防御線は DB にある**。anon キーでブラウザから PostgREST を直接叩くクライアント直結構成なので、RLS・列 REVOKE・列固定トリガーが中核。だから migration の本数が多い。
- **適用済み migration は統合・改名・削除・書き換えをしない**。本番の `supabase_migrations.schema_migrations` 履歴と不整合になり、以後の `db push` が壊れる。
- **修正は連番末尾に新しい migration を足して上書き定義する**（`CREATE OR REPLACE` / `IF EXISTS` / `IF NOT EXISTS` による冪等な追記スタイル）。
- **squash（初期化統合）はしない**（REQ-282 C-4 で確定）。履歴の追跡可能性とセキュリティ監査の証跡を優先する。
- **🚫 Supabase ダッシュボードの Database Webhooks 機能を使わない**（REQ-287 FR-287-07）。リポジトリ管理外になるうえ、トリガー定義に service_role JWT がリテラルで埋め込まれる。実際に事故が起きている。
- **2026-10-21 に security-hardening の7本（`20261021120000`〜`20261021120600`）を追加した。本番には未適用。** main へのリリース前に `supabase db push --linked` が要る（migration-gate が main への push で未適用を error にする）。
- **適用状況の正は常に `supabase migration list`**。この索引はスナップショット。2026-10-03にREQ-316（一部）とREQ-330を本番へ増分適用。migration-gateと同じ確認で全66本の内容一致・未適用0本を確認した。2026-10-09に水域の情報提供（`20261008100350`）を `supabase db push --linked` で増分適用し、`supabase migration list --linked` で全67本が本番に記録されたことを確認した。
- **from-scratch 再適用（`supabase db reset`）は 2 本目で失敗する既知課題がある**。本番は増分適用で正しく構築済み。是正は REQ-281 FR-281-01 へ。
- **適用順はファイル名の辞書順**。表の「日付」列は参考の実装時期であり、前後している行がある。

## 内訳

- [これは何か / なぜやるか](README/01-purpose.md): クライアント直結構成と、この索引を置く理由
- [適用状況](README/02-apply-status.md): 2026-07-29 の確認結果と、コミット漏れ（REQ-286）の是正記録
- [運用ルール・追加時チェックリスト・squash 判断](README/03-operating-rules.md): 厳守事項 6 点、新規 migration の PR で満たすこと 5 点、squash しない理由
- [一覧: 基盤〜2026-05](README/04-list-2024-to-2026-05.md): 初期スキーマ、初期バグ修正、AI 判定基盤、調査依頼機能、AI 障害追跡（from-scratch 再適用性の既知課題つき）
- [一覧: 2026-06 以降](README/05-list-2026-06-onward.md): 卒研の実験/多様性/構造化調査、セキュリティ・リテンション・本番ハードニング、調査計画と希少種の非公開記録
- [本番適用状況サマリー](README/06-apply-status-summary.md): 適用済み / 未適用 / 合計の本数
