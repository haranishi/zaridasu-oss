## 1. KPI Register（AC-01）

数値目標は**仮置き**。サンプルが貯まる **3ヶ月運用後に緑黄赤バンドを見直す**こと。
緑黄赤バンドはダッシュボードのカード色と一致（`AdminKpiPage` の `bandHigher`/`bandLower`/`cellBand`）。

### North Star Metric（先行・価値・1つだけ）

| 項目 | 内容 |
|---|---|
| **KPI 名** | 週次アクティブ投稿者数（Weekly Active Contributors） |
| **どの主張に繋がるか** | 参加率・継続率（価値を受け取った参加の「量」） |
| **計算式** | 直近 7 日に `status='approved'` の投稿を **2 回以上**したユニーク `user_id` 数 |
| **データ源** | `posts(status, user_id, created_at)` |
| **種別** | 先行（Leading・行動/予兆） |
| **頻度** | 週次（WoW） |
| **目標バンド（仮）** | WoW ≥ 0% を緑、横ばいを黄、減少を赤 |
| **オーナー** | 研究者本人 |

> NSM は 2 つ持たない。累計 DL・総 PV・総 MAU などの虚栄指標を NSM にしない。

### ガードレール指標（counter-metric ＝ NSM を追って壊れる副作用の歯止め）

| KPI 名 | 計算式 | データ源 | 種別 | 目標バンド（仮） |
|---|---|---|---|---|
| モデレーション却下率 | `rejected ÷ 全status`（直近7日） | `posts.status` | 先行 | ≤10% 緑 / ≤25% 黄 / それ超 赤 |
| 完全率 | 写真添付 AND `accuracy` 非NULL の割合（直近7日） | `posts.photos`, `posts.accuracy` | 先行 | ≥60% 緑 / ≥40% 黄 |
| 正確率（精度内率） | `accuracy ≤ 30m` の割合（直近7日・全投稿分母） | `posts.accuracy` | 先行 | ≥50% 緑 / ≥30% 黄 |
| 1 提出あたり AI コスト | AI トークン（`ai_call_logs`）÷ 承認投稿数 | `ai_call_logs`, `posts` | 先行 | 監視のみ（USD 換算は `/admin/ai-cost`） |

> 精度閾値 30m は REQ-172（SDM の最低要件）。`src/lib/constants.ts` の `GPS_ACCURACY_GOOD_M` と一致。

### KGI（遅行・成果）

| KPI 名 | 計算式 | データ源 | 種別 | 頻度 |
|---|---|---|---|---|
| 累積有効観測レコード数 | `count(*) WHERE status='approved'`（累計） | `posts.status` | 遅行 | 月次 |
| 継続投稿者総数 | `approved` を 2 回以上したユニーク `user_id` 数（累計） | `posts(status, user_id)` | 遅行 | 月次 |

### 量×質ペア（Goodhart 対策・必ず横並び）

| 質（質を表す比率） | 対になる量 | 出力場所 |
|---|---|---|
| 完全率 | 投稿数 | `get_kpi_quality_funnel.completeness`（量=`count` / 質=`rate`） |
| 正確率（≤30m） | 投稿数（全投稿・測位ありの両分母） | `get_kpi_quality_funnel.accuracy` |
| 承認1件あたりトークン | 承認投稿数 | `get_kpi_quality_funnel.cost_per_submission` |

---
