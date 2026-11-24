## 3. 緊急時: 段階的 kill switch（被害を止める順序）

> Obsidian `25` §7 / REQ-218 の段階表に対応。**影響が小さく復旧しやすい段階から**引く。下にいくほど強力かつ破壊的。
> 課金事故の**初動チェックリスト全体**（記録 → 保全 → 封じ込め → 切り分け → 連絡 → 復旧）は [incident/03-cloud-billing-anomaly.md](./incident/03-cloud-billing-anomaly.md) を参照。本表はその「封じ込め（段階的停止）」の詳細。

| 段階 | 止める対象 | 操作場所 / 方法 | 主なリスク・備考 | 担当 |
|---|---|---|---|---|
| **1** | **特定利用者 / IP** | REQ-212 のエッジ / DB レート制限・ブロック / Vercel Firewall | 影響最小。bot・単一 IP 集中に有効。正当利用者を巻き込みにくい | 運用者本人 |
| **2** | **高額機能（AI 分析）** | env **`AI_ANALYSIS_ENABLED=false`**（Supabase → Edge Functions → Secrets）→ `analyze-image`/`analyze-audio` は Gemini を呼ばず `skipped: disabled` を返す | **キーを失効させずに AI 課金だけ即停止**。投稿は通常どおり保存され手動レビューへ（フェイルセーフ：自動承認しない）。復旧は env を戻すだけで速い | 運用者本人 |
| **3** | **ジョブ / Webhook** | Supabase Dashboard で `posts` の Database Webhook（`analyze-image`/`analyze-audio`）を無効化、または `WEBHOOK_SECRET` を変更して webhook 起動を遮断 | webhook 起動の AI / 通知ジョブを止める。再分析（フロント invoke）は別経路なので段階 2 が確実 | 運用者本人 |
| **4** | **API 入口** | Vercel で該当ルートを停止 / デプロイ停止（`vercel.json` は `git.deploymentEnabled: false`）/ Firewall | 影響中。投稿フロー等に波及する。アプリ全体を止めうる | 運用者本人 |
| **5** | **API キー** | `GEMINI_API_KEY`（および Resend 等）を**ローテーション / 失効**。手順は新キー適用 → 動作確認 → 旧キー無効化の順 | 当該サービス停止。**漏えい起因ならここを早める**。詳細 → [gemini-key-rotation.md](./gemini-key-rotation.md) / [incident/01-secret-leak.md](./incident/01-secret-leak.md) | 運用者本人 |
| **6** | **プロジェクト / billing** | Google Cloud のクォータを最小化 → **最終手段として** billing（請求アカウント）無効化 | ⚠️ **破壊的・復旧不能の可能性。** billing を切るとプロジェクト/データが失われ得る。**専用プロジェクト + バックアップがある前提でのみ**。まずは段階 2〜5 で止める | 運用者本人 |

> **AI 暴走が主因なら段階 2（`AI_ANALYSIS_ENABLED=false`）が第一手。** キーを消さずに止められるので復旧が速い。フェイルセーフは「自動承認しない・手動レビューへ」（REQ-218 NFR-218-03）。
>
> **やってはいけない**: いきなり段階 6（billing 無効化）。請求明細・利用量・監査ログを**保全する前に**リソースを削除する。原因（漏洩キー / バグ / 攻撃）を塞がずに機能だけ再開する（また暴走する）。

### kill switch を引いたあと

1. 利用量グラフが**頭打ちになる**ことを確認（効いているか）。
2. 原因を**不正 / バグ（リトライ暴走）/ 正当な増加**のいずれかに切り分ける（[incident/03](./incident/03-cloud-billing-anomaly.md) の切り分け表）。
3. 原因を塞いだうえで、停止した機能を**段階を戻して**再開。再開後も**クォータ / Spend 上限 / キー制限を残す**。
4. バグ起因なら `AI_MAX_RETRY` / `AI_REQUEST_TOTAL_TIMEOUT_MS` / 冪等性を見直す。

---
