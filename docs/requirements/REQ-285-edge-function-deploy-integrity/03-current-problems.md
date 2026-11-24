## 2. 現状の問題（実測値・ファイルパス:行番号つき）

### A. 🔴 根本原因: CI の deploy-lag ガードが「7 関数の固定リスト」で、しかも差分がある関数しか見ない

`scripts/check-edge-deploy-lag.sh:38-46` の `DEFAULT_TARGETS` は次の 7 本をハードコードしている。

```bash
DEFAULT_TARGETS=(
  analyze-image analyze-audio notify-comment notify-post-status
  notify-survey-request health-gemini notify-gemini-key-failure
)
```

**この 7 本は、本番にデプロイ済みの 7 本と完全に一致する。** つまり後から追加された 7 本（`enrich-place` 以降）は監視対象へ一度も追加されなかった。

さらに同スクリプトには 2 段目のフィルタがある。`detect_changed_functions()`（`:98-116`）が `git diff` から「今回の PR / push で変更された関数」だけを抽出し、`:133-136` で `CHANGED` に無い関数を除外、`:147-150` で `TARGETS` に無い関数を除外する。加えて `:134` で `CHANGED` が空なら **skip して exit 0** する。

結果として、**「一度もデプロイされておらず、かつ最近編集されていない関数」は構造的に永久に検知されない**。ガードは存在するが、この故障モードには原理的に反応しない。

`.github/workflows/ci.yml:188-193` がこのスクリプトを呼ぶ唯一の箇所である。

### B. 🔴 `enrich-place` 未デプロイ — 地理メタデータが 1 件も付与されていない

`posts` の `enrich_place_on_insert` トリガー（本番に存在・`private.trigger_enrich_place()` を実行）が全 INSERT で `enrich-place` を呼ぶ。定義は `supabase/migrations/20260717000001_webhook_secret_headers.sql:242-290`。

本番実測（2026-07-29）:

| 指標 | 値 |
|---|---:|
| `posts` 総数 | 18 |
| うち `status='approved'` | 12 |
| `geo_enriched_at IS NOT NULL` | **0** |
| `locality IS NOT NULL` | **0** |

地名・水域名・標高の付与は**一度も動作したことがない**。`src/types/post.ts:128` が「値の産出元は Edge Function enrich-place」と明記している列が、全件 NULL のまま運用されている。卒業研究の分析対象データとして地理属性が欠損している状態であり、影響はデータ品質に及ぶ。

### C. 🔴 cron 3 本がすべて未デプロイ関数を叩いている

本番 `cron.job`（実測・全て `active=true`）:

| jobid | jobname | schedule | 実行内容 | 呼ぶ関数 | 状態 |
|---:|---|---|---|---|---|
| 1 | `lifecycle_dormant_reengage_daily` | `0 9 * * *` | `run_dormant_reengage_batch()` | `notify-dormant-reengage` | **未デプロイ** |
| 2 | `lifecycle_weekly_digest` | `0 0 * * 1` | `run_weekly_digest_batch()` | `notify-weekly-digest` | **未デプロイ** |
| 3 | `ai_anomaly_check_15min` | `*/15 * * * *` | `run_ai_anomaly_check()` | `notify-ai-anomaly` | **未デプロイ** |

実害:

- `lifecycle_email_log` は **0 件** — ライフサイクルメールは一通も送信されていない
- AI 異常検知（`ai_call_logs` の閾値超過アラート）は誰にも届かない。コスト暴走・Gemini キー失効を検知できない

### D. 🔴 失敗が構造的に不可視

`net._http_response` の実測（2026-07-29 00:05 時点）:

| status_code | 件数 | 最古 | 最新 |
|---:|---:|---|---|
| 404 | **24** | 2026-07-28 18:15 | 2026-07-29 00:00 |

**200 は 1 件も無い。** 同テーブルは約 6 時間で切り詰められるため、15 分 cron の 404 で常に埋まり続ける。

不可視になっている理由は3つ重なっている。

1. **pg_net は非同期** — `net.http_post()` はリクエストをキューに積んだ時点で返る。cron の `job_run_details` は直近 7 日 680 回すべて `succeeded` になる
2. **fail-soft 設計** — `call_lifecycle_edge_function`（`supabase/migrations/20260615000006_lifecycle_notifications.sql:539-`）等のラッパは Vault / pg_net 未設定や失敗を意図的に no-op にしている（REQ-234 NFR-234-01）。これは正しい設計だが、**恒久的な故障も同じ静けさで飲み込む**
3. **`net._http_response` を監視している経路が無い** — 404 を集計・通知する仕組みが存在しない

### E. 影響が現時点では無い未デプロイ関数（記録）

- `send-push`: `push_subscriptions` が **0 件**。Web Push は未稼働のため実害なし（配布物で「通知が届く」と書かない方針と整合）
- `notify-research-adopted`: `call_lifecycle_edge_function` 経由（`20260615000006:578`）。研究採用フラグの更新時のみ発火し、該当実績が無いため未発火
- `social-announce`: DB からの起動経路が無く、`LATE_API_KEY` 等の env も未設定。dry-run 既定（REQ-236）

---
