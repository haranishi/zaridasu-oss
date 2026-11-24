# (2) アカウント乗っ取り runbook（管理者 / 一般ユーザー）

> 参照要件: [REQ-220](../../requirements/REQ-220-incident-response-runbook.md) FR-220-04 / AC-05
> 索引・共通初動: [README.md](./README.md)　|　証拠保全: [evidence-preservation.md](./evidence-preservation.md)　|　連絡先: [contacts.md](./contacts.md)
> 下敷き（Obsidian・読み取り専用）: `07_Incident_Response`（A 節）
> 最終確認日: **2026-06-16**

---

## これは何か

自分（管理者）または利用者のアカウントが乗っ取られた疑いがあるときの対応手順書。記録・保全から
封じ込め（パスワード変更 → 全セッション失効 → MFA → 連携見直し）、影響範囲特定、復旧、再発防止までを扱う。
運用基盤アカウント（GitHub / Vercel / Supabase / Google）の乗っ取りも対象。

## 目的・背景

**管理者アカウントは別格に重い。** `app_metadata.role = 'admin'` を持つアカウントは全 admin 操作
（削除・ロール付与剥奪・公式化・承認却下）ができ、PII にも広く触れる。そのため管理者侵害の疑いは
「最悪ケース」として扱い、一般ユーザーの乗っ取りとは別に手順を分けている。

## 主要な決定事項（要点）

- 封じ込めは **パスワード変更 → 全セッション失効 → MFA 再設定 → 連携 OAuth 見直し → 使い回し先の変更**の順を守る。
  パスワードだけ変えてセッション破棄を省くと攻撃者の既存セッションが生き残る。
- **保全は封じ込めと並行で最優先**（消える前に `audit_logs` / `admin_login_attempts` を書き出す）。
- **`audit_logs` は fire-and-forget で欠落し得る。「ログに無い＝やられていない」ではない。** Supabase Logs とデータ実体も確認する。
- **管理者侵害時は service-role キーも漏れた前提**で扱い、必要なら 01-secret-leak の手順でローテーションする。
- 不正に付与された **admin ロールの剥奪を後回しにしない**（侵害が継続する）。
- 個人データ閲覧 / 流出の可能性が出たら 04-personal-data-breach を主 runbook に、課金異常なら 03-cloud-billing-anomaly を併用する。

## 各部品

- [01-when-to-use-and-first-response.md](./02-account-takeover/01-when-to-use-and-first-response.md) — いつ使うか（異常の兆候一覧・管理者アカウントが別格である理由）、初動チェックリスト 8 手順、やってはいけないこと。
- [02-general-user-takeover.md](./02-account-takeover/02-general-user-takeover.md) — A. 一般ユーザーの乗っ取り。封じ込め 5 手順（本人 / サポートとして）と影響範囲の考え方。
- [03-admin-account-takeover.md](./02-account-takeover/03-admin-account-takeover.md) — B. 管理者アカウントの乗っ取り。保全用 SQL（audit_logs / admin_login_attempts）、封じ込め 4 手順、プラットフォーム別の復旧フォーム導線。
- [04-common-steps-and-exit-criteria.md](./02-account-takeover/04-common-steps-and-exit-criteria.md) — 共通の詳細手順 Step 1〜4（記録・保全 / 封じ込め / 影響範囲特定 / 復旧）、終了条件チェックリスト、関連リンク。
