## リスク・トレードオフ

| リスク | 緩和策 |
|---|---|
| `response_count` とテーブル件数が不整合 | AFTER トリガーで同期、月次バッチで再計算 SQL を実行可能に |
| 既存 `response_count` カラムを廃止すべきかの判断 | 集計キャッシュとして残す（一覧の N+1 を防ぐ） |
| 応答スパムによる UI ノイズ | レート制限 + 1 依頼 1 応答の unique 制約で抑制 |
| 応答取消しの誤操作 | UI で「協力中」表示時のみ取消し可能、押し直しで取消し（確認ダイアログ無し） |
| 通知（REQ-088）との結合度 | 通知は応答 INSERT を pg_net Webhook で拾う方式とし、本 Phase ではフックポイントだけ用意 |
| 応答機能と既存 likes 機能の混乱 | likes は posts 用、responses は survey_requests 用と用途を明確に分離 |

---

## 実装優先度と計画

| 優先度 | 項目 | 依存 | 見積もり | ステータス |
|---|---|---|---|---|
| **P0** | `survey_request_responses` テーブル + RLS | なし | S | TODO |
| P0 | response_count 同期トリガー | テーブル | XS | TODO |
| P0 | closed ガード + レート制限トリガー | テーブル | XS | TODO |
| P1 | useSurveyResponses hook | DB | S | TODO |
| P1 | 詳細ページの「協力する」UI | hook | S | TODO |
| P1 | 応答者一覧 UI | hook | S | TODO |
| P2 | 一覧カードに応答数表示 | REQ-085 完了 | XS | TODO |
| P2 | 単体テスト（unique / closed / レート制限） | DB | M | TODO |

合計工数: **L（2〜3 日）**

---

## サマリー

軽量アクション「協力する」を追加することで、調査依頼への中間関与を可能にする。`survey_request_responses` テーブルを新設し、`response_count` を集計キャッシュとして同期するハイブリッド方式を採用。重複防止 / レート制限 / closed ガードはすべて DB トリガーで担保し、UI は楽観的更新で軽快に。

### 次のアクション
1. マイグレーションを作成しローカル supabase で RLS / トリガー検証
2. `useSurveyResponses` hook を実装
3. 詳細ページに「協力する」UI と応答者一覧を統合
4. Phase 4（REQ-088 通知）に応答 INSERT を Webhook トリガーとして渡す
