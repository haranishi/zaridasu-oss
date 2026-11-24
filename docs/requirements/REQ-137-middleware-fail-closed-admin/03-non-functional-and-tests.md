### 非機能要件

- [ ] **NFR-137-01: パフォーマンス**
  catch 内の追加処理（path 判定・logError・redirect）は 1ms 以下で完了させる。`logError` は Sentry SDK の非同期キューに積むのみで I/O 同期しない設計を踏襲。

- [ ] **NFR-137-02: 可観測性**
  Sentry 上で `middleware:updateSession` タグで grouping できるようにし、「認証失敗」「Supabase 障害」「edge runtime 例外」の発生頻度が dashboard で観測可能になること。

- [ ] **NFR-137-03: セキュリティ**
  本要件は明確に「fail-open → fail-closed」へのポリシー変更であり、admin に対する Defense in Depth として REQ-018（admin auth hardening）/ REQ-035（dashboard middleware getUser）と整合する。RLS 側に新たな依存は追加しない。

### テスト要件

- [ ] **FR-137-06: ユニットテスト（Vitest）**
  `src/lib/supabase/__tests__/middleware.test.ts`（新規 or 既存があれば追記）で以下を検証:
  - **case A**: `createServerClient` が throw する mock 環境で `/admin/posts` リクエスト → `Location: /admin/login?reason=auth_unavailable` の redirect が返る
  - **case B**: 同上で `/dashboard` リクエスト → `Location: /?reason=auth_unavailable` の redirect
  - **case C**: 同上で `/`（公開ページ）リクエスト → `NextResponse.next` 相当（fail-open 維持）
  - **case D**: 上記 3 ケースすべてで `logError` が `'middleware:updateSession'` コンテキストで 1 回ずつ呼ばれる（vi.mock で確認）
  - **case E**: `getUser()` が成功し `user.app_metadata.role !== 'admin'` のとき `/` に redirect（既存挙動の regression を保証）

- [ ] **FR-137-07: E2E (Playwright)**
  `tests/e2e/middleware-fail-closed.spec.ts` を新設:
  - Playwright で Supabase Auth URL を `route.fulfill({ status: 503 })` で fail させる
  - 未ログイン状態で `/admin/posts` を開く → URL が `/admin/login?reason=auth_unavailable` になり、alert が表示される
  - `reason` クエリなしの `/admin/login` 直接アクセスでは alert が出ない

- [ ] **FR-137-08: 既存テストの regression**
  REQ-049（test-middleware-auth）の既存テスト群が引き続き通過すること。特に「未認証で /admin → redirect」「role が user で /admin → / redirect」のケースは挙動不変。
