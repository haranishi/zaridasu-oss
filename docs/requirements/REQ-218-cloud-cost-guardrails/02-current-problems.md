## 現状の問題
（ファイルパス:行番号 または 設定不在の事実）

### 1. 予算アラート / 使用量監視 / Spend Management の設定形跡がリポジトリに無い
- リポジトリ全体に予算・Spend Management・kill switch・billing 関連の設定 / ドキュメントが**存在しない**（`grep -rni "budget\|spend management\|billing\|kill.?switch\|予算\|課金\|暴走"` の該当は REQ-075 の AI コスト「集計」と REQ-212 / REQ-200 の言及のみで、**ガードレール本体の定義は無い**）。
- `vercel.json`（全 6 行、`vercel.json:1-6`）は `framework` と `git.deploymentEnabled: false` のみで、**Spend Management / firewall / 上限の設定が無い**。Vercel Functions 実行・帯域・画像最適化に対するコスト通知 / 上限の形跡がコードに無い（Vercel ダッシュボード側設定の有無は (推測) リポジトリからは確認不能）。
- 既存のコスト関連資産は **`scripts/calc-ai-cost.ts`（`package.json:22` の `cost:ai`）と `/admin/ai-cost`（`src/app/admin/ai-cost/page.tsx`）による Gemini コストの「事後集計 / 可視化」のみ**。これは概算単価での月次レポート（`scripts/calc-ai-cost.ts:20-25` の `PRICE_PER_1K`）であり、**予算超過の通知・閾値・自動 / 手動の停止トリガーには連動していない**。「使った後に集計する」状態で、「使う前 / 最中に止める」ガードレールが無い。
- すなわち 25 / 18 番ノートの「**予算 → Cost Anomaly Detection → クォータ → アプリ側制限**を別々に重ねる」のうち、**ザリダス側に明文化された運用が無い**。

### 2. リトライに backoff / jitter / 対象エラー以外の限定が不十分で、課金増幅器になり得る
- `analyze-image` / `analyze-audio` の retry ラッパー（`analyze-image/index.ts:513-555`・`analyze-audio/index.ts:324-362`）は **MAX_TOKENS のみ**を対象に最大 3 回（初回 + 2 retry、`maxOutputTokens` を `base*2`/`base*4` に拡大）試行する。**SAFETY / RECITATION / blockReason / その他は即 throw**で、ここは 25 番ノートの判断表に沿っている（良い点）。
- 一方で **backoff / jitter / sleep が一切無い**（`grep -rni "backoff\|jitter\|sleep\|setTimeout\|delay\|Math.random" supabase/functions` の該当 0 件）。MAX_TOKENS retry は即座に連続実行され、しかも各 retry は `maxOutputTokens` を倍にするため**1 回あたりのトークン課金がむしろ増える**方向。MAX_TOKENS が多発する画像（大きい / 複雑）では `base*1 + base*2 + base*4 = base*7` 相当の出力課金が 1 枚で発生し得る。
- 全体タイムアウトは個別 `fetch` の `AbortSignal.timeout(30_000)`（Gemini 呼び出し、`analyze-image/index.ts:436`・`analyze-audio/index.ts:243`）と画像 / 音声取得の 8〜15 秒（`:378,383` / `:125`）に限られ、**「retry を含む 1 リクエスト全体の上限経過時間」は明示されていない**。
- 画像は最大 3 枚を `Promise.allSettled` で**並列**判定する（`analyze-image/index.ts:756-760`、`photos.slice(0, 3)` で `:703` 上限）。fan-out は 3 に固定されており暴走はしないが、**「成功するまで再試行」型の経路や指数バックオフは無い**。
- **冪等キー / DLQ が無い**（`grep -rni "idempoten"` 0 件、DLQ 相当も無し）。Webhook の重複配信に対しては `record.ai_analyzed_at`（`analyze-image/index.ts:618`）/ `existingAudio?.analyzed_at`（`analyze-audio/index.ts:533`）で**二重解析をスキップ**する簡易ガードがあり（良い点・REQ-050 INV-03）、これが事実上の冪等性の役割を一部果たす。ただし「明示的な冪等キー」「失敗を退避する DLQ / 手動確認キュー」は無く、25 番ノートの暴走防止リスト（冪等キー・DLQ・同一入力の再投入回数）の一部が未充足。

### 3. AI 機能を即時停止できる kill switch（機能フラグ）が無い
- 25 / 18 番ノートが求める**段階的 kill switch**（利用者 / 機能 / ジョブ / API 入口 / キー / プロジェクト / billing）のうち、ザリダスにあるのは **(a) 鍵未設定時の skip**（`GEMINI_API_KEY` 未設定 → `skipped: no_api_key`、`analyze-image/index.ts:626-632`・`analyze-audio/index.ts:501-508`）と **(b) `AI_REANALYSIS_DAILY_LIMIT`（既定 3・post_id 単位）による再分析の絞り込み**（`_shared/aiRateLimit.ts:6,15-47`、取得失敗時 fail-closed は良い点）**のみ**。
- **「AI 分析全体を即座に止める機能フラグ」が無い**（`GEMINI_DISABLE` / `AI_ANALYSIS_ENABLED` 等の env は存在しない。`grep` 該当 0 件）。コスト暴走時に AI 機能だけを止める手段は、現状「Supabase Dashboard で `GEMINI_API_KEY` を空にする / Webhook を無効化する / キーを失効する」という**手作業のみ**で、手順も明文化されていない。
- `WEBHOOK_SECRET`（`_shared/webhookAuth.ts:31-42`）は webhook 経由 INSERT を縛れるが、未設定時は grace period で素通り（`:33-36`）。これは入口認証であってコスト kill switch ではない。

### 4. 開発 / 本番プロジェクトの分離が不明（同一 Supabase / Gemini を共有している可能性）
- CI は `SUPABASE_PROJECT_REF`（`.github/workflows/ci.yml:118`）を**単一の secret**として参照しており、リポジトリ上に**開発用 / 本番用の Supabase プロジェクト ref を分けている形跡が無い**。Edge secrets（`GEMINI_API_KEY` 等）も `.env.example:21-27` で 1 系統のみ案内。
- Gemini のレート制限 / 課金は 25 番ノートのとおり**プロジェクト単位**で評価されるため、開発 / 本番で同一 Google Cloud プロジェクト・同一 API キーを共有していると、**開発時のテスト暴走が本番課金 / 本番レート制限へ波及**し、課金原因の切り分けもできない。実際に分離されているかはリポジトリからは (推測) 確認不能だが、**分離を明示する設定 / ドキュメントが無い**ことは事実。
- `.env.example` には本番 / 開発を分けるための変数命名（例 `*_PROD` / `*_DEV`）が無く、`vercel.json` にも環境別スコープの記述が無い（Vercel の Production / Preview / Development スコープはダッシュボード側 (推測)）。

### 5. 課金異常の「検知」と「初動 runbook」がコスト観点で未整備
- 鍵失効検知 `notify-gemini-key-failure`（`.env.example:42-49` の `GEMINI_AUTH_FAILURE_THRESHOLD` 等）は**「認証失敗」**を拾うが、**「コスト / 利用量の急増」そのものを検知する経路が無い**（呼び出し回数 / トークン量の異常閾値アラートが無い）。`ai_call_logs` にトークン / レイテンシは記録されるが（`analyze-image/index.ts:979-1010`）、それを定期評価して通知する仕組みはコスト観点では未配線。
- 「課金が増えたとき何を見て、どの順で止めるか」という**コスト事故の初動手順がドキュメント化されていない**（25 番ノートの「0〜15 分 / 15〜60 分 / 24 時間以内」に相当する記述がリポジトリに無い）。
