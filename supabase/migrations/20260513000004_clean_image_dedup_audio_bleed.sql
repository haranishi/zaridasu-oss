-- REQ-129: 画像 dedup が ai_result 全体をコピーして音声判定を混入させていたバグの
-- バックフィル。 audio_url IS NULL なのに ai_result.audio_analysis を持つ汚染レコード
-- を検出し、過去投稿から転写された audio_analysis / combined_decision / model を
-- 剥がす。剥がした結果 ai_result が image_analysis も含まずほぼ空になるレコードは
-- 完全にリセットして再分析対象に戻す。
--
-- 冪等性: 二度実行しても結果は同じ。jsonb の `-` 演算子は存在しないキーを除いても
-- 例外を投げない。空判定はリセット後の状態を見るので二度目以降は対象 0 件。
--
-- 観測例 (2026-05-12):
--   posts 28ae8a41... / 2edf4ef9... が audio_url=null かつ ai_result.audio_analysis に
--   過去の bullfrog 投稿 (33b148c4...) の判定 (analyzed_at: 2026-04-24) を保持している状態。

BEGIN;

----------------------------------------------------------------------
-- 1. 過去投稿から転写された audio_analysis / combined_decision / model を剥がす
----------------------------------------------------------------------
UPDATE public.posts
   SET ai_result = ai_result - 'audio_analysis' - 'combined_decision' - 'model',
       ai_analyzed_at = NULL,
       ai_failure_count = 0
 WHERE audio_url IS NULL
   AND ai_result IS NOT NULL
   AND (ai_result ? 'audio_analysis');

----------------------------------------------------------------------
-- 2. クリーンアップ後に image_analysis も audio_analysis も無く、
--    残ったキーがメタ情報のみ (analyzed_at / photo_count / analyzed_count /
--    dedup_status / copied_from_post_id) になったレコードは ai_result を完全に
--    リセットする。 analyze-image Webhook が再発火した際に通常パス (dedup miss →
--    Gemini 呼び出し) を走らせられる。
----------------------------------------------------------------------
UPDATE public.posts
   SET ai_result = NULL,
       ai_analyzed_at = NULL,
       ai_failure_count = 0
 WHERE ai_result IS NOT NULL
   AND NOT (ai_result ? 'image_analysis')
   AND NOT (ai_result ? 'audio_analysis')
   AND (
         ai_result
           - 'analyzed_at'
           - 'photo_count'
           - 'analyzed_count'
           - 'dedup_status'
           - 'copied_from_post_id'
       ) = '{}'::jsonb;

COMMIT;
