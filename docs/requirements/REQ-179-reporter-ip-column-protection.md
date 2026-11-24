# REQ-179: `posts.reporter_ip`（PII）が公開 anon キーで誰でも SELECT 可能（列レベル保護の欠如）

## 背景

`posts.reporter_ip` は投稿者の IP アドレス（個人を特定しうる情報＝PII）を格納する列で、`set_post_reporter_ip` トリガーにより**`user_id IS NULL` の匿名投稿時にのみ**サーバー側で設定される（`supabase/schema.sql:134-146`、`extract_request_ip()` を使用）。スパム・連投対策のための内部列であり、一般ユーザーに開示する意図はない。

REQ-025 ではこの列を非管理者から隠す対策として、`reporter_ip` を管理者以外に `NULL` で返すセキュアビュー `posts_public` が作られた（`supabase/migrations/20240101000001_rls_and_audit_triggers.sql:79-94`、`security_invoker = true`）。しかし**このビューはアプリから一切使われておらず**、アプリは終始 `from('posts')` でテーブルを直接参照している。テーブル側には `reporter_ip` の**列レベル `REVOKE` が存在しない**ため、公開 anon キーで `reporter_ip` を含む任意列を SELECT できる状態が残っている。

REQ-120 で匿名投稿の UI は撤去され（`src/hooks/usePostForm.ts:316` で `is_anonymous: false` 固定）、以降の新規投稿に `reporter_ip` は設定されない。したがって実害は**過去に `user_id IS NULL` で作成された行**に限定されるが、REQ-025 が掲げた「`reporter_ip` を一般ロールから保護する」という目標（AC-05）は未達のままである。

## 現状の問題

（ファイルパス:行番号つき）

1. **`reporter_ip` に列レベル `REVOKE` が無く、行 RLS は列を制御しない**
   - posts の SELECT ポリシーは `moderated_read`（`supabase/schema.sql:543-548`）で、`status='approved' OR auth.uid()=user_id OR role='admin'` の**行**条件のみ。承認済み行であれば誰でも読め、その際**どの列を返すかは制御されない**ため `reporter_ip` も読める。
   - `supabase/schema.sql` 全体に `REVOKE ... (reporter_ip) ... ON public.posts` 相当の列権限制御は**存在しない**（`REVOKE` は `admin_user_list` に対する記述のみ＝`schema.sql:456-457`）。
   - 結果、`anon` / `authenticated` ロールが `select('reporter_ip')` 相当のクエリで承認済み投稿の IP を取得できる（過去の匿名投稿行に値が入っている場合）。

2. **保護目的の `posts_public` ビューがアプリで完全に未使用**
   - ビュー定義: `supabase/migrations/20240101000001_rls_and_audit_triggers.sql:81-94`（非管理者には `CASE WHEN is_current_user_admin() THEN reporter_ip ELSE NULL END`）。
   - アプリ内 `posts_public` 参照は **0 件**（`grep -rn "posts_public" src/` がヒットなし。定義箇所のみ）。
   - 一方 `from('posts')` 直参照はアプリ全体で多数（`src/app/post/[id]/page.tsx:43`・`src/app/area/[municipality]/page.tsx:31,69`・`src/app/profile/[userId]/page.tsx:23`・`src/hooks/usePostList.ts:37` ほか）。つまりビューによる防御は機能しておらず、列保護の実態がない。

3. **REQ-025 AC-05（`reporter_ip` の一般ロール保護）が未達**
   - ビューを作っただけで列 `REVOKE` を伴わず、かつアプリがビューを使わなかったため、目標が宙に浮いている。`supabase/schema.sql` 側（本番の正本）にも当該ビュー・列保護が反映されていない。

4. **既存の pgTAP テストは行保護・列上書きトリガーのみを検証**
   - `supabase/tests/rls_posts.sql`（`plan(33)`、`rls_posts.sql:10`）は INSERT/UPDATE 時の列強制リセット等を検証するが、**「一般ロールが `reporter_ip` を SELECT すると権限エラーになる」検証は無い**（`reporter_ip` への言及は UPDATE 保護の `rls_posts.sql:142,174,197` のみ）。回帰検知の網がない。

5. **影響の限定（実害評価）**
   - `reporter_ip` は `set_post_reporter_ip`（`schema.sql:134-146`）が `NEW.user_id IS NULL AND NEW.reporter_ip IS NULL` の時だけ設定する。REQ-120（`docs/requirements/REQ-120-anonymous-post-ui-removal.md`）で匿名投稿 UI は撤去済みのため、漏洩しうるのは**過去の匿名投稿行**に限られる。とはいえ PII の公開可読状態は是正すべき。

## 目的

`reporter_ip`（PII）を公開ロール（`anon` / `authenticated`）から確実に隠し、REQ-025 AC-05 を達成する。あわせて未使用の `posts_public` ビューの存廃を決定し、設計の二重化を解消する。本番の正本である `supabase/schema.sql` に保護を反映し、回帰検知の pgTAP テストを追加する。

## 要件

### 機能要件

- [ ] FR-179-01: `reporter_ip` 列を一般ロールから読めなくする列レベル `REVOKE` をマイグレーションで追加する：
  ```sql
  REVOKE SELECT (reporter_ip) ON public.posts FROM anon, authenticated;
  ```
  新規マイグレーションファイルは既存命名規則（`supabase/migrations/2026MMDD0000NN_*.sql`、直近は `20260603000006_seed_experiments.sql`）に従い連番で作成する。テーブル全体の `SELECT` 権限は維持し、`reporter_ip` 列のみを除外する（列レベル GRANT/REVOKE のセマンティクス＝「テーブル GRANT があっても列 REVOKE が優先される」を利用）。
- [ ] FR-179-02: 同じ列保護を本番正本 `supabase/schema.sql` にも反映する（マイグレーションと schema.sql のドリフトを防ぐ。`posts` の GRANT 群／RLS 定義の近傍に配置）。
- [ ] FR-179-03: 管理者が `reporter_ip` を閲覧する正規経路を確保する。現状 `src/views/admin/AdminReportsPage.tsx:84,112,223-224` は `reports.reporter_ip`（reports テーブル側）を参照しており posts の列ではないため、posts 側 `reporter_ip` を管理画面で表示している箇所が無いことを確認する。将来 admin で posts の IP を表示する必要が生じた場合は `service_role` 経由または `SECURITY DEFINER` RPC（管理者判定付き）で取得する方針を本 REQ に明記する（anon/authenticated 経路では取得不可のままとする）。
- [ ] FR-179-04: `posts_public` ビューの存廃を決定する。アプリで未使用（grep 0 件）かつ列 REVOKE で目的が達成されるため、**原則は廃止（DROP）を推奨**する。廃止する場合は `supabase/migrations/20240101000001_rls_and_audit_triggers.sql` の定義を残置（過去マイグレーションは改変しない）したうえで、新規マイグレーションで `DROP VIEW IF EXISTS public.posts_public;` し、`schema.sql` からも除去する。存続させる判断をする場合は、その用途（例: 将来の admin 集計）と「アプリ本体は引き続き列 REVOKE 済みの `posts` を使う」方針を記録する。どちらに決めたかを ADR/コミットメッセージに残す。
- [ ] FR-179-05: 既存マイグレーション群（`001_` / `002_` プレフィックス等の辞書順問題、`ci.yml:151-153` のコメント参照）と矛盾しないよう、列 REVOKE は posts テーブルおよび GRANT 群の適用後に実行される順序であることを確認する（CI は schema.sql を直接適用するため、schema.sql 内の配置順にも注意）。

### 非機能要件（テスト）

- [ ] NFR-179-01: `supabase/tests/rls_posts.sql` に pgTAP の負ケースを追加する：`anon` および `authenticated` ロールで `SELECT reporter_ip FROM posts ...` を実行すると**権限エラー（permission denied for column reporter_ip）になる**ことを検証する。`throws_ok` 系アサーションを用い、`plan()` の本数（現状 `rls_posts.sql:10` の `plan(33)`）を追加分だけ増やす。
- [ ] NFR-179-02: 管理者ロール（`app_metadata.role=admin`）では `reporter_ip` の取得経路（FR-179-03 で定めた経路）が機能することを、可能な範囲でテストまたは手順として確認する。
- [ ] NFR-179-03: 追加テストが CI の `rls-tests` ジョブ（`ci.yml:148-216`、`pg_prove --ext .sql supabase/tests/`）で実行され、グリーンになること。

## 受入条件

- [ ] AC-01: 公開 anon キー（または `SET ROLE anon`）で承認済み投稿に対し `reporter_ip` を含む SELECT を実行すると、権限エラーになる（値が返らない）。
- [ ] AC-02: 一方で `reporter_ip` を**含まない**通常の投稿取得（既存の `from('posts').select('id, ...')` 経路）は従来どおり成功し、アプリの投稿表示・地図・詳細ページが回帰しない。
- [ ] AC-03: `supabase/tests/rls_posts.sql` に追加した「anon/authenticated の `reporter_ip` SELECT が権限エラー」テストが pgTAP でパスする（`rls-tests` CI ジョブ green）。
- [ ] AC-04: `supabase/schema.sql` とマイグレーションの両方に列 REVOKE が含まれ、`posts_public` の存廃方針が両者で一致している（schema.sql とマイグレーションのドリフトなし）。
- [ ] AC-05（REQ-025 AC-05 の達成確認）: 「`reporter_ip` は一般ロールから読み取れない」状態が、ビュー経由ではなくテーブル列権限として恒久的に成立している。

## 影響範囲

**新規ファイル:**
- `supabase/migrations/2026MMDD0000NN_revoke_reporter_ip_select.sql`（連番で作成）

**変更対象ファイル:**
- `supabase/schema.sql`（列 REVOKE 追記、`posts_public` を廃止する場合は定義除去）
- `supabase/tests/rls_posts.sql`（pgTAP 負ケース追加、`plan()` 本数更新）

**他機能への影響:**
- アプリ本体（`from('posts')` 直参照）は `reporter_ip` を選択していないため**機能回帰なし**。万一どこかで `reporter_ip` を選択しているクエリがあれば露見するので、適用前に `grep -rn "reporter_ip" src/` で posts 由来の選択が無いことを再確認（現状の確認では `src/views/admin/AdminReportsPage.tsx` は reports テーブル側で別物、`src/types/database.types.ts:102,111` は型定義のみ）。
- CI: `rls-tests` ジョブにテストが追加される。
- admin: posts の IP を表示する必要が生じた場合の取得経路が `service_role`/RPC に限定される（FR-179-03）。

## 優先度
- **緊急度**: High / **重要度**: High
- **理由**: PII（IP アドレス）が公開 anon キーで読み取り可能な状態は、限定的とはいえプライバシー上の欠陥であり、REQ-025 AC-05 の未達が放置されている。修正は列 REVOKE 1 行＋テスト追加が中心で、アプリ本体は `reporter_ip` を使っていないため回帰リスクが低い。
