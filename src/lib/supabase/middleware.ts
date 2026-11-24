import { createServerClient, serializeCookieHeader } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { logError } from '@/lib/errorHandler'
import { privateNoStore } from '@/lib/serverRuntime'

// 保護ルート（/admin・/dashboard）の認可は「成功し、有効な user が取れた時だけ通す」素直な
// fail-closed に統一する。redirect 先は素の path（クエリ無し）にする。
// （?reason=... を付けると e2e の末尾一致 /\/admin\/login$/ に一致せず落ちるため付けない）
function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = '' // 既存クエリも落として素の path に正規化する
  return NextResponse.redirect(url)
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // 認可判断に使う path 種別を try の外で確定しておく（catch でも同じ判定を使う）。
  const pathname = request.nextUrl.pathname
  const isAdminRoute = pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')
  const isDashboardRoute = pathname.startsWith('/dashboard')
  const isProtectedPath = pathname.startsWith('/admin') || isDashboardRoute
  const cookieHeaders: string[] = []
  const cacheHeaders = new Headers()
  const finish = (response: NextResponse, finalResponse = false) => {
    // Append serialized writes, including same-name cleanup at distinct scopes.
    // ResponseCookies is keyed by name and would discard those scoped writes.
    cookieHeaders.forEach(cookie => response.headers.append('Set-Cookie', cookie))
    cacheHeaders.forEach((value, name) => response.headers.set(name, value))
    return isProtectedPath ? privateNoStore(response, finalResponse) : response
  }
  const redirect = (target: string) => finish(redirectTo(request, target), true)

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet, headers) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            // Forward the refreshed request Cookie to the downstream server render.
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieHeaders.push(serializeCookieHeader(name, value, {
                ...options,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
              }))
            })
            // SSR 0.12 supplies cache headers with its first write only.
            Object.entries(headers).forEach(([name, value]) => cacheHeaders.set(name, value))
          },
        },
      }
    )

    // FR-004 / REQ-214: matcher (src/middleware.ts) は /admin・/dashboard のみ。
    // どちらも getUser() で Auth サーバーに問い合わせて DB 検証する（クッキー改ざん耐性）。
    // SSR では認可判断に getSession() を使わない（Cookie をそのまま返すだけで再検証されないため）。
    // matcher 対象外の path はそもそもこの関数に到達せず、middleware 認可の対象外（素通り）。
    if (isAdminRoute || isDashboardRoute) {
      // REQ-137 / セキュリティ (fail-closed): getUser() はネットワーク失敗 (fetch failed) を
      // **throw せず** { data: { user }, error: AuthRetryableFetchError } を返すことがある
      // （auth-js が内部で catch するため）。CI など Supabase 到達不可の環境では毎回これになる。
      // よって「error が無く、かつ user が取れた」時だけ認証済みとみなす。error が付いていれば
      // 種別を問わず（未ログイン / fetch failed / 5xx / 不明）検証不能として fail-closed する。
      const { data, error } = await supabase.auth.getUser()
      const user = data?.user
      const authenticated = !error && !!user

      if (isAdminRoute) {
        // admin ルートは「認証済み」かつ「role が厳密に admin」のときだけ通す。
        if (!authenticated || user.app_metadata?.role !== 'admin') {
          // 未認証/検証不能は /admin/login、認証済みだが非 admin も含めて素の /admin/login へ。
          // （非 admin を / に流す挙動は維持しつつ、ログインしていない大多数のケースを優先）
          if (!authenticated) return redirect('/admin/login')
          return redirect('/')
        }
      } else {
        // /dashboard は「認証済み」でありさえすれば通す。
        if (!authenticated) return redirect('/')
      }
    }

    return finish(supabaseResponse)
  } catch (err) {
    // REQ-137: fail-closed for auth-required routes.
    // 認証必須 path で例外 (Supabase 障害 / cookie parse 失敗 / edge runtime 例外 etc.)
    // が起きた場合、redirect でログイン画面 (or トップ) へ誘導する。
    // 公開 path は従来通り fail-open で通過させ、閲覧機能の可用性を維持する。
    logError(err, 'middleware:updateSession')
    if (isAdminRoute) return redirect('/admin/login')
    if (isDashboardRoute) return redirect('/')
    // 公開 path は fail-open 維持
    return finish(NextResponse.next({ request }))
  }
}
