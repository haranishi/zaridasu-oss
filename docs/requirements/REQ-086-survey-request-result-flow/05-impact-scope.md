## 影響範囲

### コード変更
| ファイル | 変更内容 |
|---|---|
| `src/views/SurveyRequestPage.tsx` | `handleRespondClick` を URL クエリ付き push に変更 |
| `src/views/HomePage.tsx` | `surveyRequest` クエリを検出して PostForm を開く |
| `src/components/features/posts/PostForm.tsx` | `survey_request_id` を受け取り insert に付与 |
| `src/components/features/posts/SurveyRequestBanner.tsx`（新規） | 紐付けバナー UI |
| `src/i18n/*.json` | バナー / 解除ボタン文言 |

### DB / API / Storage / マイグレーション
| ファイル | 変更内容 |
|---|---|
| `supabase/migrations/YYYYMMDD_survey_request_status_trigger.sql`（新規） | FR-086-04 のトリガー + FR-086-05 のバックフィル |
| `supabase/schema.sql` | 同等定義の追記（既存運用ルールに従い） |

---
