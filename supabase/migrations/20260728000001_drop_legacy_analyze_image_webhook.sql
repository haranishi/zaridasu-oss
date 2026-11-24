-- 旧 Database Webhook トリガー "analyze-image-on-insert" の削除
--
-- 背景:
--   posts への INSERT で analyze-image エッジ関数を呼ぶ経路が2本あった。
--     (旧) "analyze-image-on-insert"  … Supabase ダッシュボードの Database Webhooks で作られたトリガー。
--          supabase_functions.http_request() を直接呼び、**Authorization ヘッダに service_role JWT を
--          リテラルで埋め込んでいる**ため、pg_get_triggerdef() を読める者がキーを取得できる状態だった。
--     (新) analyze_image_on_insert    … 20260421000001_ai_analysis_webhooks.sql が定義。
--          private.trigger_analyze_image() → private.call_ai_edge_function('analyze-image', ...) を呼ぶ。
--   両方が有効だったため 1 投稿につきエッジ関数が二重に呼ばれていた（重複分は重複排除層が吸収し
--   トークン消費は 0 だったが、無駄な起動とレイテンシが発生していた）。
--
-- 対応: 旧トリガーを落として新経路（リポジトリ管理下）に一本化する。
--       埋め込まれていた service_role JWT はこの migration とは別に無効化・ローテーションすること。
--
-- 冪等: DROP TRIGGER IF EXISTS。

DROP TRIGGER IF EXISTS "analyze-image-on-insert" ON public.posts;
