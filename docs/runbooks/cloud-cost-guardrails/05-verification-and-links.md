## 4. 検証（設定が機能しているか）

- [ ] Google Cloud に予算アラート（実績 50/80/100% + 予測 100%）があり、通知先が日常確認するメールである
- [ ] 「予算はハード上限ではない」ことを本人が理解している（自動停止しない）
- [ ] Vercel Spend Management が有効で、Functions/帯域/画像最適化の急増を確認できる
- [ ] Supabase 使用量（DB/Storage/Egress/Invocations）の週次確認がルーチン化されている
- [ ] `npm run cost:ai` / `/admin/ai-cost` が週次レビューの入力になっている
- [ ] `AI_ANALYSIS_ENABLED=false` で AI 分析が `skipped: disabled` になり、投稿は保存され手動レビューへ回る（キー失効なしで停止できる）ことを確認した
- [ ] `AI_ANALYSIS_ENABLED` 未設定 / `true` で従来どおり分析が走る（後方互換）
- [ ] 段階的 kill switch（利用者 → AI 機能 → Webhook → API 入口 → キー → billing）の各段階の操作場所・リスクを把握している
- [ ] billing 無効化の破壊性（復旧不能・専用プロジェクト + バックアップ前提）を理解している
- [ ] 開発/本番の分離（§1-4）を確認・記録した

---

## 関連

- 課金事故の初動（発火後）: [incident/03-cloud-billing-anomaly.md](./incident/03-cloud-billing-anomaly.md)
- 秘密漏洩: [incident/01-secret-leak.md](./incident/01-secret-leak.md)　|　乗っ取り: [incident/02-account-takeover.md](./incident/02-account-takeover.md)
- Gemini キー ローテーション: [gemini-key-rotation.md](./gemini-key-rotation.md)（REQ-126）
- 要件定義: [REQ-218](../requirements/REQ-218-cloud-cost-guardrails.md)
- 対象コード:
  - `supabase/functions/_shared/aiKillSwitch.ts`（kill switch フラグ）
  - `supabase/functions/_shared/aiRetryConfig.ts`（バックオフ + 全体タイムアウト + 回数上限）
  - `supabase/functions/analyze-image/index.ts` / `analyze-audio/index.ts`
  - `scripts/calc-ai-cost.ts` / `src/app/admin/ai-cost/page.tsx`（週次レビューの入力）
