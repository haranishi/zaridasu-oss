## 影響範囲

### 変更（コード）

- `supabase/functions/_shared/mailer.ts:37-38, :164, :178-181` — コメント更新、タイムアウト、redact
- `supabase/functions/_shared/labels.ts`（新規）
- `supabase/functions/_shared/observability.ts`（新規）
- `supabase/functions/_shared/fetchWithTimeout.ts`（新規）
- `supabase/functions/_shared/webhookAuth.ts:75-87` — `captureMessage` の追加（follow-up の解消）
- `supabase/functions/_shared/webpush.ts:211` — タイムアウト
- `supabase/functions/_shared/__tests__/` — `escapeHtml` / ラベルの不変条件テスト（自動導出方式）
- `notify-post-status/index.ts:38, :43, :220, :235-237`
- `notify-comment/index.ts:18`
- `notify-survey-request/index.ts:30, :41, :78`
- `notify-ai-anomaly/index.ts:63`
- `notify-gemini-key-failure/index.ts:49`
- `notify-research-adopted/index.ts:36`
- `notify-weekly-digest/index.ts:33, :37, :91`
- `notify-dormant-reengage/index.ts:63`
- `social-announce/index.ts:45, :49, :167`
- `analyze-image/index.ts:231, :1249-1250`
- `supabase/functions/deno.lock`
- `.github/workflows/backup.yml:86-87`
- `.github/workflows/`（新規: Deno 依存の月次更新、`cost:ai` の週次実行、`eval:ai` の手動 dispatch）
- `docs/runbooks/` — `eval:ai` の運用台帳、監視アラートの一覧

### 他要件への影響

- **REQ-287**: 本要件は REQ-287 が確立した「`_shared` 集約 ＋ 自動導出の不変条件テスト」パターンを `escapeHtml` とラベル定義へ適用するものであり、同じ整理の続きである
- **REQ-280**: FR-309-04 のバッチ並列化・デッドラインは、REQ-280 の冪等性対応と**セットで設計する必要がある**。冪等性が未達のまま並列化すると重複送信のリスクが変わる（減るとは限らない）
- **REQ-211**: FR-309-05/06/07 は REQ-211 の適用漏れの解消である
- **REQ-288**: 本要件の FR-309-08 は REQ-288（npm側の依存更新）が扱わなかった Deno エコシステムを担当する
- **REQ-279**: FR-309-10（`cost:ai` の定期実行）は、REQ-279 で未整備の `ai_call_logs` 保持ポリシーと合わせて初めて「課金膨張の検知」として機能する
