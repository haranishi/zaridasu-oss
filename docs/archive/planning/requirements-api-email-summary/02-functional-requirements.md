## 機能要件

**F1: ユーザー通知設定**

```sql
CREATE TABLE user_notification_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  weekly_summary_enabled BOOLEAN DEFAULT FALSE NOT NULL,
  filter_municipalities TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

RLS: `user_id = auth.uid()` で全操作許可（自分の設定のみ閲覧・変更可能）

**F2: 週次メールのコンテンツ**

件名: `🦞 ザリダス週次レポート - MM月DD日〜MM月DD日`

HTML 本文に含める情報:
- 先週の総投稿数（前週比の増減）
- 種別ごとの投稿数（アメリカザリガニ / ウシガエル）
- 市区町村ランキング Top 5
- 新規投稿の直近 3 件（種別・情報種別・市区町村・日付）
- 「詳細を見る」ボタン（サイト URL リンク）
- 購読解除リンク（ダッシュボード設定へのリンク）

ブランドカラー: `#dc2626`（既存の `notify-comment` テンプレートに合わせる）

**F3: pg_cron スケジュール**

```sql
SELECT cron.schedule(
  'weekly-summary',
  '0 0 * * 1',  -- 毎週月曜 0:00 UTC（日本時間 09:00）
  $$
    SELECT net.http_post(
      url := 'https://<project>.supabase.co/functions/v1/send-weekly-summary',
      headers := '{"x-cron-secret":"<CRON_SECRET>"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
```

**F4: `send-weekly-summary` Edge Function**

- `x-cron-secret` ヘッダー検証（不一致 → 401）
- `weekly_summary_enabled = TRUE` のユーザーを取得
- 各ユーザーの `filter_municipalities` でフィルタリングした先週投稿データを集計
- Resend API でメール送信（既存 `RESEND_API_KEY` を再利用）
- 送信ログを `email_send_logs` テーブルに記録（冪等性確保）

**F5: DashboardPage の通知設定 UI**

- 「週次サマリーメール」トグルスイッチ
- 「通知する市区町村を絞る」複数選択 UI（MUNICIPALITIES 配列から選択）
- 設定変更は即時 Supabase に保存

---
