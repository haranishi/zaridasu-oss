## 0. 重要な前提（読み飛ばし厳禁）

- **到達性（SPF / DKIM / DMARC）は本 REQ では扱わない。REQ-219 が主管。**
  本 REQ が用意するのは List-Unsubscribe の付与（ヘッダ + 着地点 `/u/unsubscribe`）まで。
  送信ドメイン `zarigani-das.com` の DNS 認証（SPF/DKIM/DMARC）が未設定だと、頻度を上げた途端に
  迷惑メール判定・到達率低下が起き、**既存の取引通知（承認・コメント・調査依頼）まで巻き添え**になる。
  ライフサイクルメールを本番で有効化する前に、必ず REQ-219 の到達性設定が完了していることを確認する。

- **配信頻度の誤設計はドメインレピュテーションを毀損する。**
  だから本 REQ は「送信数」を成功指標にしない。List-Unsubscribe（ワンクリック停止）と
  ガードレール（配信停止率の監視）を**必ずセットで**運用する。下記 §5 のしきい値を超えたら止める。

- **秘密値はコミットしない。** `RESEND_API_KEY` / `WEBHOOK_SECRET` / service-role key の実値は
  Supabase Dashboard → Edge Functions → Secrets と Vault にのみ置く。`NEXT_PUBLIC_` は厳禁。

---

## 1. 構成（何がどう動くか）

| メール | カテゴリ | 起動経路 | 頻度 |
|---|---|---|---|
| 研究採用通知 | `research_adopted` | `adopt_post_research()` → `call_notify_research_adopted()` → pg_net → `notify-research-adopted` | 投稿あたり 1 回（採用時） |
| 休眠復帰 | `dormant_reengage` | pg_cron 日次 → `run_dormant_reengage_batch()` → pg_net → `notify-dormant-reengage` | 1 日 1 回判定・同一ユーザ 30 日に 1 回まで |
| 週次ダイジェスト | `weekly_digest` | pg_cron 週次 → `run_weekly_digest_batch()` → pg_net → `notify-weekly-digest` | 週 1 回 |

- 共通送信は `supabase/functions/_shared/mailer.ts`（List-Unsubscribe 付与・購読ゲート・fail-soft）。
- 購読カテゴリ列は `user_profiles.notify_research_adopted / notify_dormant_reengage / notify_weekly_digest`
  （いずれも `boolean NOT NULL DEFAULT true`）。配信停止トークンは `user_profiles.unsubscribe_token`
  （不透明な UUID。`auth.users.id` を直載せしない）。
- ガードレール計測は `lifecycle_email_log`（送信/配信停止/bounce/complaint をカテゴリ別に記録）。
- 既存の取引通知 4 関数（`notify-post-status` / `notify-comment` / `notify-survey-request` /
  `notify-gemini-key-failure`）は**本 REQ で不変**。ライフサイクル層だけを足している。

### 宛先言語（FR-234-09 の決定）

当面は**既定言語（ja）で送る**。理由: `user_profiles` に locale 列が無く、本 REQ では追加を見送ったため。
`mailer.ts` の `FOOTER_TEXT` は ja/en/ko/zh の 4 言語を用意済みなので、将来 `user_profiles.locale` を
足せば `sendLifecycleEmail({ lang })` に渡すだけで多言語配信に拡張できる（後続 REQ）。

---
