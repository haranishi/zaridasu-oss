## 受入条件

- [ ] **AC-131-01**: **Given** `WEBHOOK_SECRET` を設定済み、**When** 攻撃者が `Authorization: Bearer <ANON_KEY>` のみで `notify-post-status` を叩く、**Then** 401 が返り Resend が呼ばれない（function logs に `webhook secret mismatch` が記録される）
- [ ] **AC-131-02**: **Given** 正規の DB Webhook 経由（`x-webhook-secret` 付き）、**When** `posts.status` を `pending → approved` へ更新、**Then** 投稿者にメールが 1 通だけ届く（冪等性ログにより重複なし）
- [ ] **AC-131-03**: **Given** 攻撃者が `record.rejection_message` に偽 URL を埋め込んだ JSON を webhook secret 付きで投げる、**When** Edge Function が受信、**Then** DB から `id` で再 fetch するため攻撃者文言は無視され、DB の本物の `rejection_message` のみがメール本文に入る
- [ ] **AC-131-04**: **Given** 攻撃者が `analyze-image` に巨大画像 URL を webhook 経路として投げる、**When** secret 無し、**Then** 401 で即座に拒否され Gemini API は呼ばれない
- [ ] **AC-131-05**: **Given** `analyze-image` の reanalysis 経路、**When** 既存通り JWT + 投稿者本人/admin チェック、**Then** webhook secret 無しでも動作（reanalysis は JWT 認証で十分とする方針）
- [ ] **AC-131-06**: **Given** `notify-survey-request` を `Authorization: Bearer <ANON_KEY>` で叩く、**When** secret 無し、**Then** 401 で拒否され Resend 通知が大量送信されない
- [ ] **AC-131-07**: **Given** `WEBHOOK_SECRET` を回転（rotate）、**When** Edge Function 側の secret は更新済だが Database Webhook 設定が旧値のまま、**Then** CI の `scripts/check-webhook-secret-sync.ts` が fail し PR をブロック
- [ ] **AC-131-08**: **Given** Edge Function 側だけ deploy して Database Webhook 設定を未更新、**When** 本番運用、**Then** `admin_alerts` に「webhook secret mismatch」が集約されオペレータが気付ける
