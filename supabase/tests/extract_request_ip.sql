-- REQ-139 Phase 1: extract_request_ip() の信頼ヘッダー優先順位を検証 (pg-tap)
--
-- 検証観点:
--   A) cf-connecting-ip と x-forwarded-for 両方ある → cf-connecting-ip を採用
--   B) cf-connecting-ip なし / x-forwarded-for に複数 → 末尾を採用
--   C) x-forwarded-for なし / x-real-ip のみ → x-real-ip を採用
--   D) ヘッダー全部空 → NULL
--   E) 旧実装で 99.99.99.99 を返していた偽装ケースで新実装は 1.2.3.4 を返す (regression)

BEGIN;
SELECT plan(5);

-- A) cf-connecting-ip 最優先
SELECT set_config('request.headers',
  '{"cf-connecting-ip":"203.0.113.10","x-forwarded-for":"198.51.100.99,10.0.0.1"}', true);
SELECT is(
  public.extract_request_ip(),
  '203.0.113.10',
  'REQ-139 case A: cf-connecting-ip がある場合は x-forwarded-for より優先される'
);

-- B) x-forwarded-for の末尾採用
SELECT set_config('request.headers',
  '{"x-forwarded-for":"198.51.100.99, 203.0.113.20"}', true);
SELECT is(
  public.extract_request_ip(),
  '203.0.113.20',
  'REQ-139 case B: x-forwarded-for は末尾 (エッジが追記する値) を採用する'
);

-- C) x-real-ip フォールバック
SELECT set_config('request.headers',
  '{"x-real-ip":"203.0.113.30"}', true);
SELECT is(
  public.extract_request_ip(),
  '203.0.113.30',
  'REQ-139 case C: cf/xff が無い場合は x-real-ip フォールバック'
);

-- D) 全部空 → NULL
SELECT set_config('request.headers', '{}', true);
SELECT is(
  public.extract_request_ip(),
  NULL,
  'REQ-139 case D: 信頼ヘッダーが何も無ければ NULL を返す'
);

-- E) 旧実装が偽装値を返していたケース → 新実装はエッジ追記値を返す
SELECT set_config('request.headers',
  '{"x-forwarded-for":"99.99.99.99, 1.2.3.4"}', true);
SELECT is(
  public.extract_request_ip(),
  '1.2.3.4',
  'REQ-139 case E (regression): クライアント偽装の先頭値 99.99.99.99 ではなくエッジ追記末尾 1.2.3.4 を返す'
);

SELECT * FROM finish();
ROLLBACK;
