## 1. 検知ロジック（何を異常とみなすか）

`detect_ai_anomalies(p_window_minutes, p_min_samples, p_auto_approve_rate_threshold, p_per_actor_call_threshold, p_total_call_threshold)` が返す `signals` 配列（空＝異常なし）:

| signal | 条件 | 既定閾値 | 何を意味するか |
|---|---|---|---|
| `high_auto_approve_rate` | 窓内に AI 分析された投稿のうち `auto_approved=true` かつ `reviewed_by IS NULL`（人手なし）の割合 ≥ 閾値。**ただし分母が `min_samples` 未満の窓は評価しない**（率は `null`） | `0.90`（標本 `20` 以上） | 自動承認が多すぎる＝閾値を下げ過ぎ / 誘導 / 誤承認の疑い |
| `user_call_spike` | 単一 `posts.user_id` の AI 呼び出し回数の最大 ≥ 閾値 | `50` 回 | 1 ユーザーが大量に AI を回している（自動承認狙い / bot） |
| `ip_call_spike` | 単一 `reporter_ip`（**ハッシュ化済み列**）の AI 分析投稿数の最大 ≥ 閾値 | `50` 件 | 匿名（未ログイン）からの集中 |
| `high_call_volume` | 窓内 AI 呼び出し総数 ≥ 閾値（**コスト観点**） | `500` 回／窓 | 全体のコスト/流量の暴走 |

- 集計対象は `function_name IN ('analyze-image','analyze-audio')` の `ai_call_logs`（status 不問＝呼び出し頻度がコスト/濫用の指標）と、`ai_analyzed_at` が窓内の `posts`。
- **PII 最小**（REQ-211）: 関数は件数・率・`user_id`（集計キー）・ハッシュ IP の件数のみ返す。**平文メール / 座標 / IP は返さない**。通知本文も `redactAiErrorMessage` を通す二重防御。

### 閾値はどこで決まるか（優先順位）

1. `notify-ai-anomaly` が **env から閾値を読み**、RPC 引数として渡す（運用で調整するのはここ）。
2. env 未設定時は EF 内の既定（上表）を使う。
3. RPC 自身にも同じ安全側の既定がある（直接 SQL で叩く運用検証時のフォールバック）。

| env | 既定 | 意味 |
|---|---|---|
| `AI_ANOMALY_WINDOW_MINUTES` | 60 | 集計窓（分） |
| `AI_ANOMALY_MIN_SAMPLES` | 20 | auto-approve 率を評価する最小標本数（少数で誤検知しない） |
| `AI_ANOMALY_AUTO_APPROVE_RATE` | 0.90 | auto-approve 率の異常閾値（0..1） |
| `AI_ANOMALY_PER_ACTOR_CALLS` | 50 | 単一ユーザー/IP の呼び出し回数 異常閾値 |
| `AI_ANOMALY_NOTIFY_INTERVAL_HOURS` | 6 | 同種通知の最小間隔（通知洪水防止） |
| `AI_COST_ALERT_CALLS_PER_HOUR` | 500 | **窓内 AI 呼び出し総数**の異常閾値（REQ-218 と共有・二重定義しない） |

> `AI_ANOMALY_AUTO_APPROVE_RATE`（=「自動承認が多すぎる」検知）は、コード側の `AUTO_APPROVE_FLOOR=0.5`（=1 件ごとの自動承認に必要な最低信頼度。`_shared/aiSchema.ts`）とは**別レイヤ**。前者は「群としての率」、後者は「個別判定の下限」。

---
