### テスト要件

- [ ] **FR-126-12: 分類ロジックのユニットテスト**
  `supabase/functions/_shared/__tests__/sharedModules.test.ts` に追加:
  - `classifyAiError(new GeminiApiError(400, ...))` → `'gemini_auth'`
  - `classifyAiError(new GeminiApiError(401, ...))` → `'gemini_auth'`
  - `classifyAiError(new GeminiApiError(403, ...))` → `'gemini_auth'`
  - `classifyAiError(new GeminiApiError(500, ...))` → `'gemini_transient'`
  - `classifyAiError(new GeminiApiError(429, ...))` → `'gemini_transient'`
  - `classifyAiError(new GeminiApiError(404, ...))` → `'gemini_api'`
  - 文字列引数の後方互換ケースも維持

- [ ] **FR-126-13: health-gemini のユニットテスト**
  `supabase/functions/health-gemini/__tests__/handler.test.ts`:
  - 非 admin の JWT → 403
  - admin かつ Gemini が 200 を返す → `{ ok: true, latency_ms: number }`
  - admin かつ Gemini が 400 → `{ ok: false, error_kind: 'gemini_auth', status: 400 }`
  - `ai_call_logs` に **insert されないこと**を verify（mock の insert スパイが呼ばれない）

- [ ] **FR-126-14: notify-gemini-key-failure のユニットテスト**
  - 直近 1 時間に `gemini_auth` が 3 件未満 → 通知しない
  - 3 件以上だが過去 24 時間以内に通知済み → 通知しない
  - 3 件以上かつ未通知 → Resend に POST、`admin_alerts` に insert
  - `ADMIN_NOTIFY_EMAIL` 未設定 → fail-soft（warn ログのみ）

- [ ] **FR-126-15: UI のユニットテスト（Vitest + RTL）**
  `src/components/features/admin/__tests__/ReviewCardAI.test.tsx` に追加:
  - `error_kind: 'gemini_auth'` で「🔑 API キー設定エラー」が赤色で表示
  - 同条件で「再判定する」ボタンが disabled かつツールチップ表示
  - `error_kind: 'gemini_transient'` では既存通り「再判定する」ボタンが有効

- [ ] **FR-126-16: AdminLayout バナーの E2E**
  `tests/e2e/admin-gemini-banner.spec.ts` を新設:
  - mock の Supabase クライアントが直近 1 時間に `gemini_auth` 1 件返す状態で `/admin/posts` を開く
  - バナーが表示される
  - クローズボタンで非表示になり、ページリロード後も同セッション中は表示されない
