## 影響範囲

### 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `supabase/functions/_shared/aiLogging.ts` | `AiErrorKind` 拡張、`classifyAiError` overload、`GeminiApiError` クラス追加 |
| `supabase/functions/analyze-image/index.ts` | `throw new GeminiApiError(status, body)` に変更 |
| `supabase/functions/analyze-audio/index.ts` | 同上 |
| `supabase/functions/health-gemini/index.ts` | 新規 |
| `supabase/functions/health-gemini/__tests__/handler.test.ts` | 新規 |
| `supabase/functions/notify-gemini-key-failure/index.ts` | 新規 |
| `supabase/functions/notify-gemini-key-failure/__tests__/handler.test.ts` | 新規 |
| `supabase/migrations/20260513000001_admin_alerts.sql` | 新規 |
| `src/types/post.ts` | `AIErrorKind` に `gemini_auth` / `gemini_transient` 追加 |
| `src/components/features/admin/ReviewCardAI.tsx` | gemini_auth の文言・色・disable ロジック |
| `src/components/features/admin/__tests__/ReviewCardAI.test.tsx` | テスト追加 |
| `src/views/admin/AdminLayout.tsx` | バナー追加 |
| `src/views/admin/AdminDashboard.tsx` | ヘルスチェックボタン |
| `tests/e2e/admin-gemini-banner.spec.ts` | 新規 |
| `docs/runbooks/gemini-key-rotation.md` | 新規 |
| `.env.example` | `ADMIN_NOTIFY_EMAIL`, `GEMINI_AUTH_FAILURE_THRESHOLD`, `GEMINI_AUTH_NOTIFY_INTERVAL_HOURS` 追加 |

### 他機能への影響

- **REQ-125**: `error_kind` を細分化するが、既存の `gemini_api` 値は後方互換で残す。`ReviewCardAI` の switch 文に case 追加のみで他は影響なし
- **REQ-099 (Sentry)**: Edge Function 内の `console.error` は Sentry に拾われるので、`GeminiApiError` も自動的に Sentry に記録される。明示的な変更なし
- **REQ-079 (reanalysis rate limit)**: `gemini_auth` で disabled になった再判定ボタンは API も叩かないので、rate limit には影響なし
- **既存の `ai_call_logs` 集計 (REQ-075)**: `error_kind` の値が増えるだけで、コスト集計ロジックは変更不要
- **本番デプロイ**: 新規 Edge Function (`health-gemini`, `notify-gemini-key-failure`) は Supabase CLI でデプロイが必要。pg_cron スケジュールも別途設定する

## 優先度

- **緊急度**: High（実際に運用ブロッカーが発生済み。投稿はゼロ件にはならないが、AI auto_approve が止まると管理者の手動審査負荷が増える）
- **重要度**: High（運用継続性・MTTR に直結）
- **理由**: 2026-05-12 に実際に発生した障害の再発防止と MTTR 短縮が目的。手動承認で迂回可能なので Critical ではないが、放置すると AI コストメリットが消える上、管理者の負荷で品質が下がる。Phase 分け推奨:
  - **Phase 1 (P0 相当)**: FR-126-01〜03 + FR-126-04〜05 + FR-126-11（分類細分化、UI 出し分け、runbook）— migration なし、新規 Function なしで完結
  - **Phase 2 (P1)**: FR-126-06 + FR-126-07〜08（バナー、ヘルスチェック Function & UI）
  - **Phase 3 (P2)**: FR-126-09〜10 + admin_alerts migration（プッシュ通知）
