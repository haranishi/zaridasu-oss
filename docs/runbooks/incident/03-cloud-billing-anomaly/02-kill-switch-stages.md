## 段階的 kill switch（被害を止める順序）

> Obsidian `25` §7 / REQ-218 の段階表に対応。**影響が小さく復旧しやすい段階から**引く。下にいくほど強力かつ破壊的。

| 段階 | 止める対象 | 操作場所 | リスク / 備考 |
|---|---|---|---|
| 1 | **特定利用者 / IP** | レート制限・ブロック（REQ-212）/ Vercel Firewall | 影響最小。bot 起因に有効 |
| 2 | **AI 機能** | env `AI_ANALYSIS_ENABLED=false`（REQ-218 で導入。`_shared/`）→ `analyze-image`/`analyze-audio` は Gemini を呼ばず `skipped: disabled` を返す | **キーを失効させずに AI 課金だけ即停止**。投稿は通常どおり保存され手動レビューへ |
| 3 | **Webhook 入口** | `WEBHOOK_SECRET` を変える / Webhook を無効化 | webhook 起動の AI / 通知ジョブを止める |
| 4 | **API 入口** | 公開エンドポイントの一時停止・Vercel で該当ルートを止める | 影響中。投稿フロー等に波及 |
| 5 | **API キー** | Gemini / Resend 等のキーを失効・制限（→ [01](./01-secret-leak.md) / [`gemini-key-rotation.md`](../gemini-key-rotation.md)）| 当該サービス停止。漏洩起因ならここを早める |
| 6 | **プロジェクト / billing** | リソース停止 / 最終手段として billing | **破壊的**。復旧不能リスク。バックアップ確認後・他手段が尽きた時のみ |

> **AI 暴走が主因なら段階 2（`AI_ANALYSIS_ENABLED=false`）が第一手。** キーを消さずに止められるので復旧が速い。フェイルセーフは「自動承認しない・手動レビューへ」（REQ-218 NFR-218-03）。

---
