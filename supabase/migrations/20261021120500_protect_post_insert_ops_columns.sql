-- security-hardening 要件6: 新規投稿で、運用側の値（研究採用日時・採用通知日時・AI失敗回数）を申告できないようにする。
--
-- 原因: protect_post_insert_columns は、一般ユーザーの INSERT で status・AI結果・地理メタデータなどを
--   強制的に初期化するが、研究採用の2列と ai_failure_count が対象から抜けていた（UPDATE 側は protect_post_status が
--   旧値に固定している）。一般会員は、新規投稿に「採用済み」「通知済み」を付けて保存でき、後で管理者が正式に
--   採用しても、通知済みを理由に採用通知が送られなかった（notify-research-adopted の already_notified）。
--   投稿の status は pending に戻るので、承認そのものの偽装ではない。
-- 修正: 一般ユーザーの INSERT で、3列を初期値にそろえる。管理者・service_role・SQL の直接実行（移行・取り込み）は
--   従来どおり素通り。
BEGIN;

CREATE OR REPLACE FUNCTION public.protect_post_insert_columns()
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
    -- security-hardening 要件6: 研究採用（日時・通知済み日時）と AI 失敗回数は、運用側（管理者・service_role）が
    -- 決める値。新規投稿で申告させない。UPDATE では protect_post_status が旧値に固定していたが、INSERT には
    -- 抜けがあり、「採用済み・通知済み」を偽って、後の正規の採用通知を止められた。
    NEW.research_adopted_at          := NULL;
    NEW.research_adopted_notified_at := NULL;
    NEW.ai_failure_count             := 0;
    -- REQ-243 / REQ-329: 公開レベルは種ごとの既定（無ければ coarsened）。ただし投稿者が
    -- 'hidden'（位置を非公開）を選んだときだけはそれを尊重する。「より伏せる」方向にしか動かない。
    NEW.location_disclosure := CASE
      WHEN NEW.location_disclosure = 'hidden' THEN 'hidden'
      ELSE COALESCE(
        (SELECT sld.default_disclosure FROM species_location_defaults sld WHERE sld.species = NEW.species),
        'coarsened'
      )
    END;
    -- REQ-244 FR-244-01: サーバ付与専用の地理メタデータ列は一般ユーザー INSERT で常に NULL 化する。
    NEW.locality        := NULL;
    NEW.water_body      := NULL;
    NEW.is_on_water     := NULL;
    NEW.elevation_m     := NULL;
    NEW.geo_enriched_at := NULL;
    NEW.geo_source      := NULL;
    -- REQ-244 FR-244-02: municipality は許可リスト（秋田県 25 市町村）以外を正規化（NULL 化）する。
    -- 許可リストの正本は src/lib/constants.ts の MUNICIPALITIES（両者を同期させること）。
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

COMMIT;
