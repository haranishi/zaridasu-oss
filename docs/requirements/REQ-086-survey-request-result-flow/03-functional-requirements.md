## 機能要件

### FR-086-01: 詳細ページの「調査結果を投稿する」改修
- **説明:** `SurveyRequestPage.tsx` の `handleRespondClick` を URL クエリで引き継ぐ
- **入力:** request.id, request.species, request.lat, request.lng, request.municipality
- **処理:**
  1. `router.push('/?surveyRequest=<id>')` で遷移（HomePage 上で PostForm を開く既存導線を活用）
  2. または `/post/new?surveyRequest=<id>` 専用ルートを用意してもよい（既存 PostForm がモーダルなら state 引き渡しで OK）
- **出力:** PostForm が `survey_request_id` を受け取った状態で表示される

### FR-086-02: PostForm が `survey_request_id` を受け取って保存
- **説明:** PostForm 側で URL クエリ or props から id を受け取り、insert 時に付与
- **処理:**
  1. クエリ `surveyRequest=<uuid>` を `useSearchParams` で取得
  2. UUID バリデーション（形式チェックのみ。実在は FK 制約に委ねる）
  3. `posts.insert({ ..., survey_request_id })` で送信
  4. 投稿成功後、フォームを閉じてトースト表示
- **エラー:** UUID 形式不正の場合は survey_request_id を送らずに通常投稿として処理（フォールバック）

### FR-086-03: 「依頼への返信」バナー表示
- **説明:** PostForm 上部に元依頼の概要を表示
- **要素:**
  - 種別 + 市区町村 + reason の冒頭 40 文字
  - 「依頼を見る」リンク（新タブ）
  - 「紐付けを解除」ボタン（誤クリック対策）
- **挙動:** 解除ボタンで `?surveyRequest=` を URL から削除、通常投稿に戻す

### FR-086-04: status 自動遷移トリガー
- **説明:** `posts` への INSERT で `survey_request_id` が non-null なら親の status を更新
- **DDL:**
  ```sql
  CREATE OR REPLACE FUNCTION mark_survey_request_responded()
  RETURNS TRIGGER AS $$
  BEGIN
    IF NEW.survey_request_id IS NOT NULL THEN
      UPDATE survey_requests
        SET status = 'responded'
        WHERE id = NEW.survey_request_id
          AND status = 'open';
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  DROP TRIGGER IF EXISTS posts_mark_survey_responded ON posts;
  CREATE TRIGGER posts_mark_survey_responded
    AFTER INSERT ON posts
    FOR EACH ROW EXECUTE FUNCTION mark_survey_request_responded();
  ```
- **冪等性:** WHERE status = 'open' により closed や既存 responded には影響なし

### FR-086-05: バックフィル SQL（任意）
- **説明:** 既に `survey_request_id` が入っているが status が open のままの依頼を一括更新
- **マイグレーション末尾に 1 行:**
  ```sql
  UPDATE survey_requests sr
    SET status = 'responded'
    WHERE sr.status = 'open'
      AND EXISTS (SELECT 1 FROM posts p WHERE p.survey_request_id = sr.id);
  ```

---
