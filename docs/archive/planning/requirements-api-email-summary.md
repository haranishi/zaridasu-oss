> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# 要件定義: API-004 週次メールサマリー

- **ID**: API-004
- **優先度**: 🟡 低〜中（登録ユーザー 50 人超でから実装推奨）
- **使用API**: Resend API（既存）+ Supabase pg_cron
- **作成日**: 2026-03-15

---

## これは何か

先週の出没状況をまとめたメールを毎週月曜朝に配信する構想を 2026-03-15 に検討した当時の要件定義。本ファイルを入口とし、本文は同名ディレクトリ配下の部品に逐語で分割している。

## 目的・背景

トレンドを把握するにはアプリを能動的に開く必要があり、行政担当者のように担当エリアを継続監視したい人ほど見落としが起きる。週次メールで push すれば開かなくても変化が伝わる。ただし押しつけにならないよう、既定OFF・いつでも停止できることを前提に置いた。登録ユーザーが50人を超えてからの実装が推奨。

## 主要な決定事項（要点）

- 通知設定は `user_notification_settings` テーブルに保存し、`weekly_summary_enabled` の既定は **FALSE（オプトイン）**。RLS は `user_id = auth.uid()` で自分の設定のみ。
- 絞り込みは `filter_municipalities TEXT[]` で市区町村単位。ダッシュボードから即時保存する。
- 配信の起動点は Supabase **pg_cron**（`0 0 * * 1` = 毎週月曜 0:00 UTC / 日本時間09:00）→ Edge Function `send-weekly-summary` を `net.http_post` で呼ぶ。認証は `x-cron-secret` ヘッダー（不一致は401）。
- メールは既存の `RESEND_API_KEY` を再利用。ブランドカラーは既存 `notify-comment` テンプレートと同じ `#dc2626` に合わせる。
- **冪等性は `email_send_logs` テーブルで担保**し、同一週に2回実行しても2通目を送らない。
- スパム判定を避けるため購読解除リンクは必須。Verified domain 設定を推奨。
- コストは Resend Free（月3,000件）以内なら無料、超過時は $20/月。

## 部品

- [01-user-stories.md](requirements-api-email-summary/01-user-stories.md) — 登録ユーザー・行政担当者・通知不要なユーザーのユーザーストーリー。
- [02-functional-requirements.md](requirements-api-email-summary/02-functional-requirements.md) — F1 通知設定テーブルのDDL、F2 メール本文の中身、F3 pg_cron 登録SQL、F4 Edge Function、F5 ダッシュボードUI。
- [03-nonfunctional-and-implementation.md](requirements-api-email-summary/03-nonfunctional-and-implementation.md) — 非機能要件（コスト・冪等性・配信率・シークレット管理）と新規/変更ファイル一覧。
- [04-test-perspectives.md](requirements-api-email-summary/04-test-perspectives.md) — テスト観点5点（Secret不一致・購読OFF・地域フィルタ・冪等性・購読解除）。
