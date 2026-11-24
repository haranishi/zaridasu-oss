## 背景
`src/lib/supabase/middleware.ts:4-68` の `updateSession` は Next.js middleware から毎リクエスト呼ばれ、`/admin/*` と `/dashboard` の認可判定を担う唯一のチョークポイント。REQ-035 で `/dashboard` も `getSession` から `getUser` に変更され、クッキー改ざんに対する耐性が強化された。一方で既存テスト群にこの関数を検証するユニット／結合テストが存在せず、将来の getUser → getSession 逆行や try/catch 範囲縮小によって発生する認可バイパスを検知できない。

## 守りたい不変条件
- **INV-01**: 未認証（`getUser` が `user: null` を返す）で `/admin/posts` にアクセス → ステータス 307、`Location=/admin/login`（`middleware.ts:42-46`）
- **INV-02**: 認証済みだが `app_metadata.role !== 'admin'` で `/admin/posts` → 307、`Location=/`（`middleware.ts:47-51`）
- **INV-03**: `app_metadata.role === 'admin'` の user で `/admin/posts` → `NextResponse.next()` が返却され、リダイレクトしない
- **INV-04**: `/admin/login` は認証チェック対象外（`middleware.ts:35-37` の `!pathname.startsWith('/admin/login')` 分岐）。未認証でも `next()` が返る
- **INV-05**: 未認証で `/dashboard` → 307、`Location=/`（`middleware.ts:52-60`、REQ-035 の変更ポイント）
- **INV-06**: `createServerClient` または `getUser` が例外を throw しても、`middleware.ts:63-67` の `catch` により 500 ではなく `NextResponse.next()` が返る

## 現状の検出可否
- `Grep -r "updateSession"` → 呼び出し元は `src/middleware.ts` のみで、テスト 0 件
- `src/lib/supabase/__tests__/` ディレクトリ自体が存在しない（`Grep middleware --glob="*.test.*"` 0 件）
- `src/lib/__tests__/` には `constants.test.js` / `postValidation.test.ts` のみ存在し、HTTP リクエスト／レスポンス層の統合テストは未整備
- E2E（Playwright）も未導入のため、ブラウザ越しにリダイレクト挙動を確認する手段がない

## テスト種別と環境
- **種別**: integration（モックされた Supabase client と実 Next.js `NextRequest`/`NextResponse`）
- **フレームワーク**: Vitest（既存、`vitest.config.ts` の `environment: 'jsdom'` を当該ファイルのみ `// @vitest-environment node` でオーバーライド）
- **セットアップ**:
  - `vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }))` で Supabase client をモック
  - `beforeEach` で `createServerClient` の戻り値を `{ auth: { getUser: vi.fn(), getSession: vi.fn() } }` に差し替え、各 TC でレスポンスを再設定
  - 環境変数 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` をダミー値で `vi.stubEnv`
  - `NextRequest` は `new NextRequest(new URL('http://localhost/admin/posts'))` で生成
- **配置先**: `src/lib/supabase/__tests__/middleware.test.ts`
