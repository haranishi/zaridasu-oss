# Local Cloudflare runtime checks

`npm run build:cloudflare:fixture` builds the real OpenNext Worker and Wrangler dry-run modules
with fixed synthetic backend values, preview markers, and synthetic Sentry/GTM canaries that prove
monitoring stays disabled. Actual credentials and source-map tokens are excluded. Next/Wrangler
and Sentry build-plugin telemetry are disabled; Node builds may fetch fonts. Workerd requests have
a strict no-network fallback policy.
It accepts no project env files and inherits only host execution settings, so use an isolated worktree.
The usual Next/Vercel build command remains available.

`npm run test:cloudflare` reuses those artifacts and starts workerd through the installed,
exactly pinned Miniflare version. It uses Wrangler's binding conversion and local R2, the real
`DOQueueHandler`, ASSETS, IMAGES, and a self service binding. Missing or incompatible synthetic
build artifacts fail with the fixture build command to run.

Every run owns a fresh directory under `.wrangler/runtime-fixtures/`; `reset()` disposes workerd,
deletes local storage, regenerates Auth state, and starts a fresh instance. `close()` disposes and
removes state, including after failed startup. Tests must register it with their teardown hook.

The harness routes **every Worker's** outbound fetch through a synthetic allowlist. There is no
network fetch fallback, remote binding, or metadata fetch. Only the fixture Supabase Auth/public
data/image paths and the bounded recorded OG font/emoji requests are served; other requests return 502.
Request evidence stores method, host, path,
kind and authentication presence; it stores no Cookie, token, body, or query. Session HMAC keys and
tokens exist only in memory and emails use `example.invalid`.

The small probe Worker verifies outbound denial inside workerd. Application requests execute the
unmodified built application, including Node Proxy and Supabase SSR `getUser()`.
`createCloudflareHarness()` provides `fetch`, `probeOutbound`, `backend.session('a'|'b'|'admin')`,
`getCacheBucket`, `getBindings`, `restart`, `getRevalidationState`, `reset`, and `close`. Calls are sequential; no test
runner or auth bypass is injected into production code.

The checks cover basic routes, verified Auth/failure/role boundaries, refreshed and removed Cookie
chunks, private no-store and preserved framework Vary, trusted Cloudflare IP bursts, cache isolation
and lifecycle. Auth sessions accept synthetic expiry/metadata-size options and the backend can
return controlled Auth faults. Preview checks also run real browser scripts, verify SSR/API and
ASSETS noindex, and compare static CSP/security/cache headers with the built Next policy.

Cloudflare builds pin `ZARIDASU_DEPLOYMENT_ENV=preview` and compile its public label for browser
guards. The fixture deliberately builds with synthetic nonempty Sentry/GTM IDs; inherited upload
tokens are cleared. `asset-headers.mjs` writes only `.open-next/assets/_headers` from the actual
Next routes manifest, adding Next's framework static cache policy and preview noindex.
The separate Sentry probe uses the actual Next Cloudflare wrapper with an in-memory sink, checks
zero preview sends and production event/automatic span scrubbing. SDK 11 defaults to streaming
spans, so `traceLifecycle: static` preserves the existing transaction scrub hook.
Delivery checks run actual IMAGES resizing and reject credentials, forbidden origins, redirects and
unused CDN proxy requests before external fetch. OG uses recorded licensed Noto/Twemoji responses
from `assets/`; Japanese PNG evidence is written privately to `.wrangler/task-6.6/`.

ISR uses `/area` and synthetic public counts: R2 fill/hit, native DO queue revalidation, private
Set-Cookie exclusion and persistence across `restart()`. The test ages exactly one local R2 SQLite
upload timestamp while workerd is stopped, leaving cache JSON and production code unchanged.
`reset()` still destroys all state. Native DO sync rows are read from isolated SQLite while workerd is stopped.
Browser checks stream/execute the real Rust Wasm under CSP and exercise SW registration, scope,
update cleanup and known-warm offline shells. The authenticated root and actual Drawer are visited
online first; every lazy dependency comes from the built loadable manifest and must have an HTTP 200
response and SW CacheStorage entry. Offline real Drawer content and the dashboard must remain
mounted for 1.5 seconds after the loading screen completes, retaining SW control and caches.
Only the isolated HTTP bridge changes SW version bytes
to simulate deployment. A deny-by-default browser proxy also covers SW-owned external requests; expected synthetic backend
connections that bypass browser routing are denied there, never forwarded to the network.
Remote deployment/account and plan limits remain separate gates.

The Node `*.checks.mjs` name and explicit command keep workerd out of the jsdom/Vitest unit suite.
No Cloudflare account, production credentials, DNS change, or actual Supabase data is required.

Never-visited lazy chunks remain a production-cutover residual: SW installation warms only
HTML-referenced assets. In the isolated cold-menu control, the first Drawer opening happened offline;
its missing dynamic chunk triggered the existing error recovery, which unregisters the SW, deletes
caches and reloads. The no-menu and online-visited-menu controls retained their shells after loading
and a 1.5-second stability window; none attempted a proxy-blocked external connection.
Private causal evidence is in `.wrangler/task-6.6/debug-{no-menu,warm-menu,cold-menu}.json`.
The current known-warm browser result and stable Drawer screenshot are in that directory too.
An earlier transient menu-click pass is superseded. Header/error/SW source equivalence is recorded,
but no deployed legacy Vercel runtime baseline was run. This check does not establish complete
offline/draft support or remote production readiness. Product SW/cache recovery is unchanged.
