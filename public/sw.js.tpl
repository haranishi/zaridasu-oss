// ザリダス Service Worker — app shell と不変アセットを用途別にキャッシュする
// FR-018 / REQ-293: precache のみビルド時にバージョニングする
// このファイルはテンプレートであり、scripts/build-sw.mjs により public/sw.js が生成される
const PRECACHE_VERSION = '__PRECACHE_VERSION__'
const PRECACHE_CACHE_NAME = `zaridasu-precache-v${PRECACHE_VERSION}`
const ASSET_CACHE_NAME = 'zaridasu-assets'
const ASSET_CACHE_MAX_ENTRIES = 200
const LEGACY_CACHE_NAME_PATTERN = /^zaridasu-v(?:[0-9a-f]{8}|dev|[0-9]+)$/
const PRECACHE_ASSETS = [
  '/offline.html',
  '/icon-192.svg',
  '/icon-512.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/og-image.png',
]
const CACHEABLE_NAVIGATION_PATHS = new Set(['/', '/dashboard'])
// install 時のウォームで、ナビゲーション HTML が参照する /_next/static/ を何件まで取得するか。
// `/` の 1 回分のページロードに相当する量を想定した上限（暴走時のデータ量ガード）。
const NAVIGATION_WARM_ASSET_LIMIT = 60
// ウォーム全体のソフトタイムアウト。超過しても install は成功させる（部分ウォームで妥協する）。
const NAVIGATION_WARM_TIMEOUT_MS = 20000

// 失敗も遅延も install に波及させないためのラッパ。常に resolve する。
function settleWithin(promise, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    promise.then(done, done)
  })
}

// Install: pre-cache shell
// REQ-293 FR-293-03: ナビゲーション HTML は「そのバージョンの precache」に入るため、デプロイのたびに
//   activate のパージで消える。放置すると **デプロイ直後だけオフラインのコールドスタートが再び失敗する**
//   （圏外の水辺でアプリを起動して下書きを書けない）。そこで install 時に app shell をウォームし、
//   新しい SW が activate した直後から「そのデプロイ自身のチャンクと整合した HTML」が使える状態にする。
//   バージョン非依存キャッシュに HTML を置く案は採らない: 古い HTML が purge 済みチャンクを参照して
//   白画面になるリスクがあるため（HTML とチャンクの世代を必ず揃える）。
//   ウォームは cache.addAll を使わない（1 件でも失敗すると install 全体が失敗するため）。
//   個別 fetch ＋ catch ＋ ソフトタイムアウトで、失敗しても install を壊さない。
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE_CACHE_NAME)
      .then((cache) =>
        Promise.all([
          // 必須アセット。ここが失敗したら install は失敗させる（従来どおりの契約）。
          cache.addAll(PRECACHE_ASSETS),
          // app shell のウォームは best-effort。
          settleWithin(warmNavigationCache(cache), NAVIGATION_WARM_TIMEOUT_MS),
        ])
      )
  )
  self.skipWaiting()
})

// Activate: 現行以外の precache と旧命名キャッシュだけを削除する。
// バージョン非依存の zaridasu-assets と他用途のキャッシュは保持する。
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (key) =>
              (key.startsWith('zaridasu-precache-v') && key !== PRECACHE_CACHE_NAME) ||
              LEGACY_CACHE_NAME_PATTERN.test(key)
          )
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

function normalizeNavigationPath(pathname) {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }
  return pathname
}

function isExcludedNavigationPath(pathname) {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/auth' ||
    pathname.startsWith('/auth/')
  )
}

function offlineFallback() {
  return caches
    .open(PRECACHE_CACHE_NAME)
    .then((cache) => cache.match('/offline.html'))
    .then((response) => response || new Response('Offline', { status: 503 }))
}

// ナビゲーション HTML のキャッシュキー。ウォーム側と fetch ハンドラ側で **必ず同じ構成**にする
// （Cache API の照合は URL ＋ 保存レスポンスの Vary で行うため、キーの作り方が揃っていないと
//  書いたのに引けないという取りこぼしが起きる）。
function navigationCacheKey(pathname) {
  return new Request(`${self.location.origin}${pathname}`)
}

// HTTP エラーと認証リダイレクトは HTML キャッシュに入れない。
// （`/dashboard` は middleware が未認証を `/` へ 302 するため、未ログイン時は redirected で弾かれる。
//   ＝認証前のリダイレクト結果を `/dashboard` として保存してしまう事故が起きない）
function isCacheableNavigationResponse(response, expectedPath) {
  const responsePath = response.url
    ? normalizeNavigationPath(new URL(response.url).pathname)
    : ''
  const contentType = response.headers.get('content-type') || ''
  return (
    response.ok &&
    !response.redirected &&
    responsePath === expectedPath &&
    contentType.includes('text/html')
  )
}

async function fetchAndCacheNavigation(request, cacheKey, expectedPath) {
  const response = await fetch(request)

  if (isCacheableNavigationResponse(response, expectedPath)) {
    try {
      const cache = await caches.open(PRECACHE_CACHE_NAME)
      await cache.put(cacheKey, response.clone())
    } catch {
      // Cache Storage の容量不足等でも、取得できたネットワーク応答は返す。
    }
  }
  return response
}

async function trimAssetCache() {
  const cache = await caches.open(ASSET_CACHE_NAME)
  const keys = await cache.keys()
  const overflow = keys.length - ASSET_CACHE_MAX_ENTRIES
  if (overflow > 0) {
    await Promise.all(keys.slice(0, overflow).map((key) => cache.delete(key)))
  }
}

async function fetchAndCacheAsset(request) {
  const response = await fetch(request)
  if (response.ok) {
    try {
      const cache = await caches.open(ASSET_CACHE_NAME)
      await cache.put(request, response.clone())
      await trimAssetCache()
    } catch {
      // キャッシュ書き込み失敗をアセット取得失敗へ波及させない。
    }
  }
  return response
}

// ウォームした HTML が参照する /_next/static/ を不変アセットキャッシュへ入れる。
// これが無いと「HTML はあるがチャンクが無い」状態になり、デプロイ直後のオフライン起動が
// 白画面になる（`/` の本体は client component なので JS が無いと投稿フォームが描画されない）。
async function warmReferencedAssets(html) {
  const referenced = html.match(/\/_next\/static\/[^"'\\\s<>()]+/g) || []
  const paths = Array.from(new Set(referenced))
    .filter((path) => /\.(?:js|css|woff2?)$/.test(path))
    .slice(0, NAVIGATION_WARM_ASSET_LIMIT)
  if (paths.length === 0) return

  const cache = await caches.open(ASSET_CACHE_NAME)
  await Promise.all(
    paths.map(async (path) => {
      try {
        const request = new Request(`${self.location.origin}${path}`)
        // 既に持っているものは取り直さない（コンテンツハッシュ名なので内容は不変）。
        if (await cache.match(request)) return
        const response = await fetch(request)
        if (response.ok) await cache.put(request, response)
      } catch {
        // 個別チャンクの失敗はウォーム全体も install も止めない。
      }
    })
  )
  await trimAssetCache()
}

// install 時の app shell ウォーム（FR-293-03）。
// `/` は必ず対象。`/dashboard` は未ログイン時に middleware が `/` へ 302 するため、
// **ログイン中に新しい SW が install されたときだけ**ウォームされる（未ログイン時は静かにスキップ）。
// `/dashboard` は「復帰後に下書きを送る」画面でオンライン前提なので、この best-effort で足りる。
// キャッシュする HTML はハイドレーション前のシェル（ユーザー固有データを含まない）である。
async function warmNavigationCache(cache) {
  await Promise.all(
    Array.from(CACHEABLE_NAVIGATION_PATHS).map(async (path) => {
      try {
        // cache: 'reload' で HTTP キャッシュを迂回し、このデプロイの HTML を確実に取る。
        const response = await fetch(
          new Request(`${self.location.origin}${path}`, { cache: 'reload' })
        )
        if (!isCacheableNavigationResponse(response, path)) return
        // clone は put より前に作る（put は元レスポンスの body を消費する）。
        // HTML の保存を先に確定させ、チャンクのウォームはその後に行う
        // （本文の読み取りで失敗しても HTML のキャッシュは残る）。
        const forParsing = response.clone()
        await cache.put(navigationCacheKey(path), response)
        await warmReferencedAssets(await forParsing.text())
      } catch {
        // 1 件の失敗が他のパスや install を壊さない（cache.addAll を使わない理由）。
      }
    })
  )
}

// Fetch: stale-while-revalidate for app-shell navigations, cache-first for immutable assets
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET and cross-origin
  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return

  // Navigation requests: /api・/auth は明示的にキャッシュ対象外。
  // / と /dashboard は成功HTMLを動的保存する stale-while-revalidate。
  if (request.mode === 'navigate') {
    const navigationPath = normalizeNavigationPath(url.pathname)
    const canCacheNavigation =
      !isExcludedNavigationPath(navigationPath) &&
      CACHEABLE_NAVIGATION_PATHS.has(navigationPath)

    if (canCacheNavigation) {
      // install 時のウォームと同じキー構成にする（navigationCacheKey に一本化）。
      const cacheKey = navigationCacheKey(navigationPath)
      const networkResponse = fetchAndCacheNavigation(
        request,
        cacheKey,
        navigationPath
      )
      event.waitUntil(networkResponse.then(() => undefined).catch(() => undefined))
      event.respondWith(
        caches
          .open(PRECACHE_CACHE_NAME)
          .then((cache) => cache.match(cacheKey))
          .then((cached) => cached || networkResponse.catch(() => offlineFallback()))
      )
      return
    }

    // catch に到達したネットワーク層の失敗は、エラー文言に依存せずフォールバックする。
    // fetch が返した HTTP 4xx/5xx は then 相当でそのまま返る。
    event.respondWith(fetch(request).catch(() => offlineFallback()))
    return
  }

  // 不変アセット: バージョン非依存キャッシュをデプロイ間で保持する。
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/images/')
  ) {
    event.respondWith(
      caches.open(ASSET_CACHE_NAME).then((cache) => cache.match(request)).then(
        (cached) =>
          cached ||
          fetchAndCacheAsset(request)
      )
    )
    return
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// REQ-237: Web Push（push 受信 + 通知クリック）。
// キャッシュ/オフライン（install/activate/fetch 上記）には一切触れない独立ハンドラ。
// ペイロードは send-push Edge Function が暗号化して送る JSON
//   { title, body, url?, tag?, icon?, badge? }
// を想定。空 push / 壊れた JSON でも showNotification は必ず呼ぶ（userVisibleOnly 契約のため）。
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {}
  if (event.data) {
    try {
      data = event.data.json()
    } catch {
      // JSON でなければプレーンテキストを本文として扱う
      try { data = { body: event.data.text() } } catch { data = {} }
    }
  }

  const title = (data && data.title) || 'ザリダス'
  const options = {
    body: (data && data.body) || '',
    icon: (data && data.icon) || '/icon-192.png',
    badge: (data && data.badge) || '/icon-192.png',
    // tag があれば同種通知をまとめる（連投の抑制）。
    tag: (data && data.tag) || undefined,
    // クリック時の遷移先を data に保持（既定はトップ）。
    data: { url: (data && data.url) || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 同一オリジンの既存タブがあればフォーカス + 該当 URL へナビゲート。
      for (const client of clientList) {
        const clientUrl = new URL(client.url)
        if (clientUrl.origin === self.location.origin && 'focus' in client) {
          if ('navigate' in client && client.url !== new URL(targetUrl, self.location.origin).href) {
            return client.navigate(targetUrl).then((c) => (c ? c.focus() : client.focus()))
          }
          return client.focus()
        }
      }
      // 開いているタブが無ければ新規ウィンドウ。
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
      return undefined
    })
  )
})
