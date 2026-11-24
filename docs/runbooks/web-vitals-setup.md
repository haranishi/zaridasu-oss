# Web Vitals 計測の運用手順（GA4）

REQ-097 で導入した本番フィールド計測を GA4 で集計する手順。

## 仕組み
- `src/components/common/WebVitalsReporter.tsx` が `web-vitals` v4+ のフックを購読し、`window.dataLayer.push({ event: 'web_vital', ... })` を実行
- GTM が `web_vital` イベントを GA4 にカスタムイベントとして転送
- `process.env.NODE_ENV === 'production'` のときのみ送信（dev / preview ビルドでは飛ばない）

## GTM 側の設定（リポジトリ管理外、1 回だけやる）

### 1. データレイヤー変数を作成
| 変数名 | データレイヤー変数名 |
|---|---|
| `dlv_metric_name` | `metric_name` |
| `dlv_metric_value` | `metric_value` |
| `dlv_metric_id` | `metric_id` |
| `dlv_metric_rating` | `metric_rating` |
| `dlv_metric_navigation_type` | `metric_navigation_type` |

### 2. トリガーを作成
- 種類: カスタムイベント
- イベント名: `web_vital`

### 3. GA4 イベントタグを作成
- タグ種類: GA4 イベント
- イベント名: `web_vital`
- パラメータ:
  - `metric_name` → `{{dlv_metric_name}}`
  - `metric_value` → `{{dlv_metric_value}}`
  - `metric_id` → `{{dlv_metric_id}}`
  - `metric_rating` → `{{dlv_metric_rating}}`
  - `metric_navigation_type` → `{{dlv_metric_navigation_type}}`
- トリガー: 上記 web_vital トリガー

### 4. GA4 側でカスタムディメンション登録
GA4 管理画面 → カスタム定義 → カスタムディメンションを作成：
- `metric_name`（イベントスコープ）
- `metric_rating`（イベントスコープ）

## 探索レポート（GA4）

### LCP の P75 を可視化する
1. 「探索」→「自由形式」を新規作成
2. ディメンション: `metric_name`、`metric_rating`、`page_path`
3. 指標: `metric_value` の平均 / 中央値 / P75
4. フィルタ: `metric_name = LCP`

### リグレッション検知
- 週次で `metric_value` の P75（モバイルセグメント）を確認
- LCP > 2500ms / INP > 200ms / CLS > 0.1 の "poor" 比率が 25% を超えたら原因調査

## 動作確認

### ローカル
ローカルでは送信されない（`NODE_ENV !== 'production'` のため）。コードの動作を確認したい場合は一時的にガードを外して `npm run build && npm run start` する。

### 本番
1. 本番にデプロイ
2. Chrome DevTools → Network タブ → `collect?` 系の GA4 リクエストを確認
3. または GA4 → 設定 → DebugView で実時間にイベントが届くか確認

## 関連
- REQ-097（本書を生んだ要件）
- REQ-092（軽量化包括要件）
- 計測対象 KPI: LCP ≤ 2.5s / INP ≤ 200ms / CLS ≤ 0.1（モバイル P75）
