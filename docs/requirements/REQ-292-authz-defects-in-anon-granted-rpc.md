# REQ-292: anon GRANT された RPC の認可欠陥修復（管理者ログイン制限の自己解除・監査ログ偽造・メール存在確認オラクル）

作成日: 2026-07-30
優先度: **P0** ／ 深刻度: **High** ／ 種別: セキュリティ
状態: **実装済み（2026-07-30）・運用タスクを整理して閉じた（2026-09-06）** ／ Auth Hook は Free プランでは有効化できず、記録専用で reject しない設計のため**現状維持（無効のまま）で未達として閉じる**。本番 GRANT の実測は 2026-08-05 に完了（→ 07・08）。汚染調査（FR-292-04）だけが未実施の運用タスクとして残る
関連: REQ-149（管理者ログインのレート制限・監査ログ導入）, REQ-020 / REQ-134（audit_logs の append-only 化）, REQ-211（Sentry PII スクラビング）, REQ-212（公開エンドポイントの bot / レート制限・Turnstile）, REQ-241（Supabase 認可・列挙ハードニング）
参照: `supabase/tests/`（pgTAP。`rls_audit_logs.sql` 等が既存）

## これは何か

`anon` に EXECUTE が GRANT されている SECURITY DEFINER 関数 2 本（`admin_login_record` / `check_email_exists`）の認可欠陥を塞ぐ要件。**どちらも関数内に認可チェックが無く、呼び出し側の申告を信じる**構造が共通の根本原因。
本文は全文を下の部品ファイルへ逐語で移動してある（この入口の要約部分のみ新規記述）。

## 目的・背景の要約

REQ-221 が PUBLIC の自動 EXECUTE を剥がした結果、`anon` から呼べるのは明示 GRANT された関数だけになった。監査でそれらを個別に確認したところ大半は fail-closed だったが、上記 2 本が例外だった。見つかった欠陥は 4 つ（A〜D）。

## 主要な決定事項の要点

- **問題A（High）**: `admin_login_record(p_email, p_success=true)` を anon キーで 1 回叩くだけで失敗カウンタ行が消え、**「15 分で 5 回失敗→15 分ロック」を無制限に回避できる**。
- **問題B（High）**: そもそも攻撃者は `/auth/v1/token` を直叩きすればよく、その経路では `admin_login_record` が呼ばれない。**サーバー側ロックは一度も発火しない**＝REQ-149 の設計主張は不成立。
- **問題C（High）**: `SECURITY DEFINER` が RLS をバイパスするため **anon が `audit_logs` に任意の行を無制限に注入できる**。`audit_logs` は append-only で UPDATE/DELETE 不可のため、**注入行は管理者にも消せない**（監査証跡の汚染＋ストレージ DoS）。改竄防止設計が「消せない汚染」を保証してしまっている。
- **問題D（Medium）**: `check_email_exists` は認可もレート制限も CAPTCHA も無い。REQ-241 が受容根拠にした **Turnstile と Auth レート制限はどちらも `/rest/v1/rpc/*` には掛からない**（Turnstile は `signUp` に渡すトークン、Auth 制限は `/auth/v1/*` 限定）。実在市民のメール名寄せに直結する。
- **採用した方式（実装済み）**: FR-292-01 は **(a)+(b) のハイブリッド**。EXECUTE 剥奪＋fail-closed ゲート＋`login_success` の本人限定化を migration で即時適用し、加えて Password Verification Attempt Hook 用 `admin_login_password_attempt(jsonb)` を新設。
- **Auth Hook は `reject` を返さない**（記録と可視化専用）。理由はフックのペイロードに **IP が含まれず**、reject を有効にすると第三者が管理者メールで 5 回失敗させるだけで**正規管理者をロックアウトできる**（管理者 DoS）ため。強制は Supabase Auth 自身の `/auth/v1/token` レート制限に委ねる。
- **Auth Hook は既定 `enabled = false`**。本体は fail-open でも**配線は fail-open ではなく**、関数不在・GRANT 不足・GoTrue 未対応のいずれでも全ユーザーのログインが失敗し得るため、有効化は人手の運用手順に切り出した。
- `admin_login_check` は **anon / authenticated ともに剥奪**（任意メールのロック状態問い合わせが管理者メールの当て推量に使えるため）。
- `check_email_exists` は **(a) RPC 廃止**を採用。重複判定は `signUp` 後の `identities` 空判定に一本化（既存キー再利用で i18n 追加不要）。
- 汚染行は **(a) 現状を残し調査手順を記録**（append-only の設計意図を守り DELETE しない）。以降の行は `details.source` で由来を判別できる。
- **CI の `GRANT EXECUTE ON ALL FUNCTIONS ... TO anon` が REVOKE を打ち消す**ため、`supabase/ci/reapply-after-grants.txt` に再適用対象として追加済み。
- 既存 migration は書き換えず**新規 migration で再定義・REVOKE**し、`supabase/schema.sql` も同期して drift を作らない。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-background-and-issue-a.md](REQ-292-authz-defects-in-anon-granted-rpc/01-background-and-issue-a.md) | 本要件の性質（important 注記）、背景、問題A: ロックアウトの無制限回避（該当 SQL と PoST リクエスト） |
| [02-issues-b-and-c.md](REQ-292-authz-defects-in-anon-granted-rpc/02-issues-b-and-c.md) | 問題B: サーバー側ロックが発火しない（設計主張の不成立）、問題C: `audit_logs` への任意行注入と削除不能性 |
| [03-issue-d-email-oracle.md](REQ-292-authz-defects-in-anon-granted-rpc/03-issue-d-email-oracle.md) | 問題D: `check_email_exists` のメール存在確認オラクルと、REQ-241 の受容根拠が当該経路に掛かっていない理由 |
| [04-functional-requirements.md](REQ-292-authz-defects-in-anon-granted-rpc/04-functional-requirements.md) | 機能要件 FR-292-01〜06（判断点 (a)/(b) の選択肢を含む） |
| [05-acceptance-criteria.md](REQ-292-authz-defects-in-anon-granted-rpc/05-acceptance-criteria.md) | 受入基準 AC-01〜09（pgTAP の assert 例、GRANT 実測クエリ、drift・i18n チェック） |
| [06-implementation-status.md](REQ-292-authz-defects-in-anon-granted-rpc/06-implementation-status.md) | 実施状況 — 判断点の決定表、変更ファイル一覧、Auth Hook を既定で無効にしている理由 |
| [07-production-rollout.md](REQ-292-authz-defects-in-anon-granted-rpc/07-production-rollout.md) | 本番適用手順 5 ステップ（db push / Hook 有効化 / GRANT 実測 / 汚染調査 / runbook 更新）と未達・次の波 |
| [08-to-confirm.md](REQ-292-authz-defects-in-anon-granted-rpc/08-to-confirm.md) | 要確認 — 汚染行の有無、Auth Hook のプラン可用性、REQ-241 の誤った受容根拠が他へ流用されていないかの確認結果 |
