// @vitest-environment node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const projectRoot = resolve(import.meta.dirname, '../..')
const generatedPath = resolve(projectRoot, 'public/sw.js')
let generated = ''

function buildSw(): string {
  execFileSync(process.execPath, ['scripts/build-sw.mjs'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      SW_BUILD_DEV: '1',
      VERCEL_GIT_COMMIT_SHA: '',
    },
    stdio: 'pipe',
  })
  return readFileSync(generatedPath, 'utf8')
}

describe('build-sw — REQ-293 cache separation', () => {
  beforeAll(() => {
    generated = buildSw()
  })

  it('開発ビルドでprecacheだけをバージョニングし、アセットキャッシュ名を固定する', () => {
    expect(generated).toContain("const PRECACHE_VERSION = 'dev'")
    expect(generated).toContain(
      'const PRECACHE_CACHE_NAME = `zaridasu-precache-v${PRECACHE_VERSION}`',
    )
    expect(generated).toContain("const ASSET_CACHE_NAME = 'zaridasu-assets'")
    expect(generated).not.toContain('__PRECACHE_VERSION__')
  })

  it('旧precacheと旧命名キャッシュだけをactivate時の削除対象にする', () => {
    expect(generated).toContain("key.startsWith('zaridasu-precache-v')")
    expect(generated).toContain(
      'const LEGACY_CACHE_NAME_PATTERN = /^zaridasu-v(?:[0-9a-f]{8}|dev|[0-9]+)$/',
    )
    expect(generated).toContain('LEGACY_CACHE_NAME_PATTERN.test(key)')
    expect(generated).toContain('key !== PRECACHE_CACHE_NAME')
    expect(generated).not.toContain("key !== ASSET_CACHE_NAME")
  })

  it('不変アセットキャッシュに200件上限がある', () => {
    expect(generated).toContain('const ASSET_CACHE_MAX_ENTRIES = 200')
    expect(generated).toContain('keys.slice(0, overflow)')
  })

  it('app shell のウォームに cache.addAll を使わない（1件の失敗でinstallを壊さないため）', () => {
    // addAll は PRECACHE_ASSETS の1回だけ。ナビゲーションHTMLは個別fetch＋catchで入れる。
    expect(generated.match(/cache\.addAll\(/g)).toHaveLength(1)
    expect(generated).toContain('cache.addAll(PRECACHE_ASSETS)')
    expect(generated).toContain('warmNavigationCache(cache)')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REQ-293 FR-293-03: install 時の app shell ウォームの挙動テスト。
// 生成された sw.js を実際に評価し、Cache Storage / fetch のフェイクで観測する。
// （文言の一致ではなく「オフラインのコールドスタートでHTMLが返る」ことを検証する）
// ─────────────────────────────────────────────────────────────────────────────

const ORIGIN = 'https://zaridasu.test'
const PRECACHE_NAME = 'zaridasu-precache-vdev'
const ASSET_NAME = 'zaridasu-assets'

const HOME_HTML = [
  '<!doctype html><html><head>',
  '<link rel="stylesheet" href="/_next/static/css/app-1111.css"/>',
  '<script src="/_next/static/chunks/main-2222.js"></script>',
  '<link rel="preload" href="/_next/static/media/font-3333.woff2" as="font"/>',
  '</head><body><div id="root"></div>',
  // RSC flight payload 内のエスケープされたチャンク参照（バックスラッシュで停止すること）
  '<script>__NEXT_F.push([1,"\\"/_next/static/chunks/app/page-4444.js\\""])</script>',
  // 画像は不変アセットだが拡張子フィルタの対象外（ウォームしない）
  '<img src="/_next/static/media/logo-5555.png"/>',
  '</body></html>',
].join('')

const DASHBOARD_HTML = '<!doctype html><html><body>dashboard shell</body></html>'

class FakeHeaders {
  private readonly map: Map<string, string>
  constructor(init: Record<string, string> = {}) {
    this.map = new Map(Object.entries(init).map(([k, v]) => [k.toLowerCase(), v]))
  }
  get(key: string): string | null {
    return this.map.get(key.toLowerCase()) ?? null
  }
}

interface ResponseInit {
  status?: number
  headers?: Record<string, string>
  url?: string
  redirected?: boolean
}

class FakeResponse {
  readonly body: string
  readonly status: number
  readonly headers: FakeHeaders
  readonly url: string
  readonly redirected: boolean
  private readonly init: ResponseInit
  private used = false

  constructor(body = '', init: ResponseInit = {}) {
    this.body = body
    this.init = init
    this.status = init.status ?? 200
    this.headers = new FakeHeaders(init.headers ?? { 'content-type': 'text/html; charset=utf-8' })
    this.url = init.url ?? ''
    this.redirected = init.redirected ?? false
  }
  get ok(): boolean {
    return this.status >= 200 && this.status < 300
  }
  clone(): FakeResponse {
    if (this.used) throw new TypeError('Response body is already used')
    return new FakeResponse(this.body, this.init)
  }
  async text(): Promise<string> {
    this.used = true
    return this.body
  }
}

class FakeRequest {
  readonly url: string
  readonly method: string
  readonly mode: string
  readonly cache: string | undefined
  constructor(
    input: string | FakeRequest,
    init: { method?: string; mode?: string; cache?: string } = {},
  ) {
    this.url = typeof input === 'string' ? input : input.url
    this.method = init.method ?? 'GET'
    this.mode = init.mode ?? 'cors'
    this.cache = init.cache
  }
}

type CacheKey = string | FakeRequest
// 実 Cache API と同じく、相対URLはSWのスコープ（= ORIGIN）を基準に解決する。
// （sw.js は offlineFallback で `cache.match('/offline.html')` と相対指定するため、
//  ここを素の文字列比較にすると addAll で入れた絶対URLと突き合わせられない）
const keyOf = (key: CacheKey): string =>
  new URL(typeof key === 'string' ? key : key.url, ORIGIN).toString()

class FakeCache {
  readonly entries = new Map<string, FakeResponse>()
  constructor(private readonly fetchImpl: (req: FakeRequest) => Promise<FakeResponse>) {}

  async match(key: CacheKey): Promise<FakeResponse | undefined> {
    return this.entries.get(keyOf(key))
  }
  async put(key: CacheKey, response: FakeResponse): Promise<void> {
    this.entries.set(keyOf(key), response)
  }
  async addAll(paths: string[]): Promise<void> {
    // 実 API と同じ「1件でも失敗すれば全体が reject」を再現する。
    for (const path of paths) {
      const response = await this.fetchImpl(new FakeRequest(`${ORIGIN}${path}`))
      if (!response.ok) throw new TypeError(`addAll failed: ${path}`)
      this.entries.set(keyOf(path), response)
    }
  }
  async keys(): Promise<FakeRequest[]> {
    return [...this.entries.keys()].map((url) => new FakeRequest(url))
  }
  async delete(key: CacheKey): Promise<boolean> {
    return this.entries.delete(keyOf(key))
  }
}

class FakeCacheStorage {
  readonly named = new Map<string, FakeCache>()
  constructor(private readonly fetchImpl: (req: FakeRequest) => Promise<FakeResponse>) {}
  async open(name: string): Promise<FakeCache> {
    let cache = this.named.get(name)
    if (!cache) {
      cache = new FakeCache(this.fetchImpl)
      this.named.set(name, cache)
    }
    return cache
  }
  async keys(): Promise<string[]> {
    return [...this.named.keys()]
  }
  async delete(name: string): Promise<boolean> {
    return this.named.delete(name)
  }
}

type Routes = Record<string, () => Promise<FakeResponse>>

interface Harness {
  cacheStorage: FakeCacheStorage
  fetched: FakeRequest[]
  install: () => Promise<void>
  navigate: (path: string) => Promise<FakeResponse | undefined>
  setOffline: (offline: boolean) => void
}

function createHarness(routes: Routes): Harness {
  const fetched: FakeRequest[] = []
  let offline = false

  const fetchImpl = async (input: string | FakeRequest): Promise<FakeResponse> => {
    const request = typeof input === 'string' ? new FakeRequest(input) : input
    fetched.push(request)
    if (offline) throw new TypeError('Load failed')
    const path = request.url.replace(ORIGIN, '')
    const route = routes[path]
    if (!route) return new FakeResponse('not found', { status: 404, url: request.url })
    return route()
  }

  const cacheStorage = new FakeCacheStorage(fetchImpl as (req: FakeRequest) => Promise<FakeResponse>)

  const listeners = new Map<string, (event: unknown) => unknown>()
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: (event: unknown) => unknown) => {
      listeners.set(type, listener)
    },
    skipWaiting: () => undefined,
    clients: { claim: () => undefined, matchAll: async () => [] },
    registration: { showNotification: async () => undefined },
  }

  const source = readFileSync(generatedPath, 'utf8')
  // sw.js は ServiceWorkerGlobalScope 前提のスクリプト。必要なグローバルだけを注入して評価する。
  const factory = new Function(
    'self',
    'caches',
    'fetch',
    'Request',
    'Response',
    source,
  ) as (
    s: unknown,
    c: unknown,
    f: unknown,
    rq: unknown,
    rs: unknown,
  ) => void
  factory(self, cacheStorage, fetchImpl, FakeRequest, FakeResponse)

  const install = async (): Promise<void> => {
    const listener = listeners.get('install')
    if (!listener) throw new Error('install listener not registered')
    let pending: Promise<unknown> = Promise.resolve()
    listener({ waitUntil: (p: Promise<unknown>) => { pending = p } })
    await pending
  }

  const navigate = async (path: string): Promise<FakeResponse | undefined> => {
    const listener = listeners.get('fetch')
    if (!listener) throw new Error('fetch listener not registered')
    let responded: Promise<FakeResponse> | undefined
    const waited: Promise<unknown>[] = []
    listener({
      request: new FakeRequest(`${ORIGIN}${path}`, { mode: 'navigate' }),
      respondWith: (p: Promise<FakeResponse>) => { responded = p },
      waitUntil: (p: Promise<unknown>) => { waited.push(p) },
    })
    const result = responded ? await responded : undefined
    await Promise.allSettled(waited)
    return result
  }

  return {
    cacheStorage,
    fetched,
    install,
    navigate,
    setOffline: (value: boolean) => { offline = value },
  }
}

const okHtml = (body: string, path: string) => async () =>
  new FakeResponse(body, { url: `${ORIGIN}${path}`, headers: { 'content-type': 'text/html' } })

const staticAsset = (path: string) => async () =>
  new FakeResponse(`/* ${path} */`, {
    url: `${ORIGIN}${path}`,
    headers: { 'content-type': 'application/javascript' },
  })

function baseRoutes(): Routes {
  const routes: Routes = {
    '/': okHtml(HOME_HTML, '/'),
    '/dashboard': okHtml(DASHBOARD_HTML, '/dashboard'),
  }
  for (const path of [
    '/offline.html',
    '/icon-192.svg',
    '/icon-512.svg',
    '/icon-192.png',
    '/icon-512.png',
    '/og-image.png',
    '/_next/static/css/app-1111.css',
    '/_next/static/chunks/main-2222.js',
    '/_next/static/media/font-3333.woff2',
    '/_next/static/chunks/app/page-4444.js',
    '/_next/static/media/logo-5555.png',
  ]) {
    routes[path] = staticAsset(path)
  }
  return routes
}

describe('sw.js — REQ-293 FR-293-03 install 時の app shell ウォーム', () => {
  beforeAll(() => {
    generated = buildSw()
  })

  it('install で / と /dashboard の HTML を「そのバージョンの precache」に入れる', async () => {
    const h = createHarness(baseRoutes())
    await h.install()

    const precache = await h.cacheStorage.open(PRECACHE_NAME)
    expect(await precache.match(`${ORIGIN}/`)).toBeDefined()
    expect(await precache.match(`${ORIGIN}/dashboard`)).toBeDefined()
    // バージョン非依存キャッシュにHTMLを置かない（古いHTML×purge済みチャンクの白画面を避ける）
    const assets = await h.cacheStorage.open(ASSET_NAME)
    expect(await assets.match(`${ORIGIN}/`)).toBeUndefined()
  })

  it('HTML の取得で HTTP キャッシュを迂回する（このデプロイの HTML を確実に取る）', async () => {
    const h = createHarness(baseRoutes())
    await h.install()

    const navRequests = h.fetched.filter((r) => r.url === `${ORIGIN}/`)
    expect(navRequests).toHaveLength(1)
    expect(navRequests[0]?.cache).toBe('reload')
  })

  it('ウォームした HTML が参照する js/css/font を不変アセットキャッシュへ入れる', async () => {
    const h = createHarness(baseRoutes())
    await h.install()

    const assets = await h.cacheStorage.open(ASSET_NAME)
    expect(await assets.match(`${ORIGIN}/_next/static/css/app-1111.css`)).toBeDefined()
    expect(await assets.match(`${ORIGIN}/_next/static/chunks/main-2222.js`)).toBeDefined()
    expect(await assets.match(`${ORIGIN}/_next/static/media/font-3333.woff2`)).toBeDefined()
    // RSC payload 内のエスケープされた参照も、バックスラッシュを含まずに抽出できている
    expect(await assets.match(`${ORIGIN}/_next/static/chunks/app/page-4444.js`)).toBeDefined()
    // 拡張子フィルタの対象外はウォームしない
    expect(await assets.match(`${ORIGIN}/_next/static/media/logo-5555.png`)).toBeUndefined()
  })

  it('オフラインのコールドスタートでウォーム済み HTML を返す（AC-05 の中核）', async () => {
    const h = createHarness(baseRoutes())
    await h.install()

    h.setOffline(true)
    const response = await h.navigate('/')
    expect(response).toBeDefined()
    expect(response?.body).toBe(HOME_HTML)
    // offline.html ではなく本物の app shell が返る
    expect(response?.status).toBe(200)
  })

  it('未ログインで /dashboard が / へリダイレクトされてもキャッシュせず install も壊さない', async () => {
    const routes = baseRoutes()
    // middleware が未認証を / へ 302 する挙動（redirect: follow の結果）
    routes['/dashboard'] = async () =>
      new FakeResponse(HOME_HTML, {
        url: `${ORIGIN}/`,
        redirected: true,
        headers: { 'content-type': 'text/html' },
      })
    const h = createHarness(routes)
    await expect(h.install()).resolves.toBeUndefined()

    const precache = await h.cacheStorage.open(PRECACHE_NAME)
    expect(await precache.match(`${ORIGIN}/dashboard`)).toBeUndefined()
    // / のウォームは成功している
    expect(await precache.match(`${ORIGIN}/`)).toBeDefined()
  })

  it('ウォーム対象の fetch が失敗しても install は成功し、他のパスは影響を受けない', async () => {
    const routes = baseRoutes()
    routes['/dashboard'] = async () => {
      throw new TypeError('Load failed')
    }
    const h = createHarness(routes)
    await expect(h.install()).resolves.toBeUndefined()

    const precache = await h.cacheStorage.open(PRECACHE_NAME)
    expect(await precache.match(`${ORIGIN}/`)).toBeDefined()
    expect(await precache.match(`${ORIGIN}/dashboard`)).toBeUndefined()
    // 必須アセットは従来どおり入っている
    expect(await precache.match(`${ORIGIN}/offline.html`)).toBeDefined()
  })

  it('チャンクの取得失敗も install を壊さない（HTML のキャッシュは残る）', async () => {
    const routes = baseRoutes()
    routes['/_next/static/chunks/main-2222.js'] = async () => {
      throw new TypeError('Load failed')
    }
    const h = createHarness(routes)
    await expect(h.install()).resolves.toBeUndefined()

    const precache = await h.cacheStorage.open(PRECACHE_NAME)
    expect(await precache.match(`${ORIGIN}/`)).toBeDefined()
    const assets = await h.cacheStorage.open(ASSET_NAME)
    expect(await assets.match(`${ORIGIN}/_next/static/chunks/main-2222.js`)).toBeUndefined()
    expect(await assets.match(`${ORIGIN}/_next/static/css/app-1111.css`)).toBeDefined()
  })

  it('FR-293-02: キャッシュ対象外パスのオフラインは文言に依存せず offline.html を返す', async () => {
    const routes = baseRoutes()
    routes['/trends'] = okHtml('<html>trends</html>', '/trends')
    const h = createHarness(routes)
    await h.install()

    h.setOffline(true)
    // WebKit は 'Load failed'、Chromium は 'Failed to fetch' を投げる。
    // catch に到達した＝ネットワーク層の失敗なので、文言を見ずにフォールバックする。
    const response = await h.navigate('/trends')
    expect(response?.body).toBe('/* /offline.html */')
    expect(response?.status).toBe(200)
  })

  it('必須アセット（PRECACHE_ASSETS）の失敗は従来どおり install を失敗させる', async () => {
    const routes = baseRoutes()
    routes['/offline.html'] = async () =>
      new FakeResponse('missing', { status: 404, url: `${ORIGIN}/offline.html` })
    const h = createHarness(routes)
    await expect(h.install()).rejects.toThrow()
  })
})
