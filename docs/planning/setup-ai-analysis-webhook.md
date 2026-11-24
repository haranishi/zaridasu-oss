# AI 判定 Edge Function を DB Webhook 起動に移行する設定手順

> [!warning] この手順は現在の方針と衝突する（2026-08-11 追記）
> 本書はフェーズ 1 で **Supabase ダッシュボードの Database Webhooks** に `analyze-image-on-insert` を登録させるが、
> この機能を使うことは後に**禁止**された（`supabase/migrations/README.md` の運用ルール・REQ-287 FR-287-07）。
> ダッシュボードで作ったトリガーはリポジトリ管理外になり、生成される定義に service_role JWT がリテラルで埋め込まれる。
> 実際に 2026-07-28、この経路で作られた `analyze-image-on-insert` が Edge Function の二重起動と
> service_role キー露出を招き、`20260728000001_drop_legacy_analyze_image_webhook.sql` で削除された。
> DB トリガーは migration で定義する（`20260421000001_ai_analysis_webhooks.sql` の `analyze_image_on_insert` 経路が正）。
> 以下は当時の計画の記録として残す。

## これは何か

AI 判定 Edge Function（`analyze-image` / `analyze-audio`）の起動を、クライアントからの `functions.invoke()` から DB Webhook 起動へ移すための作業手順書。人手のダッシュボード操作を含む。

## 目的・背景（要約）

クライアント invoke はネットワーク断・タブ閉じ・JS エラーで届かないと AI 判定が永久に走らず、認証境界も要件書（REQ-072）の想定とズレる。管理画面からの UPDATE 時の再判定といった拡張もできない。そこで DB 側の変更を契機に起動する形へ移す。

## 主要な決定事項（要点）

- **移行は 3 フェーズに分ける**（Webhook 登録 → 動作確認 → クライアント invoke 削除）。段階的に切り替えるので、途中で問題が出ても戻せる。
- **移行期間中に二重発火しても問題ない**。両 Edge Function に冪等性ガード（既に解析済みならスキップ）があるため。動作確認中は `already_analyzed` が出るのが正常。
- **画像は Insert のみ、音声は Insert と Update の両方**を対象にする。既存投稿に後から音声を追加するケースをカバーするため。
- **再分析（REQ-050 の「再判定」ボタン）の invoke は削除しない**。`reanalysis: true` 付きの呼び出しは Webhook では代替できない。
- **ロールバックは Webhook の Disable で足りる**（クライアント invoke を残している間は従来挙動に戻る）。
- **Edge Function はどちらのペイロード形式でも動く**（`payload.record ?? payload`）。

## 内訳

- [目的](setup-ai-analysis-webhook/01-purpose.md): 現状の起動経路と 3 つの問題、冪等性ガードの前提
- [移行フェーズ](setup-ai-analysis-webhook/02-migration-phases.md): Webhook 2 件の設定値、動作確認の手順、削除対象のクライアント invoke
- [ロールバックとよくある問題](setup-ai-analysis-webhook/03-rollback-and-troubleshooting.md): 戻し方と、ログに出ない / `already_analyzed` ばかり出る場合の見方
- [関連ファイル](setup-ai-analysis-webhook/04-related-files.md): 実装本体・削除対象・関連要件書の在り処
