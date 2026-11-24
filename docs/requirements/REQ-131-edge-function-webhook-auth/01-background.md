## 背景

ザリダスの 4 つの Edge Function (`notify-post-status` / `analyze-image` / `analyze-audio` / `notify-survey-request`) は、いずれも「Supabase Database Webhook または pg_net トリガーから呼ばれる」という設計だが、**実装側では呼出元の真正性を検証していない**。

- `supabase/config.toml` には `[functions.*]` セクションが存在せず、`verify_jwt` の明示指定が無い
- webhook 共有秘密 (`x-webhook-secret` 等) のヘッダ検証は 1 箇所も存在しない (`grep -r WEBHOOK_SECRET supabase/functions/ → 0 件`)
- Edge Function はデフォルトで Anon Key 一致時に公開呼出を許可しており、Anon Key はクライアントに配布済 (= 実質公開)
- 呼出側は `payload.record` を信用して `SERVICE_ROLE_KEY` で DB / Auth Admin API / Resend / Gemini を叩いており、攻撃者が任意の JSON を投げると本物そっくりのメール送信・外部 API コスト消費・投稿ステータス偽装が成立する

これは REQ-129 (image dedup / audio bleed) や REQ-128 (secret refresh) と同じ「Edge Function サーフェスの信頼境界」問題系の最深部であり、**実害シナリオ（フィッシング・コスト爆発・誤承認）が複数同時に成立する Critical 級の穴**。
