## 実装優先度と計画

| 優先度 | 項目 | 依存 | 見積もり | ステータス |
|---|---|---|---|---|
| **P0** | next.config.ts のヘッダ修正 | なし | XS | TODO |
| P1 | エラー種別の詳細化（toast → 構造化エラー UI） | なし | S | TODO |
| P1 | 拒否時の自動フォールバック（mode='upload'） | なし | XS | TODO |
| P2 | Permissions API 事前チェック | なし | S | TODO |
| P2 | OS 別手順モーダル（MicPermissionGuide） | i18n キー | M | TODO |
| P2 | i18n キー追加 (4 言語) | なし | S | TODO |
| P3 | In-App ブラウザ検出と外部ブラウザ誘導 | なし | S | TODO |
| P3 | AudioRecorder 単体テスト | 上記実装 | M | TODO |

---

## 仮説検証マトリクス

本要件の前提となる仮説と検証手段:

| # | 仮説 | 検証 | 想定結果 |
|---|---|---|---|
| H1 | next.config.ts の `microphone=()` がブラウザ全体でマイクをブロック | 該当行を grep / 削除して再現確認 | ✅ コード行で確定 |
| H2 | ユーザーは権限ダイアログを見ていない（即拒否表示） | 別ブラウザで再現、DevTools で `navigator.permissions.query` を確認 | 推定: H1 のため確認必須 |
| H3 | iOS Safari でも同症状 | iOS 実機で確認 | 同症状想定 |
| H4 | 一部 in-app browser ではそもそも getUserMedia が無い | LINE / X 内での実機確認 | アプリ依存 |

---
