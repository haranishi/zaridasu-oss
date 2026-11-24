import { test, expect } from '@playwright/test'

// REQ-126 FR-126-16: AdminLayout の Gemini 認証エラーバナーが
// 直近 1 時間の `ai_call_logs.error_kind='gemini_auth'` カウントに応じて表示・
// クローズ後セッション中は非表示になることを検証する。
//
// 戦略:
//   - middleware (getUser) が Supabase に問い合わせるパスを page.route で
//     全部モックし、admin 権限付き user を返す。
//   - ai_call_logs クエリ (count: 'exact', head: true) は HEAD/GET で
//     PostgREST に行くので、`/rest/v1/ai_call_logs` への request を
//     Content-Range で件数 1 を返すように intercept する。
//   - バナーは sessionStorage('admin.geminiAuthBanner.dismissed.v1') を見るので、
//     close → reload しても sessionStorage が保持されるかを確認する。
//
// 環境変数 NEXT_PUBLIC_SUPABASE_URL のホストに対して route を貼る。
// playwright.config.ts のデフォルトは 'https://placeholder.supabase.co'。
//
// REQ-110 / FR-110-04 と異なり、本テストは middleware 通過のための
// 完全な auth セッション cookie を持たないため、middleware の getUser() を
// route で mock することで /admin/posts を 200 で返させる。

const SUPABASE_HOST = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
).replace(/\/+$/, '')

const ADMIN_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'admin@example.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { role: 'admin', provider: 'email' },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
}

// REQ-167: AdminLayout はクライアント側 useAuth()（@supabase/ssr の getSession = cookie 読込）が
// admin user を返すまでバナーを描画しない。middleware の getUser を route mock するだけでは
// クライアントセッションが確立されず、バナーが永遠に出ずテストが落ちる。
// そこで @supabase/ssr が読む cookie（sb-<ref>-auth-token、値は "base64-" + base64url(JSON session)）を
// 直接 seed して、クライアントの getSession が admin セッションを返すようにする。
// ref は SUPABASE_HOST のホスト先頭ラベル（supabase-js の defaultStorageKey 導出と同じ）。
const SUPABASE_REF = new URL(SUPABASE_HOST).hostname.split('.')[0]
const AUTH_COOKIE_NAME = `sb-${SUPABASE_REF}-auth-token`

function buildAdminSessionCookie(baseURL: string) {
  const nowSec = Math.floor(Date.now() / 1000)
  const expSec = nowSec + 60 * 60 * 24 * 365 // 1 年後（refresh を発生させない）
  const b64url = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const accessToken = [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({
      sub: ADMIN_USER.id,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: { role: 'admin' },
      exp: expSec,
    }),
    'signature',
  ].join('.')
  const session = {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 60 * 60 * 24 * 365,
    expires_at: expSec,
    refresh_token: 'e2e-fake-refresh-token',
    user: ADMIN_USER,
  }
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
  return { name: AUTH_COOKIE_NAME, value, url: baseURL }
}

async function setupAdminRoutes(page: import('@playwright/test').Page, opts: {
  geminiAuthCount: number
}) {
  // /auth/v1/user は middleware の getUser() で叩かれる
  await page.route(`${SUPABASE_HOST}/auth/v1/user**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ADMIN_USER),
    })
  })

  // /auth/v1/token も場合により叩かれる
  await page.route(`${SUPABASE_HOST}/auth/v1/token**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
        token_type: 'bearer',
        user: ADMIN_USER,
      }),
    })
  })

  // REQ-167: 他の REST 呼び出しは空配列でフォールバック。
  // 注意: Playwright は「後に登録した route が優先（last-registered wins）」のため、
  // このキャッチオールは ai_call_logs 専用 route より *先に* 登録する。逆順だと
  // キャッチオール（Content-Range 無し）が ai_call_logs を横取りし、count が取れず
  // バナーが出ない（このテストが恒常的に失敗していた原因）。
  await page.route(`${SUPABASE_HOST}/rest/v1/**`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  // ai_call_logs の count クエリ（キャッチオールより後に登録して優先させる）
  await page.route(`${SUPABASE_HOST}/rest/v1/ai_call_logs**`, async (route) => {
    const req = route.request()
    const method = req.method()
    // count: 'exact', head: true → HEAD with Prefer: count=exact
    if (method === 'HEAD' || method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Content-Range': `0-0/${opts.geminiAuthCount}`,
          // REQ-167: supabase-js は count を content-range ヘッダから読む。クロスオリジン
          // (127.0.0.1 → *.supabase.co) では Access-Control-Expose-Headers が無いと
          // ブラウザ側 JS が content-range を読めず count=null になりバナーが出ない。
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'Content-Range, content-range',
        },
        body: '[]',
      })
      return
    }
    await route.fulfill({ status: 200, body: '[]' })
  })
}

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.clearCookies()
  // REQ-167: クライアント側 useAuth()（@supabase/ssr の getSession = document.cookie 読込）を
  // admin セッションで確立させる。バナーは AdminLayout の認証ゲートの内側にあるため、セッションが
  // 無いと「認証確認中...」のまま描画されない。context.addCookies(url) は本環境で page に反映され
  // なかったため、アプリと同一オリジンで document.cookie に直接書き込む addInitScript 方式を使う。
  const _url = baseURL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`
  const cookieValue = buildAdminSessionCookie(_url).value
  // 注: sessionStorage の dismissed フラグはここでクリアしない。addInitScript は reload を含む
  // 全ナビゲーションで実行されるため、ここで消すと「dismiss 後 reload で再表示されない」検証が壊れる。
  // 各テストは新しい BrowserContext で開始するため sessionStorage は元々空。
  await page.addInitScript(
    ([name, value]) => {
      try {
        document.cookie = `${name}=${value}; path=/; max-age=31536000; SameSite=Lax`
        window.localStorage.setItem('zaridasu_lang', 'ja')
      } catch { /* noop */ }
    },
    [AUTH_COOKIE_NAME, cookieValue] as const,
  )
})

test('REQ-126 FR-126-16: 直近 1 時間に gemini_auth が 1 件あれば admin にバナーが見える', async ({ page }) => {
  await setupAdminRoutes(page, { geminiAuthCount: 1 })

  // middleware を介して /admin/posts を開く（admin 権限の user が返るので通過する想定）
  const res = await page.goto('/admin/posts')
  // 500 系で落ちていないこと（middleware の例外は NextResponse.next にフォールバックされる仕様）
  expect(res?.status()).toBeLessThan(500)

  // バナーは hook が初回 fetchCount を行ってから state 更新で出るので polling 待ち
  const banner = page.getByTestId('gemini-auth-banner')
  await expect(banner).toBeVisible({ timeout: 10_000 })
  await expect(banner).toContainText('Gemini API キー')
})

test('REQ-126 FR-126-16: バナーを閉じるとセッション中は再表示されない（reload しても）', async ({ page }) => {
  await setupAdminRoutes(page, { geminiAuthCount: 1 })

  await page.goto('/admin/posts')
  const banner = page.getByTestId('gemini-auth-banner')
  await expect(banner).toBeVisible({ timeout: 10_000 })

  // 閉じる
  await page.getByTestId('gemini-auth-banner-dismiss').click()
  await expect(banner).toHaveCount(0)

  // sessionStorage に永続化されているはず
  const dismissed = await page.evaluate(
    () => window.sessionStorage.getItem('admin.geminiAuthBanner.dismissed.v1'),
  )
  expect(dismissed).toBe('1')

  // 同セッションで reload してもバナーは復活しない
  await page.reload()
  // 30 秒 polling のため、最初の表示判定までは時間がかかるが、dismissed=true で visible=false 固定
  await page.waitForTimeout(1500)
  await expect(banner).toHaveCount(0)
})

test('REQ-126 FR-126-16: gemini_auth カウントが 0 ならバナーは出ない', async ({ page }) => {
  await setupAdminRoutes(page, { geminiAuthCount: 0 })
  await page.goto('/admin/posts')
  const banner = page.getByTestId('gemini-auth-banner')
  // hook の poll を待っても見えない
  await page.waitForTimeout(1500)
  await expect(banner).toHaveCount(0)
})
