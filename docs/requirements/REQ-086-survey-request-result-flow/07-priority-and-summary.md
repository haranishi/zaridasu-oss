## 実装優先度と計画

| 優先度 | 項目 | 依存 | 見積もり | ステータス |
|---|---|---|---|---|
| **P0** | DB トリガー実装（FR-086-04） | なし | XS | TODO |
| P0 | PostForm の survey_request_id 受け渡し | クエリ規約決定 | S | TODO |
| P0 | 「調査結果を投稿する」改修 | PostForm 対応後 | XS | TODO |
| P1 | バナー UI（SurveyRequestBanner） | 上記 | S | TODO |
| P1 | バックフィル SQL | DB トリガー | XS | TODO |
| P2 | 単体テスト（トリガー / クエリ受け渡し） | 上記 | S | TODO |

合計工数: **M（1〜2 日）**

---

## サマリー

調査依頼ループの中核「依頼 → 結果投稿」を **URL クエリ + DB トリガー**の最小実装で完成させる。既存 PostForm を破壊せず、トリガーは status 列のみを操作するためセキュリティ影響も最小。Phase 3（応答機能）と Phase 4（通知）の前提となるため、本 Phase はループ全体の鍵。

### 次のアクション
1. DB トリガーのマイグレーションを作成し、ローカル supabase で検証
2. PostForm に `surveyRequest` クエリ受け取りを実装
3. 「調査結果を投稿する」ボタンの URL を更新
4. バナー UI を追加し、Phase 3（REQ-087）の応答機能に進む
