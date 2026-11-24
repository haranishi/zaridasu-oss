## リスク・トレードオフ

| リスク | 緩和策 |
|---|---|
| `fix-webm-duration` が一部 Chrome 出力で `Info` セクションを見つけられない既知 issue (#19) | try-catch で吸収、failed なら元 blob を使う |
| Firefox は seek workaround が効かない | クライアントで patch 済みの新規録音は影響なし。古い録音は元々 Firefox で 0:00 表示だったので回帰なし |
| iOS Safari の preload 制約 | 録音時に patch 済みなので、duration が container にあれば iOS でも表示される |
| ライブラリの maintenance リスク | yusitnikov 製、2017 から維持、stars 250+, 安定 |
| 大容量ファイルで処理時間 | 1MB 制限の本アプリでは無視できる |

---

## 実装優先度と計画

| 優先度 | 項目 | 依存 | 見積もり | ステータス |
|---|---|---|---|---|
| **P0** | `fix-webm-duration` 依存追加 + 録音時 patch | なし | XS | TODO |
| P0 | AudioPlayer の onError 厳密化 | なし | XS | TODO |
| P1 | seek workaround を MAX_SAFE_INTEGER + durationchange に置換 | なし | S | TODO |
| P2 | uploadAudio.ts でも patch をかけて多重防御 | なし | XS | TODO |
| P3 | 単体テスト追加（patch 成功 / 失敗ケース） | 上記 | S | TODO |

---
