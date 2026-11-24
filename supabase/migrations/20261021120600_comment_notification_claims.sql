-- security-hardening 要件9: コメント通知メールを、1 コメントにつき 1 通にする。
--
-- 原因: Edge Function notify-comment は、呼び出し元がそのコメントの書き手であることだけを確かめて、投稿の持ち主へ
--   メールを送る。送信済みの記録がなく、同じ comment_id で何度でも呼べるため、他人の投稿に 1 件コメントした
--   ログイン済みユーザーが、持ち主の受信箱にメールを溢れさせられた（メールの配信費用と送信ドメインの評判にも響く）。
--   コメントの INSERT には頻度制限があるが、再呼び出しはその外にある。
-- 修正: 送る前に、この表へ comment_id を挿入して「先取り」する。主キーの重複（23505）なら送らない。
--   送信に失敗したときは、行を消して、次の呼び出しで再送できるようにする（Edge Function 側）。
--   表の読み書きは service_role だけ（RLS を有効にしてポリシーを置かない。匿名・ログイン済みの権限も外す）。
BEGIN;

CREATE TABLE IF NOT EXISTS public.comment_notification_claims (
  comment_id uuid        PRIMARY KEY REFERENCES public.comments(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.comment_notification_claims IS
  'security-hardening 要件9: コメント通知メールの送信済みの印（1 コメント 1 通）。Edge Function notify-comment が、送る前に挿入して「先取り」し、重複なら送らない。サーバー専用（RLS 有効・ポリシーなし）。';
ALTER TABLE public.comment_notification_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comment_notification_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.comment_notification_claims TO service_role;

COMMIT;
