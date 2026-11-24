-- =============================================================
-- REQ-bug-delete: 管理者が posts を DELETE できなくなっていたバグ対策
-- =============================================================
-- 経緯:
--   /admin/posts の「🗑 削除」ボタンを押しても投稿が消えない症状を観測。
--   フロント側の handleDelete は正しく DELETE クエリを発行しており、
--   サイレント失敗（error なし・0 行削除）が起きていた。
--
--   原因として、初期スキーマで作成された `admin_all_posts` (FOR ALL TO
--   authenticated USING role=admin) ポリシーが、何らかの理由で失われ
--   ているか、あるいは将来同様の事故が起きうる脆い状態だった
--   （`owner_delete` 単独だと自分以外の投稿を消せない）。
--
-- 対応:
--   admin ロールが posts を DELETE できることを **明示的な単独 policy**
--   として再定義し、initial_schema の `admin_all_posts` への暗黙依存を
--   解消する。既存の `owner_delete` と OR 結合されるので、所有者削除と
--   管理者削除の両方が許可される。
-- =============================================================

BEGIN;

-- 既存の同名ポリシーがあれば剥がして冪等性を確保
DROP POLICY IF EXISTS "admin_delete_posts" ON public.posts;

CREATE POLICY "admin_delete_posts" ON public.posts
  FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

COMMENT ON POLICY "admin_delete_posts" ON public.posts IS
  '管理者は任意の投稿を削除可能 (REQ-bug-delete). 既存の owner_delete と OR 結合.';

COMMIT;
