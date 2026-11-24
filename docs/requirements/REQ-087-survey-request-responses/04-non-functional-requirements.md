## 非機能要件

### パフォーマンス
- 応答 INSERT は unique 制約 + トリガーで完結し、**P95 50ms 以内**
- 応答者一覧の取得は `idx_responses_request` で高速化
- `response_count` のトリガーは AFTER で行うため INSERT のレイテンシに影響しない

### セキュリティ
- RLS により他人の応答を作成・削除不可
- closed 依頼への応答は BEFORE INSERT トリガーで防止
- レート制限により 1 ユーザー 24h で 20 応答まで（admin バイパス）
- 応答数 `response_count` の直接 UPDATE は通常ユーザーから禁止（`restrict_user_columns` 系で保護）

### データ整合性
- 応答テーブルと `response_count` は AFTER トリガーで同期
- 万一不整合が起きた場合のリカバリ用 SQL を README またはマイグレーションコメントに記載
- ON DELETE CASCADE により親依頼削除時に応答も自動削除

### UX
- 楽観的 UI 更新（押した瞬間に状態変更、失敗時にロールバック）
- 取消し操作は確認ダイアログ無しで即実行（軽量アクション）

---
