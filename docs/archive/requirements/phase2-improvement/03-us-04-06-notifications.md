### US-04: アプリ内通知センター

```
As a 登録ユーザー,
I want to 自分の投稿へのコメント・いいね・承認結果を一箇所で確認したい,
So that 重要な更新を見逃さない.

受け入れ条件:
- [ ] notifications テーブルを新規作成（type, user_id, post_id, message, read, created_at）
- [ ] Header のベルアイコンに未読数バッジを表示する
- [ ] 通知一覧ページ（/dashboard/notifications）で全通知を時系列表示する
- [ ] 個別既読・全件既読マーク機能を実装する
- [ ] Supabase Realtime で新着通知をリアルタイム受信する
- [ ] 通知タイプ: comment, like, post_approved, post_rejected, badge_earned
```

**DB スキーマ:**
```sql
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'comment', 'like', 'post_approved', 'post_rejected', 'badge_earned'
  )),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read)
  WHERE read = FALSE;
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE USING (auth.uid() = user_id);
```

**優先度: 高** | **影響度: 大** | **実装コスト: 中**

---

### US-05: PWA プッシュ通知

```
As a モバイルユーザー,
I want to アプリを開いていなくても新着通知を受け取りたい,
So that 外来生物情報をリアルタイムで把握できる.

受け入れ条件:
- [ ] Web Push API + VAPID キーによるプッシュ通知を実装する
- [ ] push_subscriptions テーブルで端末ごとの購読情報を管理する
- [ ] 通知設定ページ（/dashboard/settings）で種類別ON/OFF切替可能にする
- [ ] Supabase Edge Function でプッシュ送信処理を実行する
- [ ] iOS Safari では「ホーム画面に追加」後のみ有効であることを案内する
- [ ] 通知許可ダイアログは初回投稿完了後に表示する（初回訪問時には表示しない）
```

**優先度: 中** | **影響度: 大** | **実装コスト: 大**

---

### US-06: 地域別アラート設定

```
As a 特定地域に関心のあるユーザー,
I want to 関心地域に新しい投稿があった時に通知を受けたい,
So that 自分の地域の外来生物状況を追跡できる.

受け入れ条件:
- [ ] user_alert_settings テーブルで関心地域（municipality[]）を管理する
- [ ] 通知設定ページで市区町村を複数選択可能にする
- [ ] 承認された投稿の municipality がユーザーの関心地域に一致した場合に通知を発行する
- [ ] 通知頻度の選択肢: リアルタイム / 1日1回ダイジェスト
```

**優先度: 中** | **影響度: 中** | **実装コスト: 中**

---

