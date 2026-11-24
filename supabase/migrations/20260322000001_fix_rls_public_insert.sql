-- FR-002: postsテーブルのRLSポリシー競合を解消
-- public_insert (全ユーザーINSERT可) を削除し、auth_insert (認証ユーザーのみ) に統一
DROP POLICY IF EXISTS "public_insert" ON posts;
