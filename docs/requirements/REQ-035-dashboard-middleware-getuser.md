# REQ-035: /dashboard ミドルウェアを getUser() に統一

## 背景
Supabase SSR 公式ガイドでは、サーバー側でのルート保護には `supabase.auth.getUser()` を使うことが推奨されている。`getSession()` はクッキーに含まれる JWT をそのまま信用するためクッキー改ざんを検出できず、ミドルウェアなどの権限チェックで使うのは危険とされている。本プロジェクトは Next.js 15 App Router + Supabase SSR 構成で、admin ルートは既に `getUser()` で保護しているが、`/dashboard` だけ `getSession()` のまま残っており、整合がとれていない。

## 現状の問題
- `src/lib/supabase/middleware.ts:40-51` admin 分岐は `getUser()` を使用（DB 検証）。

  ```ts
  // FR-004: 管理者ルートはgetUser()でDB検証、それ以外はgetSession()で高速判定
  if (isAdminRoute) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      return NextResponse.redirect(url)
    }
    if (user.app_metadata?.role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  } else {
  ```

- `src/lib/supabase/middleware.ts:53-61` 非 admin 分岐（/dashboard を含む）は `getSession()` のみ。改ざんされたクッキーでも通過する可能性がある。

  ```ts
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user ?? null

    // /dashboard: redirect to home if not authenticated
    if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  ```

## 目的
- `/dashboard` の保護を Supabase SSR 公式推奨の `getUser()` に統一し、クッキー改ざん耐性を確保する。
- admin 分岐と同じ検証レベルに揃え、ミドルウェアの整合性を高める。

## 要件

### 機能要件
- [ ] FR-035-01: `/dashboard` 配下のリクエストでは `await supabase.auth.getUser()` を用い、`data.user === null` のときトップ（`/`）へリダイレクトする。
- [ ] FR-035-02: `/dashboard` 以外のリクエスト（未保護ルート）では、レスポンス生成のための Supabase クッキー更新のみを実施し、認証強制は行わない（従来挙動を維持）。
- [ ] FR-035-03: `getUser()` が throw した場合もミドルウェア全体としては 500 を返さず、既存の `try/catch` で `NextResponse.next({ request })` を返す挙動を維持する。
- [ ] FR-035-04: 既存テスト（存在する場合: `src/lib/supabase/__tests__/middleware.test.ts` など）を更新し、`getSession` を期待するアサーションを `getUser` に置き換える。

### 非機能要件
- [ ] NFR-035-01: ミドルウェアでの `getUser()` 追加呼び出しによる P95 レイテンシ増加を 30ms 以内に抑える。必要に応じてセッションキャッシュ層（例: Next.js `unstable_cache` / Route Handler 側キャッシュ）を検討し、コードコメントで TODO を残す。

## 受入条件
- [ ] AC-01: 正規ログイン済みユーザーが `/dashboard` にアクセスすると、従来通り表示される。
- [ ] AC-02: Supabase のクッキー（`sb-access-token` 等）の payload を別ユーザー ID に改ざんしたクッキーで `/dashboard` へアクセスすると、`getUser()` による検証で弾かれ `/` へリダイレクトされる（別ユーザー扱いにならない）。
- [ ] AC-03: 未認証（クッキーなし）で `/dashboard` にアクセスすると `/` へリダイレクトされる。
- [ ] AC-04: `/admin` の分岐は従来通り動作し、回帰がない。
- [ ] AC-05: `getUser()` 呼び出しが一時的に失敗しても 500 エラーが発生しない。

## 影響範囲
- 変更対象ファイル
  - `src/lib/supabase/middleware.ts`
  - 関連するテスト（あれば `src/lib/supabase/__tests__/*`）

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: 認証系の基本的なセキュリティ整合性。admin と dashboard で保護強度が異なる状態は監査観点で問題があり、早期解消が望ましい。

