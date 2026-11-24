## 現状の問題

（ファイルパス:行番号、または「機能不在の事実」つき）

### 1. ライフサイクルメール（休眠復帰・週次ダイジェスト・研究採用通知）が存在しない

- `supabase/functions/` 配下の Edge Function は `notify-post-status` / `notify-comment` / `notify-survey-request` / `notify-gemini-key-failure` の 4 つだけで（`ls supabase/functions/` で確認）、いずれも **イベント反応型（DB Webhook / pg_net トリガー起動）** である。**ユーザーを呼び戻す定期メール・復帰メール・研究採用メールに該当する関数は無い**。
- 結果、一度投稿して離れたユーザーへ「近所で新しい観察があった」「あなたの観察が研究に採用された」と再エンゲージする手段がメールに無い。

### 2. 定期実行（pg_cron / スケジューラ）の仕組みが無い

- リポジトリ全体で **pg_cron / `cron.schedule` / スケジュール実行の定義は 0 件**（`grep -rn "cron\|schedule\|pg_cron" supabase/` がヒットなし）。
- 既存通知はすべて **イベント駆動**で、トリガーが pg_net 経由で Edge Function を叩く方式（後述）。つまり「14 日活動が無いユーザーを毎日 1 回拾う」「週 1 回ダイジェストを送る」といった **時間駆動（時刻ベース）の起動経路が存在しない**。休眠復帰・週次ダイジェストには新たに定期トリガーの土台が要る。

### 3. 休眠／活動判定の材料はあるが「最終活動日時」を集約した指標が無い

- 活動の生データは存在する：
  - 投稿: `posts.created_at`（`supabase/schema.sql:15`）、`posts.updated_at`（`:28`）。
  - コメント: `comments.created_at`（`supabase/schema.sql:312`）。
  - サインイン: `auth.users.last_sign_in_at`（`admin_user_list` ビューが参照、`supabase/schema.sql:450,477`）。
  - プロフィール更新: `user_profiles.updated_at`（`supabase/schema.sql:1096` ブロック内）。
- しかし **「このユーザーが最後に何らかの活動をしたのはいつか」を一発で引ける列／ビュー（last_active_at 相当）は無い**。休眠判定（例: 直近 14 日に posts も comments も無い）は複数テーブルを跨いだ集約クエリで導出する必要がある。ヘルススコア（`04_デジタルマーケ.md` L180）の「利用状況を合成した健康度」を計算する土台が未整備。

### 4. メール購読設定が「調査依頼」専用で、ライフサイクルメールの opt-in/out 枠が無い

- 現状の購読フラグは調査依頼系の 2 つだけ：
  - `user_profiles.notify_survey_request`（`supabase/migrations/20260425000004_notify_survey_request.sql:6`、`DEFAULT true NOT NULL`）
  - `user_profiles.notify_response_digest`（同 migration `:7`、`DEFAULT true NOT NULL`、コメント上「応答ダイジェスト」だが現状の `notify-survey-request` では未参照）
- UI 側も調査依頼通知の opt-out スイッチ 1 個のみ（`src/views/ProfilePage.tsx:44` `notifySurvey` state、`:55` で `notify_survey_request` を保存）。
- **休眠復帰メール・週次ダイジェスト・研究採用通知に対応する購読フラグも、それを操作する UI も存在しない**。ライフサイクルメールを送るには新しい購読カテゴリと設定画面が要る。

### 5. ワンクリック配信停止（List-Unsubscribe）が無く、配信停止率を測る基盤も無い

- 既存通知メールに **購読解除リンク／ヘッダ（`List-Unsubscribe`）が無い**。`notify-survey-request` の本文は「通知を停止するにはプロフィール設定をご確認ください」と **文章で誘導するのみ**（`supabase/functions/notify-survey-request/index.ts:161`）で、メールから 1 クリックで止める導線が無い。Resend へ渡す送信ボディも `from/to/subject/html` の 4 項目だけ（例 `notify-post-status/index.ts:223-228`）で、`headers`（List-Unsubscribe）を渡していない。
- 配信頻度を増やすライフサイクルメールでは、**配信停止率（unsubscribe rate）・苦情率（spam complaint rate）を監視するガードレール**が必須（`04_デジタルマーケ.md` L266「行動につながる指標を見よ」）。現状その計測・記録の仕組みが無い。

### 6. 「研究採用」を表すデータがマップ表示用の `is_official` しか無い

- 投稿には `posts.is_official`（`supabase/schema.sql:25,52`、管理者のみ更新可＝`protect_official_flag()` トリガー `schema.sql:197-228`）があり、管理操作 `toggle_official` が監査される（`schema.sql:581`）。
- ただし `is_official` は **「公式情報としてマップに出す」ためのフラグ**であって、「研究の集計に採用した／論文・データセットに使った」という **研究貢献イベントを表す専用の意味づけ・タイムスタンプ・通知トリガーは無い**。研究採用通知を送るには「採用した」という事実を表すデータと、それを 1 回だけ通知する仕組みが要る（多重送信防止のため「通知済み」状態も要る）。

### 7. メール本文の i18n 化がされていない（既存通知は日本語ハードコード）

- アプリ本体は ja/en/ko/zh の 4 言語（`src/locales/*/translation.json`）だが、**既存通知メールの件名・本文はすべて日本語ハードコード**（例 `notify-post-status/index.ts:148,151` の `subject = '🦞 あなたの投稿が公開されました'` ほか、`notify-survey-request/index.ts:151-162` 等）。
- 翻訳ファイルにメール本文用の文言は無い（`grep -ni "digest\|dormant\|ダイジェスト\|休眠\|配信" src/locales/ja/translation.json` は確認メール系の UI 文言のみがヒット、メール本文キーは不在）。ライフサイクルメールを **ユーザーの言語で**送るには、宛先ユーザーの locale を引く手段と、メール本文の i18n リソースが要る。(推測) 宛先言語は `auth.users` のメタデータか `user_profiles` に保持されていないため、新たに locale 列を持つか、既定言語（ja）で送るかの方針決定が必要。
