import { expect, type BrowserContext, type Page, type Route } from '@playwright/test'
import {
  TEST_AUTH_COOKIE_NAME, TEST_SESSION_EXPIRY, TEST_SUPABASE_ORIGIN,
  knownTestUser, testSessionCookie,
} from './admin-auth.mjs'
import { ADMIN_USERS, AUDIT_LOGS, COMMENTS, IRREGULAR_AI_RESULT, POSTS, PRIVATE_SPOTS, RARE_PATH, RARE_SIGHTINGS, REPORTS, RPC_DATA } from './admin-api-data'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6VAAAAABJRU5ErkJggg==', 'base64')
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' }

export async function seedAdminSession(context: BrowserContext, baseURL: string, admin = true) {
  expect(new URL(baseURL).hostname, 'Admin mocks must run on a local Next server').toMatch(/^(127\.0\.0\.1|localhost)$/)
  await context.clearCookies()
  await context.addCookies([{ name: TEST_AUTH_COOKIE_NAME, value: testSessionCookie(admin), url: baseURL, expires: TEST_SESSION_EXPIRY }])
  await context.addInitScript(() => {
    localStorage.setItem('zaridasu_lang', 'ja')
    localStorage.setItem('zaridasu_intro_optout_v1', '1')
    localStorage.setItem('zaridasu_signup_banner_optout_v1', '1')
    localStorage.setItem('zaridasu_install_banner_optout_v1', '1')
  })
}

interface MockCall { method: string; path: string; query: string; body?: Record<string, unknown> }

/** No fallback REST response: an unrecognized query is a test failure, never a live request. */
export async function mockAdminApi(page: Page, baseURL: string) {
  const localOrigin = new URL(baseURL).origin
  const calls: MockCall[] = []
  const unexpected: string[] = []
  const blockedWrites: string[] = []
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  let dashboardUnavailable = false
  let logsUnavailable = false
  let irregularAIResult = false

  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })

  async function json(route: Route, data: unknown, count?: number, status = 200) {
    const headers = { ...CORS, ...(count == null ? {} : { 'Content-Range': count ? `0-${count - 1}/${count}` : '*/0' }) }
    await route.fulfill({ status, contentType: 'application/json', headers, body: route.request().method() === 'HEAD' ? '' : JSON.stringify(data) })
  }
  async function reject(route: Route, reason: string, write = false) {
    unexpected.push(reason)
    if (write) blockedWrites.push(reason)
    await route.abort('blockedbyclient')
  }

  await page.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    // Scripts/RSC/assets use the real local production server; all external services are mocked.
    if (url.origin === localOrigin) {
      if (method !== 'GET' && method !== 'HEAD') return reject(route, `${method} local ${url.pathname}`, true)
      return route.continue()
    }
    if (/^(?:[abc]\.)?tile\.openstreetmap\.org$/.test(url.hostname) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
    }
    if (url.origin !== TEST_SUPABASE_ORIGIN) return reject(route, `${method} external ${url.hostname}${url.pathname}`, !['GET', 'HEAD', 'OPTIONS'].includes(method))
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS' } })

    let body: Record<string, unknown> | undefined
    if (method === 'POST') {
      try { body = request.postDataJSON() as Record<string, unknown> }
      catch { return reject(route, `${method} unexpected non-JSON Supabase ${url.pathname}`, true) }
    }
    calls.push({ method, path: url.pathname, query: url.search, body })
    if (url.pathname === '/auth/v1/user' && method === 'GET') {
      const token = request.headers().authorization?.replace(/^Bearer /, '')
      const user = knownTestUser(token)
      return json(route, user ?? { message: 'Unknown E2E credential' }, undefined, user ? 200 : 401)
    }
    if (url.pathname === '/storage/v1/object/sign/rare-photos' && method === 'POST') {
      if (JSON.stringify(body?.paths) !== JSON.stringify([RARE_PATH])) return reject(route, 'Unexpected signed-photo path')
      return json(route, [{ path: RARE_PATH, signedURL: `/object/sign/rare-photos/${RARE_PATH}?token=e2e-fake-photo-token` }])
    }
    if (url.pathname === `/storage/v1/object/sign/rare-photos/${RARE_PATH}` && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
    }
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/)?.[1]
    if (rpc && method === 'POST') {
      if (rpc === 'get_audit_logs') {
        if (logsUnavailable || dashboardUnavailable) return json(route, { code: 'XX000', message: 'E2E temporary RPC failure' }, undefined, 503)
        const rows = AUDIT_LOGS.filter(log =>
          (!body?.p_action || log.action === body.p_action) && (!body?.p_admin_id || log.admin_id === body.p_admin_id) &&
          (!body?.p_from || new Date(log.created_at) >= new Date(String(body.p_from))) &&
          (!body?.p_to || new Date(log.created_at) <= new Date(String(body.p_to)))
        )
        const limit = Number(body?.p_limit ?? 20)
        const offset = Number(body?.p_offset ?? 0)
        if (!Number.isInteger(limit) || limit <= 0 || !Number.isInteger(offset) || offset < 0) return reject(route, 'Invalid audit paging arguments')
        return json(route, rows.slice(offset, offset + limit).map(log => ({ ...log, total_count: rows.length })))
      }
      if (!Object.hasOwn(RPC_DATA, rpc)) return reject(route, `Unknown RPC ${rpc}`, true)
      if (dashboardUnavailable && rpc === 'get_admin_post_stats') return json(route, { code: 'XX000', message: 'E2E temporary RPC failure' }, undefined, 503)
      if (rpc === 'get_admin_user_list') return json(route, ADMIN_USERS)
      return json(route, RPC_DATA[rpc])
    }
    const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1]
    if (!table || !['GET', 'HEAD'].includes(method)) return reject(route, `${method} unknown Supabase ${url.pathname}`, true)
    if (table === 'ai_call_logs' && method === 'HEAD') return json(route, [], 0)
    if (table === 'user_onboarding' && method === 'GET') return json(route, { region: 'central' })
    if (table === 'posts') {
      if (dashboardUnavailable) return json(route, { code: 'XX000', message: 'E2E temporary REST failure' }, undefined, 503)
      const status = url.searchParams.get('status')?.replace(/^eq\./, '')
      const rows = status ? POSTS.filter(post => post.status === status) : POSTS
      // A photo is needed to exercise ReviewCardAI; no-media records intentionally skip AI rendering.
      return json(route, irregularAIResult ? rows.map(post => ({ ...post, photos: ['/images/american.png'], ai_result: IRREGULAR_AI_RESULT })) : rows, rows.length)
    }
    if (table === 'reports') {
      const resolved = url.searchParams.get('resolved') === 'eq.true'
      const rows = REPORTS.filter(report => report.resolved === resolved)
      return json(route, rows, rows.length)
    }
    if (table === 'comments') {
      const rows = url.searchParams.get('is_admin') === 'eq.true' ? [] : COMMENTS
      return json(route, rows, rows.length)
    }
    if (table === 'private_spots') return json(route, PRIVATE_SPOTS, PRIVATE_SPOTS.length)
    if (table === 'rare_sightings') return json(route, RARE_SIGHTINGS, RARE_SIGHTINGS.length)
    return reject(route, `${method} unknown REST table ${table}`)
  })

  return {
    calls, unexpected, blockedWrites, pageErrors, consoleErrors,
    setDashboardUnavailable: (value: boolean) => { dashboardUnavailable = value },
    setLogsUnavailable: (value: boolean) => { logsUnavailable = value },
    setIrregularAIResult: (value: boolean) => { irregularAIResult = value },
    assertNoLiveWrites() {
      expect(unexpected, 'Every non-local request must match a named API fixture').toEqual([])
      expect(blockedWrites, 'No DB/Storage/Auth write or notification may be attempted').toEqual([])
    },
    assertNoRuntimeErrors(allowedConsoleErrors: RegExp[] = []) {
      expect(pageErrors, 'No React/Leaflet/ErrorBoundary exception').toEqual([])
      expect(consoleErrors.filter(message => !allowedConsoleErrors.some(pattern => pattern.test(message))), 'No unexpected console errors').toEqual([])
    },
  }
}

export const ADMIN_ROUTE_CASES = [
  { path: '/admin', heading: 'ダッシュボード', endpoints: ['get_admin_post_stats', 'get_audit_logs', 'posts', 'reports'] },
  { path: '/admin/posts', heading: '投稿管理', endpoints: ['posts'], content: 'E2E投稿表示' },
  { path: '/admin/reports', heading: '通報管理', endpoints: ['reports'], content: '対象投稿は削除済み' },
  { path: '/admin/users', heading: 'ユーザー管理', endpoints: ['get_admin_user_list'], content: 'member-e2e@example.invalid' },
  { path: '/admin/comments', heading: 'コメント管理', endpoints: ['comments'], content: 'E2Eコメント表示' },
  { path: '/admin/spots', heading: '非公開スポット', endpoints: ['private_spots'], content: 'E2E非公開スポット' },
  { path: '/admin/rare-sightings', heading: '希少種の記録', endpoints: ['rare_sightings'], content: 'E2E希少種' },
  { path: '/admin/logs', heading: '操作ログ', endpoints: ['get_audit_logs', 'get_admin_user_list'], content: 'invalid_credentials' },
  { path: '/admin/ai-cost', heading: 'AI 判定コスト', endpoints: ['get_ai_cost_summary'], content: 'analyze-image' },
  { path: '/admin/experiments', heading: '実験計測（介入評価）', endpoints: ['get_experiment_metrics'] },
  { path: '/admin/kpi', heading: '研究 KPI ダッシュボード', endpoints: ['get_kpi_summary', 'get_kpi_quality_funnel', 'get_retention_cohorts', 'get_ai_accuracy_stats'] },
] as const
