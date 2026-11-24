## 実装優先度と計画

| 優先度 | 項目 | 依存 | 見積もり | ステータス |
|---|---|---|---|---|
| P1 | Gemini Cached Content 最低トークン数確認 | なし | XS | TODO |
| P1 | `ai_cache_registry` マイグレーション | なし | S | TODO |
| P1 | `_shared/aiCache.ts` 共通ロジック実装 | DB | M | TODO |
| P2 | analyze-audio で cache 利用 | aiCache.ts | S | TODO |
| P2 | analyze-image で cache 利用 | aiCache.ts | S | TODO |
| P2 | TTL 自動 refresh ロジック | 上記 | S | TODO |
| P3 | cache hit 率の監視ダッシュボード | REQ-075 ダッシュボード拡張 | S | TODO |

---

## サマリー

Phase 3 は **DB テーブル 1 個 + 共通ライブラリ 1 個 + Edge Function 修正** の構成。実装自体は 1 日。最低トークン数の制約が満たせるかが事前確認の鍵。

### 次のアクション
1. Gemini Context Caching API ドキュメントで最低トークン数を確認
2. 現行プロンプトのトークン数を実測（500 tokens 前後の推定が正しいか）
3. 最低トークン数に満たない場合は参照素材で底上げする方針を決定
