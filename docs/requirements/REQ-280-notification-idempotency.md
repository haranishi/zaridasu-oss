# REQ-280: 通知・AI解析の冪等性強化（二重送信・二重課金の窓）

優先度: **P2** ／ 深刻度: **Medium** ／ 種別: バックエンド（正確性・コスト）

## 背景

### 問題A: ライフサイクルメールの冪等性が非アトミック
`supabase/functions/_shared/mailer.ts:120-206`。対象抽出（`get_weekly_digest_recipients`＝直近6日未送信で絞る）→送信→成功後に `recordLifecycleEmail` で記録、という順序で、`lifecycle_email_log` に (user_id, category, 期間) の UNIQUE 制約が無い。pg_cron 二重発火・手動再実行の並走で全員二重送信、記録失敗（catch握り潰し `mailer.ts:203-205`）でも次回再送。

### 問題B: notify-comment の冪等性なし＋Resendエラー生文の返却
`supabase/functions/notify-comment/index.ts:162-176`。ログは `redactAiErrorMessage` するのにレスポンスは生の Resend エラー本文を返す。Resend エラーは宛先（＝投稿オーナーの）メールアドレスを含み得るため、呼び出し元（コメント投稿者）にPIIが漏れる恐れ。comment_id ベースの送信済みマーカーも無く、クライアント再送で通知メールが二重送信され得る。

### 問題C: analyze-image の冪等ガードが webhook ペイロード参照（TOCTOU）
`supabase/functions/analyze-image/index.ts:728`。`record.ai_analyzed_at`（webhookペイロード＝INSERT時は常にnull）を見るため、同一INSERTの重複配信が並行すると両方 Gemini を呼ぶ（hash dedupは先行の書込み完了後にしか効かない）。Gemini二重課金・`auto_approved` 誤上書きの窓。analyze-audio（`index.ts:639`）はDB値参照だが同じTOCTOU構造。

## 機能要件

- **FR-280-01**: `lifecycle_email_log` に (user_id, category, 期間バケット) 相当のUNIQUE制約を追加し、**送信前に** `INSERT ... ON CONFLICT DO NOTHING` でクレーム行を取り、挿入成功時のみ送信する方式へ変更する（真の冪等キー化）。
- **FR-280-02**: notify-comment のエラーレスポンスを一般化（詳細はログのみ）し、comment_id 単位の送信済みマーカーで冪等化する。
- **FR-280-03**: analyze-image/audio の解析開始を DB でアトミックにクレームする（例: `UPDATE posts SET ai_analyzing_at=now() WHERE id=$1 AND ai_analyzed_at IS NULL AND (ai_analyzing_at IS NULL OR ai_analyzing_at < now() - interval '10 min') RETURNING id` で1行取れた時だけ解析）。

## 受入基準

- **AC-01**: 同一ペイロードで各関数を並行2回呼んでも、メール送信/Gemini呼び出しが1回に収まる（テストまたはローカル再現で確認）。
- **AC-02**: notify-comment の失敗応答にメールアドレス等のPIIが含まれない。
- **AC-03**: 既存の通知系テスト・pgTAPがパスする。

## 補足（要検証）

`analyze-image`/`analyze-audio` は「Dashboard設定のDatabase Webhook」（docs）と「`private.trigger_analyze_*` pg_netトリガ（`20260421000001`）」の両方が定義されている。両方が本番で有効だと1投稿で二重起動になるため、**本番でどちらが稼働中かの確認**を推奨（FR-280-03のクレーム化はどちらでも防波堤になる）。
