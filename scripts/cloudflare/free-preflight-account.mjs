import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const unknown = (accountId, checkedAt) => ({ status: 'unknown', source: 'api-subscriptions', accountId, checkedAt })

/** Missing/zero-priced/empty responses never imply a Free subscription. */
export function subscriptionEvidence(response, accountId, checkedAt) {
  const plans = {}
  for (const [product, title] of [['workers', 'Workers Free'], ['images', 'Images Free']]) {
    plans[product] = unknown(accountId, checkedAt)
    if (!response.ok || !response.complete) continue
    const matches = response.records.filter(item => new RegExp(`^${product}(?: |$)`, 'i').test(item.rate_plan?.public_name ?? ''))
    if (matches.length !== 1) continue
    const item = matches[0]
    const rate = item.rate_plan
    if (item.price > 0 || item.state === 'Paid') { plans[product].status = 'paid'; continue }
    if (rate?.public_name !== title || rate.scope !== 'account' || rate.externally_managed !== false
      || rate.is_contract !== false || item.state !== 'Provisioned' || item.price !== 0
      || typeof item.id !== 'string' || !item.id || typeof rate.id !== 'string' || !rate.id) continue
    plans[product] = { status: 'free', source: 'api-subscriptions', accountId, checkedAt,
      publicName: title, scope: 'account', state: item.state, price: 0,
      evidenceId: digest({ id: item.id, rate, start: item.current_period_start, end: item.current_period_end }),
      periodStart: item.current_period_start, periodEnd: item.current_period_end }
  }
  for (const product of ['assets', 'd1', 'durableObjects']) {
    plans[product] = { status: plans.workers.status, source: 'inherits-workers', from: 'workers', accountId, checkedAt }
  }
  return plans
}

export function readWranglerToken({ run = spawnSync } = {}) {
  const inherited = Object.fromEntries(['PATH', 'HOME', 'LANG', 'LC_ALL', 'SystemRoot', 'TMPDIR']
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
  const result = run(process.execPath, [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'auth', 'token', '--json'],
    { cwd: ROOT, env: { ...inherited, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
      CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false' }, encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 * 1024 })
  if (result.error || result.status !== 0) return null
  try { const value = JSON.parse(result.stdout); return typeof value.token === 'string' && value.token.length >= 20 ? value.token : null } catch { return null }
}

/** Fixed GETs only. Token, raw provider results, PII and error messages stay in RAM. */
export async function collectFreeAccount(selection, { fetcher = fetch, tokenReader = readWranglerToken, now = Date.now() } = {}) {
  const { accountId, expectedAccountId } = selection
  const checkedAt = new Date(now).toISOString()
  const empty = { accountId, checkedAt, accountMatch: false, acceptedAdmin: false,
    names: { workersComplete: false, databasesComplete: false, collisions: null },
    plans: subscriptionEvidence({ ok: false }, accountId, checkedAt), checks: {} }
  if (!/^[a-f0-9]{32}$/.test(accountId ?? '') || accountId !== expectedAccountId) return empty
  let token
  try { token = await tokenReader() } catch { return empty }
  if (typeof token !== 'string' || !token) return empty
  const request = async endpoint => {
    try {
      const response = await fetcher(`https://api.cloudflare.com/client/v4${endpoint}`, { method: 'GET',
        headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15_000) })
      const json = await response.json()
      return { ok: response.ok && json.success === true, status: response.status,
        codes: (json.errors ?? []).map(value => value.code).filter(Number.isSafeInteger),
        result: json.result, info: json.result_info }
    } catch { return { ok: false, status: 0, codes: [] } }
  }
  const list = async (endpoint, paged) => {
    const first = await request(endpoint + (paged ? '?per_page=100&page=1' : ''))
    const records = Array.isArray(first.result) ? [...first.result] : []
    let complete = first.ok && Array.isArray(first.result)
    const total = first.info?.total_count
    if (paged && !Number.isSafeInteger(total)) complete = false
    if (!paged && Number.isSafeInteger(total) && total > records.length) complete = false
    for (let page = 2; complete && Number.isSafeInteger(total) && records.length < total && page <= 10; page++) {
      const next = await request(`${endpoint}?per_page=100&page=${page}`)
      if (!next.ok || !Array.isArray(next.result) || next.result.length === 0) { complete = false; break }
      records.push(...next.result)
    }
    if (Number.isSafeInteger(total) && records.length !== total) complete = false
    return { ...first, records, complete }
  }
  const [account, memberships, workers, databases, subscriptions] = await Promise.all([
    request(`/accounts/${accountId}`), list('/memberships', true), list(`/accounts/${accountId}/workers/scripts`, false),
    list(`/accounts/${accountId}/d1/database`, true), list(`/accounts/${accountId}/subscriptions`, false),
  ])
  const membership = memberships.records.find(item => item.account?.id === accountId)
  const roles = (membership?.roles ?? []).map(role => typeof role === 'string' ? role : role.name)
  const acceptedAdmin = memberships.ok && membership?.status === 'accepted' && membership.api_access_enabled !== false
    && roles.some(role => ['SuperAdministratorAllPrivileges', 'Super Administrator - All Privileges'].includes(role))
  const names = [selection.workerName, selection.rendererName, selection.backendName]
  const collisions = workers.records.filter(item => names.includes(item.id ?? item.name)).length
    + databases.records.filter(item => item.name === selection.databaseName).length
  const checks = Object.fromEntries(Object.entries({ account, memberships, workers, databases, subscriptions })
    .map(([name, value]) => [name, { httpStatus: value.status, success: value.ok, errorCodes: value.codes,
      ...(value.records ? { count: value.records.length, complete: value.complete } : {}) }]))
  return { accountId, checkedAt, accountMatch: account.ok && account.result?.id === accountId, acceptedAdmin,
    names: { workersComplete: workers.complete, databasesComplete: databases.complete, collisions },
    plans: subscriptionEvidence(subscriptions, accountId, checkedAt), checks }
}
