## 機能要件（全 Phase 共通の俯瞰）

詳細は各 Phase ドキュメント参照。

| ID | 機能 | Phase | 担当ドキュメント |
|---|---|---|---|
| FR-074-01 | ラベル付き評価データセット + 計測スクリプト | 0 | REQ-075 |
| FR-074-02 | 月次 API コスト集計と可視化 | 0 | REQ-075 |
| FR-074-03 | analyze-audio の Gemini モデル切り替え（A/B 評価結果に基づく） | 1 | REQ-076 |
| FR-074-04 | analyze-image の Gemini モデル安定化（preview 依存リスクの解消） | 1 | REQ-076 |
| FR-074-05 | クライアント側の音声入力ゲート（無音/低音量/秒数） | 2 | REQ-077 |
| FR-074-06 | クライアント側の画像入力ゲート（解像度/ブレ） | 2 | REQ-077 |
| FR-074-07 | 音声・画像の自動圧縮（送信前ダウンサンプリング） | 2 | REQ-077 |
| FR-074-08 | Gemini Context Caching の有効化 | 3 | REQ-078 |
| FR-074-09 | audio_hash / image_hash による判定結果の再利用 | 4 | REQ-079 |
| FR-074-10 | reanalysis 回数制限（rate limit） | 4 | REQ-079 |

---
