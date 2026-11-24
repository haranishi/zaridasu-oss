## 影響範囲

### コード変更
| ファイル | 変更内容 |
|---|---|
| `supabase/functions/notify-survey-request/index.ts`（新規） | 通知ハンドラ |
| `supabase/migrations/YYYYMMDD_notify_survey_request.sql`（新規） | カラム追加 + Webhook トリガー |
| `supabase/schema.sql` | 同等定義の追記 |
| `src/app/api/unsubscribe/route.ts`（新規） | unsubscribe エンドポイント |
| `src/views/settings/NotificationSettings.tsx`（新規 or 既存設定画面に追記） | 通知 opt-out UI |
| `src/i18n/*.json` | 通知文言キー追加 |

### 環境変数
| 変数名 | 用途 |
|---|---|
| `RESEND_API_KEY` | 既存。流用 |
| `NOTIFY_SURVEY_REQUEST_ENABLED` | 段階的ロールアウト用フラグ |
| `NOTIFY_FROM_EMAIL` | 送信元アドレス |
| `UNSUBSCRIBE_JWT_SECRET` | トークン署名用 |

### DB / API / Storage / マイグレーション
| ファイル | 変更内容 |
|---|---|
| 新規マイグレーション | user_profiles カラム追加、Webhook トリガー、scheduled function（ダイジェスト） |

---

## 受け入れ基準

| ID | 受け入れ基準 |
|---|---|
| AC-088-01 | 新規依頼作成から 30 秒以内に同一市区町村の opt-in ユーザーへメールが届く |
| AC-088-02 | 結果投稿により status が responded に変わった瞬間、依頼者にメールが届く |
| AC-088-03 | 応答通知は 24 時間ダイジェストで 1 通にまとまって届く |
| AC-088-04 | クローズ時に応答者と結果投稿者にメールが届く |
| AC-088-05 | opt-out したユーザーには通知が届かない |
| AC-088-06 | unsubscribe リンクから 1 クリックで通知停止できる |
| AC-088-07 | 通知失敗時に audit_logs に記録され、依頼作成 / 応答自体は成功する |
| AC-088-08 | メール本文に位置情報の生座標が含まれない |
| AC-088-09 | 既存 RLS / posts 通知（あれば）と干渉しない |

---
