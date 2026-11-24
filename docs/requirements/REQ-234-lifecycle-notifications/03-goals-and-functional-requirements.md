## 目的

- ザリダスに **リテンション目的のライフサイクルメール**（(A) 研究採用通知、(B) 休眠復帰、(C) 週次ダイジェスト）を導入し、一度きりで離脱しがちな市民科学参加者を **能動的に呼び戻し継続観察に繋げる**。
- **研究採用通知**で「あなたの観察が研究／集計に採用された」という **研究貢献の実感** を返し、卒研 PF ならではの最強の継続動機を刺激する。
- ライフサイクルメールに **粒度のある購読管理（カテゴリ別 opt-in/out ＋ ワンクリック配信停止）** を備え、ユーザーがチャネルとカテゴリをコントロールできるようにする。
- **配信停止率・苦情率をガードレール**として監視し、頻度・内容を「行動につながる指標」で律する（虚栄の送信数で評価しない）。
- 既存取引通知（`notify-*`）の振る舞い・到達性（REQ-219）・PII（REQ-211）とは **重複せず**、ライフサイクル層だけを足す。

## 要件

### 機能要件

- [ ] FR-234-01: **メール共通ユーティリティを切り出し、List-Unsubscribe と購読ゲートを一元化する。** `supabase/functions/_shared/` に Resend 送信ラッパ（既存 `_shared/aiCache.ts` 等と同列の共有モジュール、(推測) 例 `mailer.ts`）を新設し、(a) 送信ボディに **`headers: { 'List-Unsubscribe': '<https://zaridasu.com/u/unsubscribe?t=...>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }`** を付与、(b) 送信前に **宛先ユーザーの購読フラグを確認して opt-out なら送らない**、(c) `RESEND_API_KEY` 未設定時の **fail-soft（送信スキップして 200）** を共通化する（既存 `notify-post-status/index.ts:76-83`・`notify-survey-request/index.ts:130` の挙動を踏襲）。From は REQ-219 の方針に揃え、環境変数 `NOTIFY_FROM_EMAIL`（既定 `ザリダス <noreply@zarigani-das.com>`、`notify-survey-request/index.ts:71` と同じ）から取得する。本 FR は **新規ライフサイクル関数が使う共通土台**であり、既存取引通知の改修は必須としない（任意で寄せてよいが本 REQ のスコープ外）。

- [ ] FR-234-02: **ライフサイクル用の購読カテゴリ列を追加する。** 新規 migration（連番 `2026MMDD0000NN_*.sql`、直近は `supabase/migrations/20260603000006_seed_experiments.sql`）で `user_profiles` に opt-in フラグを追加する。既存 `notify_survey_request` / `notify_response_digest`（`20260425000004_notify_survey_request.sql:6-7`）と同じ `boolean NOT NULL DEFAULT true` の様式に揃える：
  - `notify_research_adopted`（研究採用通知）
  - `notify_dormant_reengage`（休眠復帰）
  - `notify_weekly_digest`（週次ダイジェスト）
  あわせて **ワンクリック配信停止トークン**の保持方法を決める（署名付きトークンを都度生成する案を推奨。`auth.users.id` をそのまま URL に載せない＝PII/列挙耐性。REQ-211 と整合）。`schema.sql` 側にも同じカラム定義を反映してドリフトを作らない。

- [ ] FR-234-03: **購読管理 UI（カテゴリ別 opt-in/out）と配信停止ページを用意する。** `src/views/ProfilePage.tsx` のプロフィール編集（現状 `notify_survey_request` トグル 1 個、`:44-55`）に、FR-234-02 の 3 カテゴリのトグルを追加し、`onSave`（`ProfilePage.tsx:33`）の更新型・保存処理を拡張する。さらに **メールの List-Unsubscribe / 本文リンクから来る配信停止用の公開ルート**（(推測) 例 `/u/unsubscribe`、ログイン不要・署名トークン検証）を新設し、ワンクリックで該当カテゴリ（または全ライフサイクルメール）を opt-out できるようにする。トグル文言・配信停止ページは ja/en/ko/zh の 4 言語に対応（`src/locales/*/translation.json` にキー追加）。

- [ ] FR-234-04: **研究採用イベントのデータと通知トリガーを定義する。** 「投稿が研究／集計に採用された」事実を表すデータを設計する。`is_official`（`schema.sql:25`、マップ公開用）とは **意味を分け**、(a) 専用の真偽列＋採用日時（(推測) 例 `posts.research_adopted_at timestamptz`）か、(b) 採用バッチを表す別テーブル（投稿 × データセット/集計の関連）か、のいずれかを選ぶ。採用フラグの更新は **管理者/サービスロールのみ**に限定（`is_official` の `protect_official_flag()` `schema.sql:197-228` と同様の保護）し、`audit_logs` に採用操作を記録する（`schema.sql:581` の action 群に倣う）。採用がセットされた投稿の **投稿者本人へ 1 回だけ**「研究採用通知」を送る（多重送信防止のため「通知済み」状態を保持）。匿名投稿（`posts.user_id IS NULL`）は対象外（既存 `notify-post-status/index.ts:123` と同じ扱い）。

- [ ] FR-234-05: **研究採用通知 Edge Function を実装する。** 新規関数（(推測) `notify-research-adopted`）を作り、既存 `notify-post-status` と同じ防御パターンを踏襲する：(a) webhook 共有秘密検証（`_shared/webhookAuth.ts` の `requireWebhookSecret`、grace period 含む）、(b) **payload は id のみ信用し、`posts` を service-role で再 fetch**（`notify-post-status/index.ts:90-112` と同様にフィッシング文面混入を防ぐ）、(c) `escapeHtml`（同 `:37-38`）で本文をエスケープ、(d) FR-234-01 の共通 mailer 経由で `notify_research_adopted` の opt-in を確認して送る。本文は「**あなたの観察が研究の集計に採用されました。研究貢献ありがとうございます**」を主軸に、1 メッセージ 1 ゴール（`CTA設計.md` L34）でマイページ/該当投稿への CTA を 1 つ置く。**位置情報の生値（lat/lng）や個人を特定し得る情報はメール本文に載せない**（PII 配慮、REQ-211 と整合。市区町村粒度までに留める）。

- [ ] FR-234-06: **休眠復帰メール（14 日無活動）のバッチを実装する。** 「直近 14 日に投稿（`posts.created_at`）もコメント（`comments.created_at`）も無く、`auth.users.last_sign_in_at` も 14 日以上前」のユーザーを抽出する集約クエリ（または FR-234-07 の last_active ビュー利用）を定義し、`notify_dormant_reengage` が opt-in のユーザーへ復帰メールを送る。同一ユーザーへの **再送間隔の下限（例: 30 日に 1 回まで）** と「送信済み記録」を持ち、しつこい再送を防ぐ（`04_デジタルマーケ.md` L181 の「先回り介入」だが、L70「ベイト/強制は逆効果」を踏まえ穏当な頻度に）。本文は「お久しぶりです。あなたの地域で新しい観察が増えています」など **価値提示型**（近所の新着件数など、市区町村粒度の集計のみ。個別投稿の位置は出さない）。配信は FR-234-08 の定期トリガーから起動する。

- [ ] FR-234-07: **週次ダイジェストメール（近所の新着・人気の生きもの）を実装する。** `notify_weekly_digest` が opt-in のユーザーへ、**そのユーザーの市区町村（`user_profiles` 由来）における直近 1 週間の新着投稿件数・種別内訳・人気の観察（市区町村粒度の集計）** をまとめて週 1 回送る。集計は既存の市区町村別集計 RPC（`get_municipality_post_counts`、`schema.sql:885` 付近）など Postgres 側の集約を再利用し、**全件転送やメール本文への座標掲載はしない**（NFR-234-03/REQ-211）。あわせて、複数テーブルの最終活動を集約した **「最終活動日時」ビュー／関数（last_active_at 相当）** を新設し、FR-234-06 の休眠判定とヘルススコア（`04_デジタルマーケ.md` L180）算出の共通土台にする。

- [ ] FR-234-08: **定期実行（pg_cron）の土台を新設する。** 現状ゼロの定期実行（現状の問題 2）を解消するため、新規 migration で **pg_cron による日次/週次ジョブ**を定義し、休眠復帰（日次で判定）と週次ダイジェスト（週 1）を起動する。起動方式は既存の pg_net パターン（`20260425000004_notify_survey_request.sql:16-48` の `call_notify_survey_request` が `vault.decrypted_secrets` からキーを取り `net.http_post` で Edge Function を叩く）を踏襲し、**Edge Function を呼ぶ薄いラッパ関数**経由にする。pg_cron が使えない/未有効の環境では no-op として安全に失敗する（同 migration の `EXCEPTION WHEN OTHERS THEN NULL` 方針）。(推測) pg_cron / pg_net の有効化はダッシュボード操作のため、runbook 化して「設定済みか」を記録する。

- [ ] FR-234-09: **メール本文の i18n と宛先言語の決定。** ライフサイクルメール（FR-234-05〜07）の件名・本文を 4 言語（ja/en/ko/zh）対応にする。宛先ユーザーの言語の解決方法を決める：(a) `user_profiles` に `locale` 列を追加してプロフィールで選ばせる、または (b) 当面は既定言語（ja）で送り、英語等は後続に回す——のいずれかを選び、選択と理由を記録する。メール文面は SNS ノートの健全 CTA 原則（`CTA設計.md` L67-70「価値を渡した上で自然な次の一歩」「ベイト/強制は減点」）に沿い、1 メッセージ 1 ゴール（L34）で書く。

- [ ] FR-234-10: **配信停止率・苦情率ガードレールの計測と運用。** ライフサイクルメールの **送信数・配信停止数（List-Unsubscribe 経由＋設定 opt-out）・(可能なら) Resend の bounce/complaint** を記録し、**カテゴリ別の配信停止率を監視**する。閾値（(推測) 例: 配信停止率がしきい値超過、または苦情率が一定超過）を超えたら **当該カテゴリの送信頻度を下げる/一時停止する** 運用ルールを定める。これは `04_デジタルマーケ.md` L266「虚栄の指標でなく行動につながる指標を見よ」の実装であり、成功指標は「送信数」ではなく **復帰率（休眠→再活動）・継続率（リテンションカーブの平坦化、L252）** に置く。計測結果の可視化は REQ-233（卒研 KPI ダッシュボード）と連携してよい（重複させず指標を渡す）。
