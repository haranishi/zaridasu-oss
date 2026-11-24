# REQ-235: 品質連動ゲーミフィケーション（検証済み投稿・種同定精度を称える設計）

## 背景
ザリダスは市民科学プラットフォームであり、卒業研究としては「投稿の量」だけでなく「データ品質」が成果の核になる。Obsidian のセキュリティ外メモ（`会社経営/実践・テンプレ/KPIダッシュボード設計.md` の Goodhart の法則・量×質のペア計測、`会社経営/04_デジタルマーケ・グロース・営業.md` の CBBE 共鳴段＝ロイヤルティ/コミュニティ）が示すとおり、「量だけ」「いいねだけ」を称える設計は水増し・低品質投稿を招く。一方ザリダスには既にバッジ／ランキング基盤があり、ここに「検証された貢献（質）」を称える軸を足すことで、継続動機とデータ品質を同時に押し上げられる。本 REQ は既存のゲーミフィケーションを「品質連動」に拡張する。

## 現状の問題
（ファイルパス:行番号つき）

### 1. 既存バッジが「量（投稿数）」中心で、品質シグナルをほとんど称えていない
- バッジ定義 `supabase/schema.sql:1161-1171` は9種。うち投稿数ベースが4種（`first_post`:1162 / `posts_10`:1163 / `posts_50`:1164 / `posts_100`:1165）で `category='posting'`。
- 付与ロジック `check_and_grant_badges()`（`supabase/schema.sql:716-745`、トリガー `on_post_approved_check_badges`:747-750）も大半が `COUNT(*)`：投稿数（:724-728）・種数（:730-731 `multi_species`）・市町村数（:733-734 `multi_municipality`）・不在確認数（:736-737 `absence_reporter`）。
- 「質」を見るのは `ai_perfect`（:739-741、`auto_approved = true AND (ai_result->>'confidence')::numeric >= 0.95`）の**実質1種のみ**。

### 2. データ品質シグナルが揃っているのに、称号設計に未活用
- `src/types/post.ts` には品質シグナルが既に存在：`accuracy`（GPS水平精度、REQ-172、:102）・`survey_method`（`structured`=定点反復 / `opportunistic`、REQ-174、:104）・`auto_approved`（:108）・`ai_result.confidence`（:69）・`status`（承認、:92）。
- これらを使った「高精度な位置情報での観察」「定点観察の継続」「高い承認率（却下の少なさ）」を称えるバッジ／称号が**無い**（`schema.sql` のバッジ定義に該当エントリなし）。REQ-173（空間バイアス nudge）・REQ-174（構造化調査プロトコル）でデータ品質を“取りに行く”仕組みは入ったが、それを“称える”側が量指標のまま。

### 3. ランキングに「品質」軸が無い
- `src/views/RankingPage.tsx:55` は `view: 'diversity' | 'leaderboard'` の2軸。REQ-171 で既定を「発見の多様性」（`useDiversity`、:57-58、:98）にし投稿数リーダーボードはオプトインへ後退させた（良い設計）。しかし「検証済み投稿数」「種同定精度」「定点観察の継続」といった**品質ランキング／称号は無い**。
- いいね（`src/hooks/useLike.ts`）は評価指標に組み込まれていないが、将来「いいね数ランキング」に流れると Goodhart 的な見栄え競争（量・人気偏重）を招くリスクがあり、先に「質を称える」軸を確立しておくべき。

## 目的
既存のバッジ／ランキング基盤を活かしつつ、「検証された投稿（承認済み・AI高精度・GPS精度・定点観察）」を称える品質連動の称号を追加し、量・人気偏重を是正する（Goodhart 対策＝量×質をペアで称える）。これにより市民科学の継続動機（CBBE 共鳴＝検証された貢献への誇り）と卒研のデータ品質の双方を高める。

## 要件

### 機能要件
- [ ] FR-235-01: `badge_definitions`（`schema.sql:1148-1171`）に「品質（`category='quality'`）」バッジを追加する。最低限：(a) **検証済み投稿**（`status='approved'` の投稿が一定数。`posts_*` の“投稿数”ではなく“承認済み数”を明示的に称える）、(b) **高精度同定**（`auto_approved=true` かつ `ai_result.confidence >= 0.9` の投稿がN件）、(c) **定点観察者**（`survey_method='structured'` の投稿がN件、REQ-174 連動）、(d) **高精度位置**（`accuracy` が一定値以下＝GPS良好な投稿がN件、REQ-172 連動）。アイコン・`sort_order`・`name`/`description` は既存命名規則（:1161-1171）に合わせる。
- [ ] FR-235-02: `check_and_grant_badges()`（`schema.sql:716-745`）に FR-235-01 の付与条件を追加する。既存の `ai_perfect`（:739-741）と同様、`NEW`/集計クエリで判定し `INSERT ... ON CONFLICT DO NOTHING`。`status<>'approved'` 早期 return（:720）の現行ガードを維持する。
- [ ] FR-235-03: `RankingPage.tsx`（:55 の `view`）に品質軸のタブ／指標を追加する。例：「検証済み投稿数」または「種同定の正確性（承認率・AI一致率）」のランキング。REQ-171 の既定「発見の多様性」を主軸に据えたまま、品質軸を**多様性と並ぶ“質”の見せ方**として加える（投稿数リーダーボードはオプトインのまま）。対応する集計は Supabase RPC（`get_dashboard_stats` 等の隣に）で行い、クライアントに生 PII を渡さない。
- [ ] FR-235-04: プロフィール／ランキングで称える主指標を「いいね数・総投稿数」ではなく「**承認済み（検証済み）投稿数・品質バッジ**」とする方針を明文化し、いいね数を称号の主軸にしない（量×質のペア表示。例：投稿数の隣に必ず承認率や定点観察率を併記）。
- [ ] FR-235-05: 追加バッジ・ランキング指標の文言を i18n 4言語（`src/locales/{ja,en,ko,zh}/translation.json`）に追加する（`i18n:check` を通す）。

### 非機能要件
- [ ] NFR-235-01: バッジ付与は既存設計どおり DB トリガー（`SECURITY DEFINER` + `SET search_path = public`、`schema.sql:716`）で行い、クライアントからの改竄を許さない。`badge_definitions`/`user_badges` の RLS（:1158-1159 ほか）と整合させる。
- [ ] NFR-235-02: 既存の `posts_*`/`multi_*`/`ai_perfect` バッジは後方互換で維持し、付与済みバッジが消えないこと（追加のみ）。
- [ ] NFR-235-03: ランキング集計 RPC は件数上限・インデックスを考慮し、`/ranking` の表示性能（REQ-191/124 のバジェット）を悪化させないこと。

## 受入条件
- [ ] AC-01: 承認済み投稿数・`survey_method='structured'`・`accuracy` 良好・`ai_result.confidence` 高のいずれかの条件を満たすユーザーに、新しい品質バッジがトリガーで付与される（pgTAP もしくは手順で確認）。
- [ ] AC-02: `RankingPage` に品質軸の指標／タブが追加され、既定の「発見の多様性」（REQ-171）が引き続き主軸である。
- [ ] AC-03: プロフィール／ランキングで「いいね数」が称号の主軸になっておらず、量指標には必ず質指標（承認率・定点率等）が併記される。
- [ ] AC-04: 追加文言が4言語に存在し `i18n:check` が通る。
- [ ] AC-05: 既存バッジ（`posts_10` 等）の付与・表示に回帰がない。

## 影響範囲
- `supabase/schema.sql`（`badge_definitions` への追加、`check_and_grant_badges()` の条件追加、品質ランキング RPC）／対応する `supabase/migrations/`
- `src/views/RankingPage.tsx`（品質軸タブ）、`src/hooks/useProfile.ts`・`useRanking`/`useDiversity`（指標取得）
- `src/locales/*/translation.json`（4言語）
- 関連REQ: REQ-171（多様性ランキング）・REQ-172（GPS精度）・REQ-173（空間バイアス nudge）・REQ-174（定点プロトコル）が“品質を取る”側、本REQは“品質を称える”側。演出（楽観的UI・バッジ解放アニメ）は REQ-226 に委ねる。

## 優先度
- **緊急度**: Low / **重要度**: Medium
- **理由**: 機能不全ではないが、市民科学の継続動機とデータ品質（卒研の成果指標）を直接押し上げる。既存のバッジ／ランキング基盤・品質シグナル（accuracy/survey_method/ai_result）が揃っているため追加コストが小さく、量・いいね偏重に流れる前に「質を称える」軸を確立する価値が高い。
