import { readFile } from 'node:fs/promises'
import { test as base, expect } from '@playwright/test'
import { ADMIN_ROUTE_CASES, mockAdminApi, seedAdminSession } from './fixtures/admin-api'
import { TEST_ADMIN, TEST_AUTH_COOKIE_NAME, TEST_SESSION_EXPIRY, TEST_SUPABASE_ORIGIN, testSessionCookie } from './fixtures/admin-auth.mjs'

type AdminApi = Awaited<ReturnType<typeof mockAdminApi>>
const test = base.extend<{ adminApi: AdminApi }>({
  adminApi: async ({ context, page, baseURL }, use, testInfo) => {
    expect((process.env.NEXT_PUBLIC_SUPABASE_URL ?? TEST_SUPABASE_ORIGIN).replace(/\/+$/, '')).toBe(TEST_SUPABASE_ORIGIN)
    if (!baseURL) throw new Error('A local Next production server is required')
    await seedAdminSession(context, baseURL)
    const api = await mockAdminApi(page, baseURL)
    await use(api)
    await testInfo.attach('admin-api-mock-evidence', {
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify({
        requests: api.calls, unexpected: api.unexpected, blockedWrites: api.blockedWrites,
        pageErrors: api.pageErrors, consoleErrors: api.consoleErrors,
        actualDbWrites: 0, actualStorageWrites: 0, actualAuthWrites: 0, actualNotifications: 0,
      }, null, 2)),
    })
    api.assertNoLiveWrites()
  },
})

test.use({ serviceWorkers: 'block' })

function hasEndpoint(api: AdminApi, endpoint: string) {
  return api.calls.some(call => call.path === `/rest/v1/${endpoint}` || call.path === `/rest/v1/rpc/${endpoint}`)
}

async function expectHealthy(page: import('@playwright/test').Page, api: AdminApi) {
  await expect(page.getByText('エラーが発生しました', { exact: true })).toHaveCount(0)
  api.assertNoRuntimeErrors()
}

for (const width of [390, 1440]) {
  test.describe(`${width}px admin contracts`, () => {
    test.use({ viewport: { width, height: 900 } })
    for (const routeCase of ADMIN_ROUTE_CASES) {
      test(`${routeCase.path} renders its mocked contract without ErrorBoundary`, async ({ page, adminApi }) => {
        const response = await page.goto(routeCase.path)
        expect(response?.status()).toBe(200)
        await expect(page).toHaveURL(new RegExp(`${routeCase.path}$`))
        const escaped = routeCase.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        await expect(page.getByRole('heading', { level: 1, name: new RegExp(escaped) })).toBeVisible()
        for (const endpoint of routeCase.endpoints) await expect.poll(() => hasEndpoint(adminApi, endpoint)).toBe(true)
        if ('content' in routeCase) {
          await expect(page.getByText(routeCase.content, { exact: false }).filter({ visible: true }).first()).toBeVisible()
        }
        if (routeCase.path === '/admin/rare-sightings') {
          await expect.poll(() => adminApi.calls.some(call => call.path === '/storage/v1/object/sign/rare-photos')).toBe(true)
          await expect(page.locator('[data-testid="admin-rare-list"] img')).toBeVisible()
        }
        if (routeCase.path === '/admin/kpi') await expect(page.getByRole('heading', { name: '① North Star + ガードレール + KGI', exact: true })).toBeVisible()
        if (routeCase.path === '/admin/experiments') await expect(page.getByRole('table')).toHaveCount(4)
        await expectHealthy(page, adminApi)
      })
    }

    test('logs preserve NULLs, JSON details, paging, filters and CSV on both layouts', async ({ page, adminApi }) => {
      await page.goto('/admin/logs')
      await expect(page.getByText('invalid_credentials', { exact: false }).filter({ visible: true }).first()).toBeVisible()
      await expect(page.getByText(/payload:.*\{"toString":null\}/).filter({ visible: true }).first()).toBeVisible()
      await expect(page.getByText('scalar-json', { exact: true }).filter({ visible: true })).toBeVisible()
      expect(await page.getByText('—', { exact: true }).filter({ visible: true }).count()).toBeGreaterThanOrEqual(2)

      const [download] = await Promise.all([
        page.waitForEvent('download'), page.getByRole('button', { name: 'CSVエクスポート' }).click(),
      ])
      expect(download.suggestedFilename()).toMatch(/^audit_logs_\d{4}-\d{2}-\d{2}\.csv$/)
      const path = await download.path()
      if (!path) throw new Error('CSV download was not created')
      const csv = parseCsv((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))
      expect(csv).toHaveLength(21)
      expect(csv[0]).toHaveLength(6)
      expect(csv[1]?.[1]).toBe('') // NULL operator never invents an identifier.
      expect(csv[1]?.[4]).toBe('') // NULL target is an empty CSV cell.
      expect(JSON.parse(csv[1]?.[5] ?? '{}')).toMatchObject({ reason: 'invalid_credentials', attempt_count: 2 })
      expect(JSON.parse(csv[3]?.[5] ?? '{}')).toMatchObject({ payload: { toString: null }, note: 'comma, "quote"\nline' })

      await page.getByRole('button', { name: '次へ →' }).click()
      await expect.poll(() => adminApi.calls.filter(call => call.path.endsWith('/get_audit_logs')).at(-1)?.body?.p_offset).toBe(20)
      await expect(page.getByText('fixture-22', { exact: false }).filter({ visible: true }).first()).toBeVisible()
      await page.getByRole('button', { name: '← 前へ' }).click()
      await expect(page.getByRole('button', { name: '← 前へ' })).toBeDisabled()

      await page.getByRole('combobox').nth(0).selectOption('login_failed')
      await expect.poll(() => adminApi.calls.filter(call => call.path.endsWith('/get_audit_logs')).at(-1)?.body?.p_action).toBe('login_failed')
      await expect(page.locator('tbody tr')).toHaveCount(1)
      await page.getByRole('combobox').nth(0).selectOption('')
      await page.getByRole('button', { name: '自分のみ', exact: true }).click()
      await expect.poll(() => adminApi.calls.filter(call => call.path.endsWith('/get_audit_logs')).at(-1)?.body?.p_admin_id).toBe(TEST_ADMIN.id)
      await page.getByRole('combobox').nth(1).selectOption('')
      await page.locator('input[type=date]').nth(0).fill('2026-01-01')
      await page.locator('input[type=date]').nth(1).fill('2026-12-31')
      await expect.poll(() => adminApi.calls.filter(call => call.path.endsWith('/get_audit_logs')).at(-1)?.body).toMatchObject({
        p_offset: 0, p_from: '2026-01-01', p_to: '2026-12-31T23:59:59', p_admin_id: null,
      })
      await expectHealthy(page, adminApi)
    })
  })
}

test('logs show a recoverable API error and retry fetches again', async ({ page, adminApi }) => {
  adminApi.setLogsUnavailable(true)
  await page.goto('/admin/logs')
  const fetchAlert = page.getByRole('alert').filter({ hasText: '操作ログを読み込めませんでした' })
  await expect(fetchAlert).toBeVisible()
  const attempts = adminApi.calls.filter(call => call.path.endsWith('/get_audit_logs')).length
  adminApi.setLogsUnavailable(false)
  await fetchAlert.getByRole('button', { name: '再試行', exact: true }).click()
  await expect(fetchAlert).toHaveCount(0)
  await expect(page.getByText('invalid_credentials', { exact: false }).filter({ visible: true }).first()).toBeVisible()
  expect(adminApi.calls.filter(call => call.path.endsWith('/get_audit_logs')).length).toBeGreaterThan(attempts)
  adminApi.assertNoRuntimeErrors([/status of 503/, /\[AdminLogsPage:fetchLogs\]/])
})

test('dashboard retry recovers without navigation after critical API failure', async ({ page, adminApi }) => {
  adminApi.setDashboardUnavailable(true)
  await page.goto('/admin')
  // postgrest-js exhausts three GET/HEAD 503 retries with 1s + 2s + 4s backoff.
  await expect(page.getByText('統計データの取得に失敗しました。', { exact: true })).toBeVisible({ timeout: 15_000 })
  const attempts = adminApi.calls.filter(call => call.path.endsWith('/get_admin_post_stats')).length
  adminApi.setDashboardUnavailable(false)
  await page.getByRole('button', { name: '再試行', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'ダッシュボード', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/admin$/)
  expect(adminApi.calls.filter(call => call.path.endsWith('/get_admin_post_stats')).length).toBeGreaterThan(attempts)
  adminApi.assertNoRuntimeErrors([/status of 503/, /\[useAdminStats:/])
})

test('user detail is a read-only mocked RPC and closes with Escape', async ({ page, adminApi }) => {
  await page.goto('/admin/users')
  await expect(page.getByText(TEST_ADMIN.email, { exact: true }).filter({ visible: true }).last()).toBeVisible()
  await page.getByRole('button', { name: '詳細', exact: true }).filter({ visible: true }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect.poll(() => hasEndpoint(adminApi, 'get_user_activity')).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expectHealthy(page, adminApi)
})

test('posts handle irregular historical AI JSON without bringing down the admin layout', async ({ page, adminApi }) => {
  adminApi.setIrregularAIResult(true)
  await page.goto('/admin/posts')
  await expect(page.getByRole('heading', { name: '投稿管理' })).toBeVisible()
  const card = page.locator('article').filter({ hasText: 'E2E投稿表示' })
  await expect(card.getByText('検出種', { exact: true }).locator('..')).toContainText('アメリカザリガニ')
  await expect(card.getByText('historic object', { exact: false })).toHaveCount(0)
  await expect(card.getByText('信頼度', { exact: true })).toHaveCount(0)
  await expectHealthy(page, adminApi)
})

for (const kind of ['member', 'forged-admin'] as const) {
  test(`${kind} cannot access protected admin UI`, async ({ context, baseURL, adminApi }) => {
    if (!baseURL) throw new Error('Missing local server')
    await seedAdminSession(context, baseURL, false)
    if (kind === 'forged-admin') {
      const session = JSON.parse(Buffer.from(testSessionCookie(true).slice('base64-'.length), 'base64url').toString())
      session.access_token += 'tampered'
      await context.addCookies([{ name: TEST_AUTH_COOKIE_NAME, value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: baseURL, expires: TEST_SESSION_EXPIRY }])
    }
    // Inspect the real Proxy redirect without mounting the public destination or weakening auth.
    const response = await context.request.get(`${new URL(baseURL).origin}/admin/logs`, { maxRedirects: 0 })
    expect(response.status()).toBe(307)
    expect(new URL(response.headers().location ?? '', baseURL).pathname).toBe(kind === 'member' ? '/' : '/admin/login')
    expect(await response.text()).not.toContain('操作ログ')
    expect(hasEndpoint(adminApi, 'get_audit_logs')).toBe(false)
    adminApi.assertNoRuntimeErrors()
  })
}

/** Small RFC4180 reader so CSV assertions include quotes, commas and JSON unchanged. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], value = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++ }
      else quoted = !quoted
    } else if (ch === ',' && !quoted) { row.push(value); value = '' }
    else if (ch === '\n' && !quoted) { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = '' }
    else value += ch
  }
  if (value || row.length) { row.push(value); rows.push(row) }
  return rows
}
