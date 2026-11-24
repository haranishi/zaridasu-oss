-- ════════════════════════════════════════════════════════════════════════════
-- REQ-244: 研究データ完全性 — INSERT 列保護の穴（サーバ付与地理メタデータ / municipality）
--
-- 監査で判明した問題（根因）: protect_post_insert_columns は一般ユーザー INSERT 時に
-- status/is_official 等はリセットするが、逆ジオコーディング（enrich-place Edge Function・
-- service_role）専用の付与列 locality/water_body/is_on_water/elevation_m/geo_enriched_at/
-- geo_source を放置していた。このため認証ユーザーが自分の投稿に任意のジオメタデータを直接
-- insert でき、さらに geo_enriched_at を先置きすると enrich-place の冪等ガード
-- （private.trigger_enrich_place の IF NEW.geo_enriched_at IS NOT NULL THEN RETURN NEW）が
-- 発火して付与処理が丸ごとスキップされ、偽の地名・水系・標高が上書きされず永続化した。
-- その値は公開 CSV/GeoJSON・地図ポップアップ・地名 SEO ページに流れ、市民科学データの信頼性を
-- 汚染するうえ、CSV 数式インジェクション（route.ts 側で別途是正）の配送経路にもなり得た。
--
-- 本 migration の是正:
--   1. protect_post_insert_columns を CREATE OR REPLACE し、一般ユーザー INSERT 時に
--      付与地理メタデータ 6 列を NULL 化（付与は必ず service_role トリガー経由へ戻る）。
--   2. municipality を許可リスト（秋田県 25 市町村＝src/lib/constants.ts の MUNICIPALITIES）で
--      正規化（一般ユーザーが許可外を入れたら NULL 化）。
--
-- 冪等設計: CREATE OR REPLACE / DROP TRIGGER IF EXISTS で何度実行しても安全。
-- schema.sql（正本・protect_post_insert_columns）と同一定義（NFR-244-01 / schema:check 対象外だが
-- 手動同期）。REQ-243 の location_disclosure ロジックはそのまま保持する（本 migration は
-- REQ-243 の 20260703000001 の「後」に適用され、REQ-243 分＋REQ-244 分の完全な関数本体で上書きする）。
--
-- ─────────────────────────────────────────────────────────────────────────────
-- FR-244-04（既存データの扱い / 過去データのクリーンアップ方針）:
--   本 migration は「今後の INSERT」の付与列汚染を塞ぐのみで、既に保存済みの行は変更しない
--   （本番コンテンツのデータ移行は行わない）。改修前に一般ユーザーが自己設定した可能性のある
--   locality/water_body/is_on_water/elevation_m/geo_enriched_at/geo_source は、以下の運用で
--   監査・再付与する（詳細は docs/runbooks/supabase-hardening-checklist.md の REQ-244 節）:
--     (a) 監査対象抽出: geo_source が想定外（NULL でないのに 'nominatim'/'cache' 等の正規値でない、
--         または geo_enriched_at はあるが geo_cache に対応グリッドが無い）行、および改修デプロイ
--         日時より前に created された行の付与列を洗い出す。
--     (b) null-and-re-enrich: 対象行を service_role で
--           UPDATE posts SET locality=NULL, water_body=NULL, is_on_water=NULL,
--             elevation_m=NULL, geo_enriched_at=NULL, geo_source=NULL WHERE id = ANY(...);
--         としてから enrich-place を再実行（geo_enriched_at が NULL に戻るため冪等ガードを通過し
--         正規の逆ジオ付与が再走する）。バッチは Nominatim 規約（1req/秒）に従い小分けにする。
--     (c) 影響が公開データセットのみで軽微と判断する場合は、当該列を CSV/GeoJSON 出力から一時的に
--         除外する運用でも可（route.ts の SELECT_COLUMNS 調整）。本番の一括移行は必須ではない。
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION protect_post_insert_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  jwt_claims jsonb;
BEGIN
  BEGIN
    jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  IF jwt_claims IS NULL OR jwt_claims = '{}'::jsonb THEN
    RETURN NEW;
  END IF;
  IF (jwt_claims ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- 一般ユーザーが INSERT 時に運用制御カラムを指定してきても強制リセット
  IF (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    NEW.status            := 'pending';
    NEW.rejection_reason  := NULL;
    NEW.rejection_message := NULL;
    NEW.reviewed_at       := NULL;
    NEW.reviewed_by       := NULL;
    NEW.auto_approved     := FALSE;
    NEW.is_official       := FALSE;
    NEW.is_flagged        := FALSE;
    NEW.ai_result         := NULL;
    NEW.ai_analyzed_at    := NULL;
    -- REQ-243: 公開レベルはユーザーが決められない。種ごとの既定（無ければ coarsened）で上書きする。
    NEW.location_disclosure := COALESCE(
      (SELECT sld.default_disclosure FROM species_location_defaults sld WHERE sld.species = NEW.species),
      'coarsened'
    );
    -- REQ-244 FR-244-01: サーバ付与専用の地理メタデータ列は一般ユーザー INSERT で常に NULL 化する。
    -- これを怠ると、攻撃者が geo_enriched_at を先置きして enrich-place の冪等ガード
    -- （IF NEW.geo_enriched_at IS NOT NULL THEN RETURN NEW）を発火させ、偽の locality/water_body/
    -- elevation_m を付与処理にバイパスされたまま永続化できる。付与は必ず service_role トリガー経由へ戻す。
    NEW.locality        := NULL;
    NEW.water_body      := NULL;
    NEW.is_on_water     := NULL;
    NEW.elevation_m     := NULL;
    NEW.geo_enriched_at := NULL;
    NEW.geo_source      := NULL;
    -- REQ-244 FR-244-02: municipality は許可リスト（秋田県 25 市町村）以外を正規化（NULL 化）する。
    -- 許可リストの正本は src/lib/constants.ts の MUNICIPALITIES（両者を同期させること）。
    -- ハード CHECK ではなくトリガー正規化にしたのは、既存在庫に許可外の値があっても migration が
    -- 失敗せず、admin / service_role の正規化・修正経路（pass-through）も潰さないため。
    IF NEW.municipality IS NOT NULL AND NEW.municipality NOT IN (
      '秋田市', '能代市', '横手市', '大館市', '男鹿市', '湯沢市',
      '鹿角市', '由利本荘市', '潟上市', '大仙市', '北秋田市',
      'にかほ市', '仙北市', '小坂町', '上小阿仁村', '藤里町',
      '三種町', '八峰町', '五城目町', '八郎潟町', '井川町',
      '大潟村', '美郷町', '羽後町', '東成瀬村'
    ) THEN
      NEW.municipality := NULL;
    END IF;
    -- reporter_ip は set_post_reporter_ip トリガーが後続で正しい値を入れるため上書きしない
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_post_insert_columns ON posts;
CREATE TRIGGER enforce_post_insert_columns
  BEFORE INSERT ON posts FOR EACH ROW EXECUTE FUNCTION protect_post_insert_columns();

COMMENT ON FUNCTION protect_post_insert_columns() IS
  'REQ-034 / REQ-243 / REQ-244: 一般ユーザー INSERT 時、運用制御列（status/is_official 等）・公開レベル・サーバ付与地理メタデータ列（locality/water_body/is_on_water/elevation_m/geo_enriched_at/geo_source）を強制リセットし、municipality を許可リストへ正規化する。admin / service_role は素通り。';

COMMIT;
