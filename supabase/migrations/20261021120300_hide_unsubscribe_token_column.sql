-- security-hardening 要件4: 配信停止トークン（user_profiles.unsubscribe_token）を、本人以外が読めないようにする。
--
-- 原因: 公開プロフィールの方針（public_profiles_viewable）は、is_public = true の行をテーブル全体のSELECT権限で
--   読ませる。トークンの列だけを隠す設定が無く、匿名がトークンを読める。`apply_unsubscribe(トークン, 'all')` は
--   トークンだけで対象者を決めるので、読んだトークンで、その利用者の通知3種（研究採用・休眠復帰・週次）を
--   全て止められた。2026-10-21 に、CI 相当の手元 DB で再現した。
-- 修正: テーブル全体のSELECTを外し、トークン以外の全列に、列単位で付け直す（列は今のカタログから作る。
--   本番にだけある列も、同じ扱いで残る）。メール送信側（service_role）と、所有者の権限で動く関数
--   （apply_unsubscribe / get_user_profile など）は影響を受けない。画面は * で読んでいない（確認済み）。
-- 注意:
--   ・この後に列を足したときは、読ませたい列に GRANT SELECT (列) を打つ（打たない限り読めない。安全側）。
--   ・既に発行したトークンは再発行しない。公開プロフィールの利用者の分は読まれていた可能性があるが、再発行すると
--     送信済みメールの配信停止リンクが無効になる（brief.md の本人判断）。
--   ・CI は、Supabase 既定の一括 GRANT がテーブル権限を復活させるため、一括 GRANT の後にもう一度この
--     migration を当てる（supabase/ci/reapply-after-grants.txt）。
BEGIN;

DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
    INTO v_cols
    FROM pg_attribute a
   WHERE a.attrelid = 'public.user_profiles'::regclass
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attname <> 'unsubscribe_token';

  -- テーブルのSELECTを外すと、列に付いていた分も一緒に外れる。その後で、列単位に付け直す。
  EXECUTE 'REVOKE SELECT ON public.user_profiles FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.user_profiles TO anon, authenticated', v_cols);
END
$$;

COMMIT;
