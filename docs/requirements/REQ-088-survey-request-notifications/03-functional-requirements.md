## 機能要件

### FR-088-01: `user_profiles` に通知設定カラム追加
- **DDL:**
  ```sql
  ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS notify_survey_request BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notify_response_digest BOOLEAN NOT NULL DEFAULT TRUE;
  ```
- **マイグレーション:** カラム追加 + 既存ユーザーは true（既定値）

### FR-088-02: Edge Function `notify-survey-request` 新規
- **配置:** `supabase/functions/notify-survey-request/index.ts`
- **入力:** Webhook payload `{ event_type, request_id, ... }`
- **処理:**
  1. event_type に応じて通知対象を抽出
  2. opt-out フラグを確認
  3. Resend API でメール送信
  4. 失敗時は audit_logs に記録（fail-soft）
- **冪等性:** 同一 event_id を 5 分以内に再受信した場合は無視（in-memory または DB）

### FR-088-03: 新規依頼通知（即時）
- **トリガー:** `survey_requests INSERT` の AFTER トリガー → pg_net で Edge Function 起動
- **対象抽出:**
  ```sql
  SELECT id, email FROM user_profiles up JOIN auth.users u ON u.id = up.id
    WHERE up.municipality = NEW.municipality
      AND up.notify_survey_request = TRUE
      AND up.id != NEW.user_id
  ```
- **テンプレート:** 種別 / 緊急度 / 市区町村 / 依頼へのリンク

### FR-088-04: 結果投稿通知（即時）
- **トリガー:** `survey_requests UPDATE` で `status: open → responded` を検知
- **対象:** `survey_requests.user_id`（依頼者本人）
- **テンプレート:** 結果投稿者の display_name + 冒頭 80 文字 + 投稿リンク

### FR-088-05: 応答通知（ダイジェスト）
- **方式:** 即時送信ではなく 1 日 1 回バッチ（Supabase scheduled function or cron）
- **集約:** 過去 24h で発生した応答を依頼者ごとに集約し 1 通にまとめる
- **テンプレート:** 「過去 24 時間で N 件の協力がありました」

### FR-088-06: クローズ通知（即時）
- **トリガー:** `survey_requests UPDATE` で `status: * → closed`
- **対象:** 当該依頼の応答者全員 + 結果投稿者全員
- **テンプレート:** 「協力していた依頼がクローズされました」+ 結果まとめへのリンク

### FR-088-07: 通知 opt-out
- **方式:** メール末尾にトークン付き unsubscribe リンク
- **エンドポイント:** `/api/unsubscribe?token=<jwt>` で対応カラムを false に更新
- **設定画面:** マイページ → 設定で notify_survey_request / notify_response_digest を切替

---
