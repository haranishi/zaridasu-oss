## 影響範囲（全 Phase 集約）

### コード変更想定
| ファイル | Phase | 変更内容 |
|---|---|---|
| `src/app/requests/page.tsx`（新規） | 1 | 一覧ページのエントリ |
| `src/views/SurveyRequestsListPage.tsx`（新規） | 1 | 一覧 UI 本体 |
| `src/hooks/useSurveyRequests.ts` | 1, 3 | filter 拡張 / 応答 hook 追加 |
| `src/views/SurveyRequestPage.tsx` | 2, 3 | 結果投稿ボタン / 協力ボタン |
| `src/components/features/posts/PostForm.tsx` | 2 | survey_request_id を URL から拾う |
| `src/views/HomePage.tsx` | 2 | 結果投稿リクエスト state の受け渡し |
| `supabase/functions/notify-survey-request/index.ts`（新規） | 4 | 近隣 / 投稿者通知 |
| `supabase/migrations/YYYYMMDD_*.sql`（新規） | 2,3,5 | trigger / responses table / comments table |
| `src/components/comments/SurveyRequestThread.tsx`（新規） | 5 | 直結コメント UI |

### 環境変数追加
| 変数名 | 用途 | Phase |
|---|---|---|
| `NOTIFY_SURVEY_REQUEST_ENABLED` | 通知の段階的ロールアウト用フラグ | 4 |
| `RESEND_API_KEY` | 既存。Phase 4 でメール送信に流用 | 4 |
| `NOTIFY_RADIUS_KM` | 通知対象を距離で絞る場合の半径（市区町村優先） | 4 |

### DB スキーマ変更
- Phase 2: `posts → survey_requests` の status 自動遷移トリガー
- Phase 3: `survey_request_responses` 新規テーブル + `response_count` 更新トリガー
- Phase 5: `survey_request_comments` 新規テーブル（または既存 `comments` の拡張）

---

## 受け入れ基準（プロジェクト全体）

| ID | 受け入れ基準 |
|---|---|
| AC-084-01 | Phase 1 完了時点で `/requests` が公開され、フィルタ / ソートが機能する |
| AC-084-02 | Phase 2 完了時点で「調査結果を投稿する」から作成された posts に `survey_request_id` が確実に入り、依頼の status が `responded` に遷移する |
| AC-084-03 | Phase 3 完了時点で詳細ページに応答数と応答者一覧が表示され、重複応答が防止される |
| AC-084-04 | Phase 4 完了時点で同一市区町村の opt-in ユーザーに通知メールが届く |
| AC-084-05 | Phase 5 完了時点で詳細ページで直接コメントが読み書きでき、posts コメントとの混在が解消される |
| AC-084-06 | 全 Phase 完了時点で完成度 100%（既知ギャップ表が全て解消） |

---
