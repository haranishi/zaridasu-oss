-- security-hardening 要件5: 退会（delete_own_account）が、投稿・監査履歴の有無にかかわらず完了する。
--
-- 不具合1: 投稿が 1 件でもある会員は、自分で退会できなかった。退会で外部キー（ON DELETE SET NULL）が posts.user_id を
--   NULL にする更新を行うが、protect_post_status が一般ユーザーの UPDATE として旧値に戻し、削除された利用者を指す
--   行が残って posts_user_id_fkey 違反になる。
-- 不具合2: 自分のコメントや投稿を削除して監査ログ（audit_logs.admin_id = 本人）が残った会員は、外部キー
--   （NO ACTION）で退会できなかった。
-- 修正前のコードでは 3〜8 が落ちる。
-- 保護そのものは弱めていない: 生きている持ち主の投稿を NULL や他人へ書き換える更新は、今までどおり旧値に戻る（1・2）。
--
-- コメントの扱い（schema.sql は匿名で残す／migration 20260323000001 は消す）は食い違っていて、本人の判断待ち。
-- このテストはどちらかに決めてしまわない。「退会した人を指す行が残っていない」ことだけを確かめる（6）。

BEGIN;
SELECT plan(9);

-- 準備（管理者権限）: 会員 M（投稿・コメント・いいね・監査ログあり）、会員 O、投稿の無い会員 N
SELECT set_config('request.jwt.claims', '{}', true);
INSERT INTO auth.users (id, email) VALUES
  ('91919191-0000-0000-0000-000000000001', 'member-m@example.test'),
  ('92929292-0000-0000-0000-000000000002', 'owner-o@example.test'),
  ('93939393-0000-0000-0000-000000000003', 'noposts-n@example.test');
INSERT INTO posts (id, user_id, species, info_type, lat, lng, status) VALUES
  ('a0a0a0a0-0000-0000-0000-000000000001', '91919191-0000-0000-0000-000000000001', 'american', 'sighting', 39.7, 140.1, 'approved'),
  ('a0a0a0a0-0000-0000-0000-000000000002', '92929292-0000-0000-0000-000000000002', 'american', 'sighting', 39.8, 140.2, 'approved');
INSERT INTO comments (id, post_id, user_id, content) VALUES
  ('b0b0b0b0-0000-0000-0000-000000000001', 'a0a0a0a0-0000-0000-0000-000000000002',
   '91919191-0000-0000-0000-000000000001', 'M のコメント');
INSERT INTO likes (post_id, user_id) VALUES
  ('a0a0a0a0-0000-0000-0000-000000000002', '91919191-0000-0000-0000-000000000001');
-- M が自分のコメントを削除したときに監査のトリガーが残す行（admin_id = 本人）と同じもの
INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
VALUES ('91919191-0000-0000-0000-000000000001', 'delete_comment', 'comment',
        'b0b0b0b0-0000-0000-0000-0000000000ff', '{"test":"sec5"}'::jsonb);

-- ── 会員 M ────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"91919191-0000-0000-0000-000000000001","app_metadata":{"role":"authenticated"}}', true);

-- 保護は弱めていない: 生きている持ち主の投稿を、NULL や他人に書き換える更新は旧値に戻る
UPDATE posts SET user_id = NULL WHERE id = 'a0a0a0a0-0000-0000-0000-000000000001';
SELECT is(
  (SELECT user_id FROM posts WHERE id = 'a0a0a0a0-0000-0000-0000-000000000001'),
  '91919191-0000-0000-0000-000000000001'::uuid,
  'SEC-5-1: 会員が自分の投稿の持ち主を NULL にしようとしても、旧値に戻る'
);
UPDATE posts SET user_id = '92929292-0000-0000-0000-000000000002' WHERE id = 'a0a0a0a0-0000-0000-0000-000000000001';
SELECT is(
  (SELECT user_id FROM posts WHERE id = 'a0a0a0a0-0000-0000-0000-000000000001'),
  '91919191-0000-0000-0000-000000000001'::uuid,
  'SEC-5-2: 会員が自分の投稿を他人の持ち物にしようとしても、旧値に戻る'
);

-- 退会
SELECT lives_ok(
  $$SELECT public.delete_own_account()$$,
  'SEC-5-3: 投稿・コメント・いいね・監査ログのある会員が、自分で退会できる'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);

SELECT is(
  (SELECT count(*) FROM auth.users WHERE id = '91919191-0000-0000-0000-000000000001'), 0::bigint,
  'SEC-5-4: 退会した会員のアカウントが消えている'
);
SELECT is(
  (SELECT count(*) FROM posts
    WHERE id = 'a0a0a0a0-0000-0000-0000-000000000001' AND user_id IS NULL), 1::bigint,
  'SEC-5-5: 退会した会員の投稿は、持ち主の結び付きだけ外れて残る'
);
SELECT is(
  (SELECT count(*) FROM comments WHERE user_id = '91919191-0000-0000-0000-000000000001'), 0::bigint,
  'SEC-5-6: 退会した会員を指すコメントが残っていない（匿名で残るか消えるかは本人の判断待ち）'
);
SELECT is(
  (SELECT count(*) FROM audit_logs WHERE details->>'test' = 'sec5' AND admin_id IS NULL), 1::bigint,
  'SEC-5-7: 監査ログの行は消えず、記録者の欄だけ空になる'
);
SELECT is(
  (SELECT user_id FROM posts WHERE id = 'a0a0a0a0-0000-0000-0000-000000000002'),
  '92929292-0000-0000-0000-000000000002'::uuid,
  'SEC-5-8: 他の会員の投稿は変わらない'
);

-- ── 投稿の無い会員 N: これまでどおり退会できる ────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"93939393-0000-0000-0000-000000000003","app_metadata":{"role":"authenticated"}}', true);
SELECT lives_ok(
  $$SELECT public.delete_own_account()$$,
  'SEC-5-9: 投稿の無い会員も、これまでどおり退会できる'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
