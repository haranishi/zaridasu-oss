## 実装優先度と計画

| 優先度 | 項目 | 依存 | 見積もり | ステータス |
|---|---|---|---|---|
| **P0** | `survey_request_comments` テーブル + RLS | なし | S | TODO |
| P0 | spam-check / レート制限トリガー | テーブル | XS | TODO |
| P0 | ソフトデリート RPC | テーブル | XS | TODO |
| P1 | useSurveyRequestComments hook | DB | S | TODO |
| P1 | 詳細ページのスレッド UI | hook | S | TODO |
| P2 | 統合タイムライン view + UI | 上記 | M | TODO |
| P2 | 通知 event_type 追加（REQ-088 連携） | REQ-088 完了 | S | TODO |
| P3 | 単体テスト（RLS / 削除 / spam） | 全部 | M | TODO |

合計工数: **M（1〜2 日）**

---

## サマリー

調査依頼に直接コメントできるスレッドを追加し、会話の分散を解消する最終 Phase。新規 `survey_request_comments` テーブル + 統合タイムライン view というシンプル設計で、既存 posts コメントを破壊せず両立する。通知は REQ-088 の基盤に event_type を追加するだけで実現でき、Phase 4 完了後の自然な仕上げ作業として位置付く。

### 次のアクション
1. テーブル + RLS + spam-check + ソフトデリート RPC のマイグレーション作成
2. `useSurveyRequestComments` hook と詳細ページのスレッド UI を実装
3. 統合タイムライン view を追加し、UnifiedTimeline コンポーネントで描画
4. REQ-088 の通知 Edge Function に `comment_created` event_type を追加して完了
