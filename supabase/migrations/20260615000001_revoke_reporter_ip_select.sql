-- REQ-179: posts.reporter_ip（PII＝投稿者IP）を一般ロール（anon / authenticated）から
-- 列レベルで読み取れなくする。
--
-- 背景:
--   reporter_ip は set_post_reporter_ip トリガーが「user_id IS NULL の匿名投稿時のみ」
--   サーバー側で設定するスパム対策用の内部列で、一般ユーザーに開示する意図はない。
--   posts の SELECT ポリシー moderated_read は status='approved' OR 本人 OR admin という
--   「行」条件のみで、「どの列を返すか」は制御しない。テーブル側に reporter_ip の列レベル
--   REVOKE が無かったため、公開 anon キーで承認済み投稿の reporter_ip を取得できる状態だった
--   （REQ-120 で匿名投稿UIは撤去済みのため漏洩しうるのは過去の匿名投稿行に限られるが、
--   PII の公開可読状態は是正する）。
--
-- 対策:
--   テーブル全体の SELECT 権限は維持したまま reporter_ip 列のみ REVOKE する。
--   列レベル REVOKE はテーブル GRANT より優先されるため、reporter_ip を含む列を選ぶクエリは
--   permission denied になり、reporter_ip を含まない通常の投稿取得は従来どおり成功する。
--   アプリ本体は from('posts') で reporter_ip を選択していないため機能回帰は無い。
--   管理者が posts の IP を見る必要が生じた場合は service_role / SECURITY DEFINER RPC で取得する。
--   REQ-025 AC-05（reporter_ip を一般ロールから保護）を、ビュー経由ではなく列権限として恒久達成する。
--
-- posts_public ビューの存廃（FR-179-04）:
--   REQ-025 で作られたセキュアビュー posts_public はアプリで完全に未使用（grep 0 件）で、
--   本対策の列 REVOKE により目的が達成されるため廃止する。
--   定義元の過去マイグレーション 20240101000001_rls_and_audit_triggers.sql は改変せず残置し、
--   本マイグレーションで DROP する（schema.sql には元々 posts_public 定義は存在しない）。

REVOKE SELECT (reporter_ip) ON public.posts FROM anon, authenticated;

DROP VIEW IF EXISTS public.posts_public;
