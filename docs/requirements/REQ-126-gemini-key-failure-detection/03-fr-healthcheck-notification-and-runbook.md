#### C. ヘルスチェック

- [ ] **FR-126-07: `health-gemini` Edge Function**
  新規 `supabase/functions/health-gemini/index.ts` を作成:
  - admin 認証必須（JWT の `app_metadata.role === 'admin'` を verify）
  - `gemini-2.5-flash-lite` に対して 1 トークン以下の最小プロンプト（例: `"ok"` のみ）で `generateContent` を叩く
  - レスポンスを以下の形式で返す:
    ```ts
    { ok: true, model: 'gemini-2.5-flash-lite', latency_ms: 234 }
    // または
    { ok: false, status: 400, error_kind: 'gemini_auth', message: 'API key not valid' }
    ```
  - 結果は **`ai_call_logs` には記録しない**（ヘルスチェックでログを汚さない）

- [ ] **FR-126-08: ヘルスチェック UI ボタン**
  `src/views/admin/AdminDashboard.tsx` 末尾（または専用の「システムステータス」セクション）に「🔍 Gemini API ヘルスチェック」ボタンを追加:
  - クリックで `supabase.functions.invoke('health-gemini')` を呼ぶ
  - 結果を toast 表示（`ok: true` → 緑 / `ok: false` → 赤 + status コード）
  - 連打防止のため 10 秒間 disabled

#### D. プッシュ通知

- [ ] **FR-126-09: `notify-gemini-key-failure` Edge Function**
  新規 `supabase/functions/notify-gemini-key-failure/index.ts` を作成。トリガは pg_cron で 5 分ごと実行（DB 経由）または `ai_call_logs` の INSERT webhook:
  - 直近 1 時間で `error_kind='gemini_auth'` が `THRESHOLD` 回（既定 3）以上発生していて、かつ過去 24 時間内に通知未送信なら、`ADMIN_NOTIFY_EMAIL` 宛にメール送信
  - 既存の Resend 実装パターン (`notify-post-status/index.ts:175` の `fetch('https://api.resend.com/emails', ...)`) を踏襲
  - 通知済みフラグは新規テーブル `admin_alerts` で管理（または `ai_call_logs` に `alert_sent_at` カラム追加）

- [ ] **FR-126-10: 環境変数の追加**
  - `ADMIN_NOTIFY_EMAIL`: アラート送信先（カンマ区切りで複数可）
  - `GEMINI_AUTH_FAILURE_THRESHOLD`: 通知トリガの閾値（既定 3）
  - `GEMINI_AUTH_NOTIFY_INTERVAL_HOURS`: 同種通知の最小間隔（既定 24）
  - `.env.example` と Supabase Edge Function Secrets 両方に追加

#### E. ドキュメント

- [ ] **FR-126-11: `docs/runbooks/gemini-key-rotation.md` 作成**
  以下を含む runbook:
  1. **トリガ**: 管理画面に「Gemini API キーが無効です」バナーが出た / メール通知が来た
  2. **影響範囲**: AI 種判定が停止、auto_approved = false で全件 pending
  3. **手順**:
     - https://aistudio.google.com/app/apikey で新キー発行
     - Supabase Dashboard → Edge Functions → Secrets で `GEMINI_API_KEY` を**直接編集**（チャット / CLI に貼らない）
     - 管理画面のヘルスチェックボタンで `ok: true` を確認
     - 旧キーを AI Studio で Revoke
  4. **検証**: 失敗投稿に対して「再判定する」を実行 → posts.ai_result.error が消えれば完了
  5. **エスカレーション**: ヘルスチェックが復旧しない場合の確認項目（モデル名・API enable 状態・billing）
