## 現状の問題

（ファイルパス:行番号、または「不在の事実」つき）

### 1. North Star / ガードレール / KGI の 3 点セットが定義もコードも存在しない

- リポジトリ全体で `north star` / `nsm` / `guardrail` / `counter-metric` / `継続率`（コホート文脈）/ `cohort` / `funnel` の概念は **コード・SQL・要件いずれにも無い**（`grep -rin "cohort|north.?star|nsm|funnel|guardrail|counter.?metric|leading|lagging" src/ supabase/` のヒットは Tailwind の `leading-*` クラスのみ＝偽陽性で、KPI 概念としては 0 件）。
- 既存の数値表示は「総数・種別・月次・市区町村」の**全体カウント**に限られる：`useStats.ts`（`src/hooks/useStats.ts:18-28` の `Stats` 型＝`totalAll`/`totalThisMonth`/`lastMonth`/`speciesCounts`/`monthly`/`municipalityRank` のみ）と `useAdminStats.ts`（`src/hooks/useAdminStats.ts:24-36`）。**「価値の量を表す単一の NSM」「踏み越えてはいけないガードレール」「最終成果の KGI」という階層**は無い。
- 卒論で主張したい「参加率」「継続率」「データ品質」を 1 つの計器盤で追う場所が無く、現状は実験ページ（後述）と全体統計が分断している。

### 2. コホート継続率カーブが無い（全体平均しか出せず、生存者バイアスで嘘になる）

- 集計 RPC `get_dashboard_stats`（`supabase/migrations/20240101000002_dashboard_stats_rpc.sql:5`、schema.sql には未収載でこの migration が正本）は **`count(*)` ベースの月次/今月/先月カウントのみ**で、`count(DISTINCT user_id)` も「初投稿月（獲得コホート）」も「N ヶ月後に再投稿したか」も計算しない。
- リピート率は**実験ページの中だけ**に閉じている：`get_experiment_metrics`（`supabase/schema.sql:1378-1441`）の `rep` CTE が `count(*) FILTER (WHERE c >= 2) / count(*)`（=2 投稿以上したユーザー比）を出すが、これは「**実験群×pre/post 区間内**」の集計であり（`schema.sql:1422-1426`）、**獲得月コホート別の継続カーブ（コホート × 経過月の保持率マトリクス）ではない**。
- KPI ノート/ユニットエコノミクスノートが繰り返し警告する「**全体平均は新規が古い問題を覆い隠す→獲得月コホート別で見る**」が、構造的に実装できていない。卒論の「継続率」主張はコホートで示さないと生存者バイアスを免れない。

### 3. ファネル（参加の各段の歩留まり）を集計・可視化する仕組みが無い

- 「閲覧→投稿開始→投稿完了→（承認）」のような**参加ファネルの段別歩留まり**を出す経路が無い。`useStats`/`useAdminStats`/各 RPC は最終結果のカウントのみで、**離脱箇所**を特定できない。
- GA4 側でも、ファネル探索の素材となる行動イベント設計は REQ-232 が主管で**本 REQ 時点では未確定**（`src/lib/lpAnalytics.ts:6` の LP イベント `lp_view`/`lp_cta_signup` 等は LP 限定で、アプリ本体の投稿開始/完了イベントは未整備）。本 REQ は「どのファネルを GA4 探索と Supabase のどちらで見るか」の定義が必要。

### 4. 量×質のカウンター指標（Goodhart 対策）がペアになっていない

- 品質シグナルは投稿側に揃っている：`posts.ai_result`（`src/types/post.ts:92`）/ `status`（`'pending'|'approved'|'rejected'`、`supabase/schema.sql:524-525`）/ `accuracy`（GPS 精度 m、`src/types/post.ts:102`）/ `survey_method`（`'structured'|'opportunistic'`、`src/types/post.ts:103-104`）/ `auto_approved`（`src/types/post.ts:108`）。AI 判定コストも `ai_call_logs` 系（`get_ai_cost_summary` RPC が `src/views/admin/AdminAiCostPage.tsx:44` で入力/出力トークンを集計）で持つ。
- しかし**「量（投稿数）」と「質（完全率/正確率）」を必ずペアで並べる KPI 設計が無い**。実験ページは 4 指標を個別カードで出すが（`AdminExperimentsPage.tsx:22-27`＝投稿数/GPS率/写真添付率/リピート率）、これは**実験参加者のみ**が対象で、全体 KPI として「投稿が増えたとき品質が落ちていないか」を監視する常設ガードレールにはなっていない。
- ノートが定義するカウンター指標「**1 提出あたりコスト（AI コスト ÷ 承認投稿数）**」「**完全率/正確率**」は、データ源（`ai_call_logs` と `posts.status`/`accuracy`）は揃うのに**結合した指標として算出する場所が無い**。

### 5. KPI を 1 画面で見るダッシュボードが無い（情報が分断）

- 管理ナビ（`src/views/admin/AdminLayout.tsx:121-130`）は「📊ダッシュボード / 📋投稿 / 🚨通報 / 👥ユーザー / 💬コメント / 🗒️ログ / 💰AIコスト / 🧪実験計測」の 8 項目。**全体集計（/admin）・AI コスト（/admin/ai-cost）・実験 DID（/admin/experiments）が別画面に散在**し、卒研で毎週見るべき「NSM＋ガードレール＋コホート＋ファネル」を**1 枚で俯瞰する画面が無い**。
- 公開トレンド（`src/views/TrendsPage.tsx`＝種別/情報種別/月次/市区町村）は市民向けの集計であり、研究 KPI（継続・参加・品質）の運用画面ではない。
- KPI ノートの「ダッシュボードは見るだけでは 1 円も生まない＝週次レビューの型」が回せる UI（前週比・緑黄赤バンド・コホート表）が無い。

### 6. GA4 探索の前提（データ保持 14ヶ月）と PII 計測防止・外部送信規律が未確認

- GA4 は GTM 経由で注入される（`src/app/layout.tsx:65-77,138-144` の `NEXT_PUBLIC_GTM_ID` スニペット）。`.env.example:4` には `NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX` の記載があるが、layout には**直接の gtag/測定 ID 配線は無く**、GA4 への送出は GTM タグ設定（リポジトリ管理外）に依存する。
- GA4 プロパティの**データ保持が 14ヶ月に変更されているかはコードから追跡できない**（IaC 化不可のダッシュボード設定）。初期値 2ヶ月のままだと**探索（ファネル/コホート/経路）の遡及ができず**、卒論の通年データ分析が成立しない。ノートが「最優先・設定漏れ事故が多い」と明記する箇所。
- **PII を GA4 に送らない**運用（フォームのメール/氏名・URL クエリのリダクション）と、**改正電気通信事業法の外部送信規律（通知・公表）**への対応状況が本 REQ 文脈で点検されていない。既存プライバシーページ（`src/views/PrivacyPage.tsx` が存在）に外部送信の説明が十分かは要確認。

> 注: 本 REQ は卒研 PF として「一人運用で週次に回せる」現実性を優先する。大規模な BI 構築（BigQuery/Looker の本格運用）は範囲外とし、**Supabase 集計 RPC ＋ 管理画面の 1 ダッシュボード ＋ GA4 探索の正しい前提**で成立させる。
