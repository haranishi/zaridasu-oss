## 実装順序の推奨

```
STEP 1（今週）:
  REQ-008 写真アップロードロールバック実装
    → 実装後すぐに REQ-005 のテストを書ける（テスト駆動の起点）

STEP 2（来週）:
  REQ-006 Phase 1: TypeScript 環境構築（既存コード変更なし）
  REQ-005 Week 1: hooks テスト作成（REQ-008 実装を検証）

STEP 3（2-3週目）:
  REQ-006 Phase 2-3: lib/ + hooks/ の .ts 変換
  REQ-005 Week 2: AuthModal + errorHandler テスト

STEP 4（1ヶ月以内）:
  REQ-006 Phase 4: components/ の段階的 .tsx 変換
  REQ-005 CI 設定 + カバレッジ計測
```
