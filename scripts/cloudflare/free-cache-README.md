# Native D1 incremental-cache candidate

This is task 7.1 of cloudflare-migration design 9.7 and execution contract 9.7.1/9.7.2/9.7.4.
It is a local cache prototype. It does not select a production plan or change Auth, business DB,
media, the existing R2 profile, or remote Cloudflare resources.

`cloudflare/free/d1-incremental-cache.ts` exports an OpenNext `IncrementalCache`.
Importing it does not require request context. Each operation resolves `NEXT_INC_CACHE_D1`,
optional `NEXT_INC_CACHE_D1_PREFIX`, and the current `OPEN_NEXT_BUILD_ID` lazily.
The core accepts a lazy D1 getter and uses the installed OpenNext 1.20.17 `computeCacheKey`:
SHA-256 key, prefix, build ID, and `cache`/`fetch`/`composable` type separation.
Build IDs use 1–256 ASCII letters, digits, dots, underscores or hyphens. Prefixes use those
characters in slash-separated segments, at most 1024 UTF-8 bytes. Noncanonical namespaces
are rejected to prevent slash normalization from aliasing different build or prefix settings.
Raw keys are nonempty strings of at most 8192 UTF-8 bytes.

Apply `cloudflare/free/cache-schema.sql` explicitly to the dedicated cache database before use.
The adapter never creates or migrates tables during a request. Native checks apply the single
CREATE statement with `prepare(schema).run()`; D1 `exec()` treats newline-separated input as
separate statements, so it is unsuitable for this multiline statement.
The primary-key table uses bound lookup, atomic value/timestamp UPSERT, and delete statements.
Each read creates a new `withSession('first-primary')` session. Runtime writes keep JSON and
millisecond `lastModified` together. OpenNext `delete(key)` removes only the current build's
ISR/SSG `.cache` entry; fetch and composable entries remain independent. There is no old-build
or alternate-store fallback.

Values must serialize to JSON objects and fit within 1,048,576 UTF-8 bytes. Invalid input,
malformed stored JSON, invalid stored timestamps, missing bindings, storage failures and
quota errors reject with `D1CacheError` and a static code/message. Raw SQL, payloads and
exception causes are not logged or attached. Only a real absent row returns `null`.
The schema also bounds keys and JSON, keeping a row comfortably below the official
[2,000,000-byte D1 row limit](https://developers.cloudflare.com/d1/platform/limits/).
The earlier immutable build had 100 cache files / 9,398,868 bytes / maximum 166,710 bytes;
that sizing sample does not establish that every future payload fits this adapter.

Run `node --test scripts/cloudflare/free-cache.checks.mjs` with the locked dependencies.
The canonical `npm run test:cloudflare` glob includes these checks. They start real Miniflare
D1 with `cf: false`, telemetry disabled, isolated local persistence and default-denied outbound.
No private preview build, Wrangler configuration, credential files, or account is needed.
The checks guard against credential configuration reads and prove schema/index use,
read/update/delete, restart persistence, type/build/key isolation, concurrent atomic writes,
UTF-8 limits, corrupt JSON, missing bindings and the lazy OpenNext wrapper.

Daily row-read/row-write quota and storage errors are **injected around a real D1 binding**.
Those cases prove rejection, unchanged stored data, no fallback and no raw error logging.
They do not consume real account quotas or prove that any account is on the Free plan.
The official [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and
[Free-limit enforcement changelog](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)
describe query rejection at Free daily limits. Actual plan/binding/account evidence is still
required by task 7.3 before task 7.5 may perform a remote operation. Native local success is
not evidence of Free request CPU compliance, remote performance, or zero billing on Paid.

Task-local RED, flag-ON GREEN and flag-removed verification output is stored privately under
ignored `.wrangler/task-7.1/`. No feature flag remains in the final cache implementation.
