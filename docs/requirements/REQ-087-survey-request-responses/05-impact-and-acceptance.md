## 影響範囲

### コード変更
| ファイル | 変更内容 |
|---|---|
| `src/views/SurveyRequestPage.tsx` | 「協力する」ボタン + 応答者一覧 |
| `src/views/SurveyRequestsListPage.tsx`（REQ-085）| カードに応答数表示 |
| `src/hooks/useSurveyResponses.ts`（新規） | 応答取得 / 作成 / 取消し |
| `src/components/survey/ResponseList.tsx`（新規） | 応答者一覧 UI |
| `src/i18n/*.json` | ボタン / 一覧文言 |

### DB / API / Storage / マイグレーション
| ファイル | 変更内容 |
|---|---|
| `supabase/migrations/YYYYMMDD_survey_request_responses.sql`（新規） | FR-087-01 〜 04 のテーブル / トリガー / RLS |
| `supabase/schema.sql` | 同等定義の追記 |
| `src/types/post.ts` または新規 `src/types/surveyResponse.ts` | 型定義追加 |

---

## 受け入れ基準

| ID | 受け入れ基準 |
|---|---|
| AC-087-01 | 詳細ページで「協力する」ボタンを押すと応答が記録され、ボタン表示が切り替わる |
| AC-087-02 | 同じ依頼に同一ユーザーが 2 回応答しようとすると DB unique 制約で拒否される |
| AC-087-03 | 取消し操作で応答が DELETE され、`response_count` が減る |
| AC-087-04 | 24h で 20 応答を超えるとトリガーで例外が発生し、UI でトースト表示 |
| AC-087-05 | closed な依頼への応答は BEFORE INSERT トリガーで拒否される |
| AC-087-06 | 詳細ページに最大 10 件の応答者アバター一覧が新しい順で表示される |
| AC-087-07 | 一覧ページのカードに応答数が表示される |
| AC-087-08 | 自分の依頼ではボタンが非表示 |
| AC-087-09 | 既存 RLS / 応答テストが通る |

---
