## 影響範囲

### コード変更
| ファイル | 変更内容 |
|---|---|
| `src/views/SurveyRequestPage.tsx` | コメントスレッドコンポーネントを統合 |
| `src/components/comments/SurveyRequestThread.tsx`（新規） | スレッド UI |
| `src/hooks/useSurveyRequestComments.ts`（新規） | コメント取得 / 投稿 / 削除 |
| `src/components/comments/UnifiedTimeline.tsx`（新規・任意） | 統合タイムライン |
| `supabase/functions/notify-survey-request/index.ts` | コメント event_type 追加 |
| `src/i18n/*.json` | コメント関連文言 |

### DB / API / Storage / マイグレーション
| ファイル | 変更内容 |
|---|---|
| `supabase/migrations/YYYYMMDD_survey_request_comments.sql`（新規） | テーブル / RLS / RPC / view / Webhook |
| `supabase/schema.sql` | 同等定義の追記 |

---
