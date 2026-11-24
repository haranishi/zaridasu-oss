## 機能要件（全 Phase 共通の俯瞰）

詳細は各 Phase ドキュメント参照。

| ID | 機能 | Phase | 担当ドキュメント |
|---|---|---|---|
| FR-084-01 | `/requests` 一覧ページ + フィルタ + ソート | 1 | REQ-085 |
| FR-084-02 | 既存 `useSurveyRequests` の filter 強化 | 1 | REQ-085 |
| FR-084-03 | 結果投稿時の `survey_request_id` 引き継ぎ | 2 | REQ-086 |
| FR-084-04 | DB トリガーで status を `responded` に自動遷移 | 2 | REQ-086 |
| FR-084-05 | `survey_request_responses` テーブルと「協力する」 UI | 3 | REQ-087 |
| FR-084-06 | `response_count` の自動更新トリガー | 3 | REQ-087 |
| FR-084-07 | `notify-survey-request` Edge Function | 4 | REQ-088 |
| FR-084-08 | 通知 opt-out 設定（user_profiles） | 4 | REQ-088 |
| FR-084-09 | `survey_request_comments` の直結スレッド | 5 | REQ-089 |
| FR-084-10 | 既存 posts コメントとの両立移行 | 5 | REQ-089 |

---

## 非機能要件（全 Phase 共通）

### パフォーマンス
- `/requests` 一覧の初回 LCP は **3 秒以内**（モバイル 4G 想定）
- フィルタ切替は **クライアント側で 200ms 以内** に反映
- 通知 Edge Function は **依頼作成から 30 秒以内** に送信完了

### セキュリティ
- 全 Phase で **RLS の owner-only ポリシーを破らない**
- 通知メールに **位置情報の生座標を含めない**（市区町村粒度まで）
- `survey_request_responses` の重複防止は DB unique 制約で保証
- 応答 / コメントにも既存 spam-check（REQ-007 系）を適用

### UX
- すべてのアクションボタンは **ログイン誘導付き**（未ログインで押下時はサインインページへ）
- 通知は **opt-out 可能**（user_profiles に `notify_survey_request boolean default true`）
- モバイルファーストで bottom-sheet モーダルを優先

### 可用性
- 通知 Edge Function 失敗時も **依頼作成・応答自体は成功させる**（フェイルオープン）
- マイグレーションは **後方互換**（既存依頼の status / response_count は維持）

---
