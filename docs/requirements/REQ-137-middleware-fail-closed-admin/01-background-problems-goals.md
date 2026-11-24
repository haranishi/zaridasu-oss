## 背景

`src/lib/supabase/middleware.ts` の `updateSession()` は、Supabase クライアント生成・cookie 読み書き・`supabase.auth.getUser()` の一連の処理を `try { ... } catch { return NextResponse.next({ request }) }` で囲っており、**いかなる例外が発生してもリクエストをそのまま通過させる "fail-open"** 設計になっている。

このフォールバックは元々 REQ-016 / FR-003 系で「Supabase 障害時に 500 を出さないため」のフェイルセーフとして導入されたものだが、現在の実装では `/admin/*` を含む**認証必須ルートも同じ catch に巻き込まれてしまっている**。具体的には:

- Supabase Auth API の 5xx・タイムアウト・ネットワーク断
- `createServerClient` 内での cookie parse 例外
- Edge runtime の OOM / V8 内部例外
- Supabase JWT 検証失敗による thrown error（一部のバージョンで未捕捉）

これらが起きると、middleware 側の認可ガード（`if (!user) return redirect('/admin/login')`、`if (user.app_metadata?.role !== 'admin') return redirect('/')`）が**スキップ**され、未認証/非 admin のリクエストが `/admin/*` のルートにそのまま到達する。

admin layout / page 側は `useAuth()` (クライアント) や Server Component の二重チェックで救われる構造ではあるものの:

- Server Component が認証チェックなしに初期レンダリングを開始する窓が存在する
- admin 用 fetch / RSC データ取得が走り、`posts` / `audit_logs` などへ RLS のみが最終防御になる
- catch されたエラーは `logError()` 等で Sentry にも送られず、運用上「障害が起きていることに気付けない」

実例として、Supabase ダッシュボード経由の incident（rare な 503 burst）や、ローカル開発時に Supabase が停止していたケースで、`/admin/posts` を直接 URL 入力したときに admin layout のローディング表示まで到達してしまう挙動が再現可能。

## 現状の問題

- `src/lib/supabase/middleware.ts:63-67` — `catch { return NextResponse.next({ request }) }` で**全例外を握りつぶし**、認証必須ルートも素通りさせる
- `src/lib/supabase/middleware.ts:35-60` — `isAdminRoute` / `/dashboard` の判定は `try` 内部にあるため、例外が起きた瞬間に redirect ロジック自体が実行されない
- 例外が発生しても `logError(err, 'middleware:getUser')` 等の Sentry / errorReporter への通知が無い → 障害発生に気付くまでが長い
- `/admin/*` Server Component (`src/app/(admin)/admin/.../page.tsx` 群) は middleware に依存しており、独立した `getUser()` 再検証を行っているものと行っていないものが混在（defense in depth が不十分）
- 同様のリスクが `/dashboard` にも存在するが、RLS で個人データのスコープが限定されるため admin より影響度は低い

## 目的

1. `/admin/*` の認証ガードを **fail-closed** に転換し、Supabase 障害・例外発生時はログインへリダイレクト（または 503）させる
2. 例外発生を Sentry / errorReporter に送って、サイレント障害を可視化する
3. `/dashboard` 等の認証必須ルートでも同じポリシーを適用する
4. Server Component 側にも `getUser()` 再検証を必須化し、middleware を唯一の防御線にしない（defense in depth）
