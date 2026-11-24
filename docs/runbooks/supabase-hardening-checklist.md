# Supabase 本番ハードニング チェックリスト

> 参照要件: REQ-221（Supabase 本番ハードニング）
> 関連: REQ-217（バックアップ/BCP・PITR の主管）, REQ-219（メール認証 SPF/DKIM/DMARC の主管）, REQ-180 / REQ-210（CI 品質ゲートの主管）
> 関連 Obsidian: `02_notes/Security_Research/runbooks/Supabase_RLS監査手順.md` / `09_Supabase_Security` / `11_Database_Hardening`
> 所要時間: 初回 30〜45 分 / 定期点検（リリース前）10〜15 分

---

## これは何か / なぜやるか

ザリダスは anon（publishable）キーでブラウザから PostgREST を直接叩く **クライアント直結** 構成で、「本当の防御線はアプリではなく DB / プロジェクト設定」にある。RLS・列 REVOKE・列固定トリガー（既存 REQ）でカバーされる「行/列/トリガー」の防御に対し、本チェックリストはその **一段外（プロジェクト設定）** と **一段下（最小権限の土台）** と **恒常運用（Security Advisor 検知ゼロ）** を担う。

**コードで閉じた分（自動・再現可能）と、ダッシュボードでしか設定できない分（人手・本チェックリストで追跡）** を分けて管理する。秘密値（project ref / DB パスワード / service_role キー / 許可 IP の生値）は本書に書かない。「設定場所」と「設定済みか」だけを記録する（NFR-221-04）。

---

## 使い方（リリース前の流れ）

1. A（コードで閉じた分）を CI/ローカルで確認 → 2. B（ダッシュボード設定）を点検 → 3. C（Security Advisor を Rerun して検知ゼロ）→ 4. 点検チェック表に「済/未」と日付を記録する。
2. REQ-244 / REQ-241 / REQ-292 の各節は、それぞれの改修に伴って**恒常的に守るべきルールと訂正記録**。該当する変更（`posts` への列追加、anon 公開 RPC の追加など）をするときは必ず読む。

## 主要な決定事項（要点）

- 防御の主管は **DB とプロジェクト設定**。アプリ側の対策を「受容根拠」にしない。
- コード化できる分は migration に入れる。**安全確証が持てない GRANT 剥奪はコード化せず手動点検に残す**（C-3）。
- Supabase の**既定 GRANT は schema/migration の後に効く**ため、`schema.sql` の REVOKE だけでは live DB に効かない。migration で再 REVOKE して確定する。
- 「別経路でも同じ情報が漏れる」ことは、制限の無い経路を残してよい理由にならない（REQ-292 の教訓）。

## 各部品

- [01-code-closed.md](./supabase-hardening-checklist/01-code-closed.md) — A. コードで既に閉じた分（最小権限の土台・`search_path` 固定・ビュー invoker・権限昇格バグ修正・内部テーブル GRANT 剥奪）と、その検証コマンド。
- [02-dashboard-manual-settings.md](./supabase-hardening-checklist/02-dashboard-manual-settings.md) — B. ダッシュボードでしか設定できない分（SSL Enforcement / Network Restrictions / MFA・Owner 冗長化 / PITR / 本番 SMTP / Exposed schemas）。
- [03-security-advisor.md](./supabase-hardening-checklist/03-security-advisor.md) — C. Security Advisor（Splinter）を検知ゼロで運用する手順。lint slug の読み方、acknowledge の運用、GRANT 点検 SQL、リリース判定への接続。
- [04-release-check-table.md](./supabase-hardening-checklist/04-release-check-table.md) — リリース前 点検チェック表（毎回コピーして使う）。
- [05-req-244-data-integrity.md](./supabase-hardening-checklist/05-req-244-data-integrity.md) — REQ-244: 付与列汚染の既存データ扱い（監査抽出 → null-and-re-enrich）。
- [06-req-241-posts-column-grant.md](./supabase-hardening-checklist/06-req-241-posts-column-grant.md) — REQ-241: `posts` に列を追加したら列単位 GRANT を貼り直すルールと手順。
- [07-req-292-correction.md](./supabase-hardening-checklist/07-req-292-correction.md) — REQ-292: 「Turnstile ＋ Auth レート制限で受容」が RPC 直叩きに成立しなかった訂正記録と対処。
- [08-pitfalls-and-references.md](./supabase-hardening-checklist/08-pitfalls-and-references.md) — つまずきポイント（`has_column_privilege` の罠など）と参考リンク。
