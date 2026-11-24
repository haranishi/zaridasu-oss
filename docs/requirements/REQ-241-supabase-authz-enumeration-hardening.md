# REQ-241: Supabase RPC 認可ゲート欠落・メール列挙・スキーマドリフトの是正

> [!warning] 【訂正: 2026-07-30 / REQ-292】FR-241-02 の受容根拠は誤りだった
> 本要件は `check_email_exists` を「UX を残す」方針で確定し（FR-241-02 の (UX を残す場合)）、
> 列挙リスクの残余を **Turnstile（REQ-212）＋ Auth レート制限**で受容した
> （実装: `supabase/migrations/20260703000003_req241_authz_enumeration_hardening.sql:162`）。
> **この 2 つはいずれも `POST /rest/v1/rpc/check_email_exists` の直叩きには掛からない。**
>
> - **Turnstile**: ブラウザのフォームに描画されるウィジェットで、token は `supabase.auth.signUp()` 等
>   **Auth SDK 呼び出しの `options.captchaToken`** に同梱される。PostgREST の RPC 呼び出しには一切介在しない。
>   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 未設定なら `captchaEnabled=false` で完全 no-op にもなる。
> - **Auth レート制限**: `/auth/v1/*` に対する制限であり、PostgREST の `/rest/v1/rpc/*` には適用されない。
>
> つまり受容根拠は両方とも成立しておらず、公開 anon キーだけで登録ユーザーのメールの在・不在を
> 確認できるオラクルが公開状態だった。**REQ-292 で対処済み**（anon/authenticated の EXECUTE 剥奪＋本体ゲート、
> フロントの事前チェック廃止 → `signUp` 後の `identities` 空判定に一本化）。
> 詳細と点検結果: `docs/requirements/REQ-292-authz-defects-in-anon-granted-rpc.md`、
> `docs/runbooks/supabase-hardening-checklist.md`「REQ-292.【訂正】」節。
>
> **一般化した教訓**: 緩和策を受容根拠に挙げるときは、それが**当該経路に技術的に介在するか**を経路単位
> （`/auth/v1/*` か `/rest/v1/rpc/*` か）で確認する。「別経路でも同じ情報が漏れる」ことは
> 「制限の無い経路を残してよい」理由にならない。

## 背景
ザリダスの DB 層は REQ-221 で本番ハードニング（RLS 全テーブル有効・`SECURITY DEFINER` の `search_path` 固定・列固定トリガー・多層レート制限・`ALTER DEFAULT PRIVILEGES` による PUBLIC 権限剥奪）を完了しており、全体の防御姿勢は堅牢である。監査の結果、過剰許可な `USING(true)` 書き込みポリシーや匿名 INSERT 経路は見つからなかった。一方で「実装済みだが穴がある」箇所が 3 件確認された。いずれも既存のハードニング網から**個別に漏れた逸脱**であり、既存パターン（兄弟 RPC・既存 migration）に合わせて塞げる。

## 現状の問題
（ファイルパス:行番号つき）

### 1.（Medium）`detect_ai_anomalies` が管理者チェック無しで `authenticated` に公開されている
- 定義: `supabase/schema.sql:2647-2760`（正本）／ `supabase/migrations/20260616000003_ai_anomaly_detection.sql`（本体・`GRANT EXECUTE ... TO authenticated`）。
- この関数は `SECURITY DEFINER` かつ `GRANT EXECUTE TO authenticated` だが、**本体に管理者ゲートが一切無い**（`BEGIN` 直後からいきなり集計を開始）。COMMENT と migration ヘッダは「service_role / admin 用・PII 最小」を謳うが、実際は**ログイン済みの任意ユーザーが `supabase.rpc('detect_ai_anomalies')` で呼べる**。
- 兄弟の集計 RPC は全て内部ゲートを持つ（`get_retention_cohorts` / `get_kpi_quality_funnel` / `get_kpi_summary` は `PERFORM public._kpi_assert_admin()`、`get_ai_cost_summary` / `get_experiment_metrics` は inline admin チェック）。**`detect_ai_anomalies` だけがゲートを欠く単独の逸脱**。
- 影響（任意の認証ユーザーが取得できてしまう内部情報）:
  - `top_user_id`（窓内で最も AI 解析を発生させたユーザーの UUID）。`posts` の `moderated_read` が `user_id` を公開し、`get_user_profile` で UUID→表示名に変換できるため、実質「最も投稿/スパムの多いユーザー」を特定できる（プライバシー）。
  - `auto_approve_rate`（AI 自動承認率）＝ AI モデレーション回避のタイミングを計るヒント。
  - `total_calls` / `max_user_calls` / `max_ip_posts` 等の内部運用メトリクス。
  - 副次: 誰でもフルウィンドウの集計スキャン（`ai_call_logs × posts` join）を反復起動でき、軽微なコスト/DoS ベクタになる。

### 2.（Low〜Medium）`check_email_exists` がメール列挙オラクルになり得る／REQ-221 の PUBLIC 剥奪と矛盾
- 定義: `supabase/schema.sql:1053` / `supabase/migrations/20240101000000_initial_schema.sql:545`。呼出: `src/components/modals/AuthModal.tsx:290` がサインアップ時（＝**anon/未認証**）に `supabase.rpc('check_email_exists', { lookup_email })` を実行し、任意メールの登録有無を boolean で返す。
- この関数には**明示的な `GRANT EXECUTE TO anon/authenticated` が無い**（schema.sql・全 migration を grep 済み。blanket GRANT も無し）。デフォルトの PUBLIC EXECUTE に依存していたが、REQ-221 の `20260616000001` が `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` と `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC` を実行している。結果、宙ぶらりんの二律背反になっている:
  - **(a) セキュリティ面**: `supabase db reset` 等で schema.sql から再生成すると、`check_email_exists` は再 CREATE 時にデフォルトの PUBLIC EXECUTE が付き、schema.sql 側にそれを剥がす REVOKE が無い → 公開 anon キーで**任意メールのアカウント存在確認（列挙）が可能**。クレデンシャルスタッフィング／フィッシング標的作成／在籍確認に悪用される古典的アンチパターン。
  - **(b) 機能面**: 逆に live DB で PUBLIC 剥奪が効いていれば、anon からの RPC が拒否され、サインアップのメール重複事前チェックが**静かに機能しなくなる**潜在バグ。
- 他の anon 公開 RPC（`get_user_ranking` / `get_dashboard_stats` / `get_municipality_post_counts` / `resolve_unsubscribe_token` 等）は全て**明示 GRANT** を持つ。`check_email_exists` だけが REQ-221 の網から漏れ、意図が未確定。

### 3.（Low・BCP/再現性）`post-audio` ストレージバケットが schema.sql にしか無く migration に無い
- `post-audio` バケットの `INSERT INTO storage.buckets` は `supabase/schema.sql:1753` のみ。migration 側は `20240101000000` が **post-photos しか作らない**。一方 post-audio 用のアップロード RLS ポリシーは `20260513000007_storage_owner_folder_upload.sql` に存在する。
- 影響: migration のみで構築する環境（`supabase db push` による DR/再構築 = REQ-217 BCP の復旧経路）では **post-audio バケットが存在せず**、音声アップロードが失敗し、ポリシーは存在しないバケットを参照する。直接の脆弱性ではないが、スキーマ/マイグレーションのドリフトでインシデント復旧の再現性を損なう。

### 参考（保守上の注意・是正済みの前向きな脆さ）
- `20260616000005_fix_reporter_ip_column_protection.sql` は `REVOKE SELECT ON posts` → `information_schema` から列を動的列挙して reporter_ip 以外へ列単位 GRANT、という正しい是正。ただし**実行時点の列集合を固定**するため、**将来 `posts` に列を追加する migration が後から入ると、その新列は anon/authenticated から不可視（fail-closed）になり機能回帰し得る**。安全側（漏洩ではなく機能欠落）だが、`posts` 列追加時は列 GRANT の貼り直しをセットにする運用ルールが要る。

## 目的
既存ハードニング網から漏れた 3 件の逸脱を、既存パターンに合わせて塞ぐ。特に最優先の発見 1（`detect_ai_anomalies` の認可欠落）は 1 行のゲート追加で是正する。あわせて `check_email_exists` の意図を確定し、DR 再構築の再現性（post-audio）を回復する。

## 要件

### 機能要件
- [ ] FR-241-01: `detect_ai_anomalies` の本体先頭に `PERFORM public._kpi_assert_admin();` を追加する（`supabase/schema.sql` 正本 + 追補 migration の両方）。`_kpi_assert_admin` は service_role も許可するため、`notify-ai-anomaly` Edge Function（service_role 経由）の cron パスは壊れない。GRANT は `authenticated` のままでよい（ゲートが実チェックを担う。`get_retention_cohorts` と同型）。
- [ ] FR-241-02: `check_email_exists` の意図を確定し、いずれかを実施する:
  - **(UX を残す場合)** (i) 明示 `GRANT EXECUTE TO anon, authenticated` を schema.sql と migration に付与して REQ-221 の網に正式に載せ、かつ (ii) 列挙対策として、Supabase Auth 標準のサインアップ挙動（存在有無を露呈しない汎用文言）へ寄せる／前段に CAPTCHA（REQ-212 Turnstile）・レート制限を必須化する。
  - **(不要な場合)** 関数と `AuthModal.tsx:290` の呼び出しを削除し、メール重複はサインアップ結果のハンドリングに委ねる。
  - **【訂正 2026-07-30 / REQ-292】** 実際に採ったのは「(UX を残す場合)」だが、(ii) の「前段に CAPTCHA・
    レート制限を必須化」は**実装されなかった**（Turnstile も Auth レート制限も RPC 経路に介在しないため
    原理的に必須化できない）。**最終的な決定は「(不要な場合)」相当** ＝ REQ-292 で anon/authenticated の
    EXECUTE を剥奪し、フロントの事前チェックを廃止して `signUp` 後の `identities` 空判定に一本化した。
    関数自体は `database.types.ts` との整合のため残すが、本体ゲートでサーバー側限定にしている。
- [ ] FR-241-03: `post-audio` バケットの作成（`INSERT INTO storage.buckets ... ON CONFLICT DO NOTHING`）を migration に追加し、schema.sql とドリフトを解消する。既存ポリシー（`20260513000007`）が参照するバケットが migration 経路でも必ず存在するようにする。
- [ ] FR-241-04: 運用ルールとして「`posts` に列を追加する migration は、`20260616000005` の列単位 GRANT の貼り直し（新列に対する anon/authenticated の可視性判断）をセットで行う」を `docs/runbooks/supabase-hardening-checklist.md` に明文化する。

### 非機能要件
- [ ] NFR-241-01: 変更は正本 `schema.sql` と追補 migration の**両方**に反映し、`schema:check`（`scripts/check-schema-types-sync.ts`）を通す。RLS/GRANT の後方互換（既存の正規アクセスを壊さない）を維持する。
- [ ] NFR-241-02: 認可の検証は既存の pgTAP 方式に倣い、`detect_ai_anomalies` について「非 admin authenticated は拒否／admin・service_role は許可」のケースを追加する。
- [ ] NFR-241-03: `check_email_exists` を残す判断をした場合、列挙リスクの残余は CAPTCHA/レート制限で受容可能な水準まで下げ、その根拠を記録する。
  - **【訂正 2026-07-30 / REQ-292】** 記録された根拠（Turnstile ＋ Auth レート制限）は RPC 経路に介在しない
    ため、**残余リスクは一切下がっていなかった**。REQ-292 で経路そのものを閉じることで解決した
    （＝「CAPTCHA/レート制限で下げる」ではなく「anon から到達不能にする」）。

## 受入条件
- [ ] AC-01: 非 admin の認証ユーザーが `detect_ai_anomalies` を呼ぶと拒否され、admin と service_role（`notify-ai-anomaly`）は成功する（pgTAP で確認）。
- [ ] AC-02: `check_email_exists` の扱いが確定し、(残す場合) `supabase db reset` 後も anon からの列挙が対策済みで、live DB でサインアップのメール事前チェックが機能する／(削除する場合) 関数・呼び出しが除去され回帰が無い。
  - **【訂正 2026-07-30 / REQ-292】** REQ-241 の実装では「anon からの列挙が対策済み」が満たされていなかった
    （明示 GRANT により `supabase db reset` 後も anon から列挙可能なままだった）。REQ-292 で
    `supabase/tests/req292_anon_granted_rpc_authz.sql` により `anon` の EXECUTE 不在と 42501 を pgTAP で固定化した。
- [ ] AC-03: migration のみで構築した環境で `post-audio` バケットが存在し、音声付き投稿のアップロードが成功する。
- [ ] AC-04: `schema:check` が通り、正本とマイグレーションが一致する。
- [ ] AC-05: `posts` 列追加時の列 GRANT 貼り直しルールが runbook に明記されている。

## 影響範囲
- `supabase/schema.sql`（`detect_ai_anomalies` ゲート追加・`check_email_exists` GRANT 判断・post-audio バケット）／対応する `supabase/migrations/`（追補）
- `src/components/modals/AuthModal.tsx:290`（`check_email_exists` を削除する判断の場合）
- `docs/runbooks/supabase-hardening-checklist.md`（列 GRANT 貼り直しルール）
- 関連 REQ: REQ-221（本番ハードニング・PUBLIC 剥奪）、REQ-212（レート制限・CAPTCHA）、REQ-215（AI 異常検知）、REQ-217（バックアップ/BCP・DR 再構築）、REQ-179/208（列保護）。

## 優先度
- **緊急度**: Medium / **重要度**: Medium
- **理由**: 過剰許可な書き込みや匿名データ改竄のような致命的欠陥ではないが、発見 1 は認証ユーザーへの内部メトリクス/ユーザー特定情報の漏洩＋軽微な DoS を許し、1 行で塞げる費用対効果が高い。発見 2 は「セキュリティ穴」と「機能サイレント故障」のどちらかが必ず起きている宙ぶらりん状態で意図確定が必要。発見 3 は BCP の再現性課題。いずれも既存パターンに沿って低リスクで是正できる。
