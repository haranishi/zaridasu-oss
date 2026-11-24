## 機能要件

### FR-087-01: `survey_request_responses` テーブル新設
- **DDL:**
  ```sql
  CREATE TABLE IF NOT EXISTS survey_request_responses (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id  UUID NOT NULL REFERENCES survey_requests(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (request_id, user_id)
  );
  CREATE INDEX idx_responses_request ON survey_request_responses(request_id);
  CREATE INDEX idx_responses_user ON survey_request_responses(user_id);
  ```
- **RLS:**
  - SELECT: 全員（応答者一覧公開のため）
  - INSERT: `auth.uid() = user_id` かつ親依頼が closed でないこと（チェックは関数で）
  - DELETE: `auth.uid() = user_id`
  - UPDATE: 不可（応答にメタ情報を持たないため）

### FR-087-02: `response_count` 同期トリガー
- **DDL:**
  ```sql
  CREATE OR REPLACE FUNCTION sync_survey_response_count()
  RETURNS TRIGGER AS $$
  BEGIN
    IF (TG_OP = 'INSERT') THEN
      UPDATE survey_requests SET response_count = response_count + 1
        WHERE id = NEW.request_id;
    ELSIF (TG_OP = 'DELETE') THEN
      UPDATE survey_requests SET response_count = GREATEST(response_count - 1, 0)
        WHERE id = OLD.request_id;
    END IF;
    RETURN NULL;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  CREATE TRIGGER survey_responses_count_sync
    AFTER INSERT OR DELETE ON survey_request_responses
    FOR EACH ROW EXECUTE FUNCTION sync_survey_response_count();
  ```

### FR-087-03: closed 依頼への応答禁止
- **説明:** BEFORE INSERT トリガーで親 status を確認し、closed なら例外
- **DDL 抜粋:**
  ```sql
  CREATE OR REPLACE FUNCTION block_response_to_closed()
  RETURNS TRIGGER AS $$
  DECLARE s TEXT;
  BEGIN
    SELECT status INTO s FROM survey_requests WHERE id = NEW.request_id;
    IF s = 'closed' THEN
      RAISE EXCEPTION 'クローズ済みの依頼には応答できません';
    END IF;
    RETURN NEW;
  END; $$ LANGUAGE plpgsql SECURITY DEFINER;
  ```

### FR-087-04: レート制限トリガー
- **説明:** 既存 `check_survey_request_rate_limit` を踏襲し、24h で 20 応答まで
- **DDL:** （既存パターン参照）
- **admin はバイパス**

### FR-087-05: 詳細ページ UI 改修
- **説明:** `SurveyRequestPage.tsx` にボタンと一覧を追加
- **要素:**
  - 「協力する」ボタン（未応答時）/「協力中（取消す）」（応答済み）
  - 応答数バッジ
  - 応答者一覧（最大 10 件、スクロール）
  - 自分が立てた依頼ではボタン非表示
  - 未ログイン時はサインインへ誘導

### FR-087-06: 一覧ページ / カード UI への応答数表示
- **説明:** REQ-085 で実装した一覧カードに `response_count` を追加
- **挙動:** 0 のときはアイコンのみ薄表示、1 以上で数値表示

### FR-087-07: 応答 hook の追加
- **説明:** `src/hooks/useSurveyResponses.ts`（新規）
- **API:**
  ```ts
  useSurveyResponses(requestId: string): {
    responses: { user_id, display_name, avatar_emoji }[],
    hasResponded: boolean,
    respond: () => Promise<void>,
    cancelResponse: () => Promise<void>,
    loading: boolean
  }
  ```

---
