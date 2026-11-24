## 目的

1. REQ-034 / REQ-079 以降に増えたカラムも含め、**一般ユーザー UPDATE から保護すべき全カラム**を `protect_post_status` で OLD 固定する
2. 本番で REQ-034 の保護が migration 順序により消えている疑いを解消し、トリガー本体を 1 箇所に集約
3. pg-tap で「保護対象カラムが UPDATE で書き換わらないこと」を全カラムについて assert する

## 要件

### 機能要件

- [ ] **FR-136-01: `protect_post_status` の再拡張**
  新規 migration: `supabase/migrations/20260513000008_protect_post_status_full_columns.sql`
  ```sql
  BEGIN;

  CREATE OR REPLACE FUNCTION protect_post_status() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  DECLARE
    jwt_claims jsonb;
  BEGIN
    BEGIN
      jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RETURN NEW;
    END;

    IF jwt_claims IS NULL OR jwt_claims = '{}'::jsonb THEN RETURN NEW; END IF;
    IF (jwt_claims ->> 'role') = 'service_role' THEN RETURN NEW; END IF;

    IF (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
      -- status 系 (REQ-034)
      NEW.status               := OLD.status;
      NEW.rejection_reason     := OLD.rejection_reason;
      NEW.rejection_message    := OLD.rejection_message;
      NEW.reviewed_at          := OLD.reviewed_at;
      NEW.reviewed_by          := OLD.reviewed_by;
      NEW.auto_approved        := OLD.auto_approved;

      -- 運用制御 (REQ-034)
      NEW.is_official          := OLD.is_official;
      NEW.is_flagged           := OLD.is_flagged;
      NEW.reporter_ip          := OLD.reporter_ip;

      -- AI 関連 (REQ-034 / REQ-125 / REQ-128)
      NEW.ai_result            := OLD.ai_result;
      NEW.ai_analyzed_at       := OLD.ai_analyzed_at;
      NEW.ai_failure_count     := OLD.ai_failure_count;

      -- hash 改竄禁止 (REQ-079)
      NEW.audio_hash           := OLD.audio_hash;
      NEW.image_hashes         := OLD.image_hashes;

      -- 音声 (REQ-070 / REQ-082)
      NEW.audio_url            := OLD.audio_url;
      NEW.audio_duration_ms    := OLD.audio_duration_ms;

      -- 気象 (REQ-051 系)
      NEW.weather              := OLD.weather;
      NEW.temperature          := OLD.temperature;
      NEW.humidity             := OLD.humidity;

      -- 調査依頼 (REQ-084 系)
      NEW.survey_request_id    := OLD.survey_request_id;
      NEW.survey_duration_minutes := OLD.survey_duration_minutes;

      -- 所有権 (二重防御。policy でも守られる)
      NEW.user_id              := OLD.user_id;
    END IF;

    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS enforce_post_status ON posts;
  CREATE TRIGGER enforce_post_status
    BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION protect_post_status();

  COMMENT ON FUNCTION protect_post_status() IS
    'REQ-034 / REQ-079 / REQ-136: 一般ユーザー UPDATE 時、運用・AI・hash・音声・気象・調査・所有権カラムを OLD に固定。admin / service_role は素通り。';

  COMMIT;
  ```

- [ ] **FR-136-02: `supabase/schema.sql` の同期**
  schema.sql:540-578 の `protect_post_status` 定義を FR-136-01 と同一内容に置換し、以後の migration（20260424000001 等）で再上書きされても整合が崩れないよう、`supabase/schema.sql` を `protect_post_status` 定義の **正本** にする。

- [ ] **FR-136-03: 一般ユーザーが UPDATE してよいカラムの明示**
  本 REQ で OLD 固定する列以外（`lat`, `lng`, `species`, `info_type`, `municipality`, `comment`, `photos`, `count`, `observed_at`, `is_anonymous`, `updated_at`）が「投稿者が編集 UI から触ってよい列」になる。`docs/architecture/posts-column-policy.md`（新規 or 既存）に対応表を残す（簡易でよい）。

- [ ] **FR-136-04: 編集 UI 側の整合確認**
  `src/views/EditPostPage.tsx` / `src/components/forms/PostForm.tsx`（該当箇所）で、UPDATE 時に保護対象カラムを送らないことを確認。送っていても DB トリガーで OLD に戻るので動作上は問題ないが、無駄な payload を送らない方が望ましい。本 REQ では検出のみ、修正は別 PR でも可。
