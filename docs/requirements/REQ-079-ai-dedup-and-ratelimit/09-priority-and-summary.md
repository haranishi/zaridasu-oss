## 実装優先度と計画

| 優先度 | 項目 | 依存 | 見積もり | ステータス |
|---|---|---|---|---|
| P1 | DB マイグレーション（カラム追加 + index） | なし | S | TODO |
| P1 | column-protection trigger 拡張 | マイグレーション | S | TODO |
| P1 | クライアント hash 計算ユーティリティ | なし | S | TODO |
| P1 | usePostForm への hash 組み込み | クライアント lib | S | TODO |
| P2 | Edge Function dedup ロジック | hash カラム | S | TODO |
| P2 | reanalysis rate limit ロジック | なし | S | TODO |
| P3 | column-protection の RLS テスト追加 | trigger 拡張 | S | TODO |
| P3 | dedup hit 率の監視（管理画面拡張） | REQ-075 ダッシュボード | S | TODO |

---

## サマリー

Phase 4 は **DB 変更 + クライアント変更 + Edge Function 変更**の 3 層に渡る変更だが、それぞれ小規模で計 1〜1.5 日。削減効果は最大 -10% と他 Phase より小さいが、**スパム/悪用シナリオでの安全装置**としての価値が大きい。

### 次のアクション
1. 既存 `restrict_user_columns_on_update` trigger（REQ-034）の確認とテスト被覆状況の把握
2. `AI_REANALYSIS_DAILY_LIMIT` のデフォルト値（3 が妥当か）を運用想定で議論
3. dedup の保守的運用方針: combined_decision は再計算、audio_analysis / image_analysis のみ copy、を確定
