/**
 * Sentry PII スクラブ共通関数（REQ-211）
 *
 * Sentry へ送るイベント／トランザクションから個人情報(PII)を送信前に除去する。
 * クライアント (`instrumentation-client.ts`) で一次スクラブ、サーバー/エッジ
 * (`sentry.server.config.ts` / `sentry.edge.config.ts`) で二次スクラブし、さらに
 * Sentry サーバー側 Data Scrubbing（`docs/security/sentry-data-scrubbing.md`）で
 * 三次スクラブする多層防御の SDK 側レイヤを担う。
 *
 * 方針（FR-211-02）:
 *  - 文字列中の メール / IPv4 / IPv6 / JWT / Bearer / apikey を `[REDACTED]` に置換する
 *    （`supabase/functions/_shared/aiLogging.ts` の redact 方針と整合し、メール・IP を追加）。
 *  - `event.user`（email / ip_address / username / geo）をクリアする。
 *  - `event.request` の cookies / 機微ヘッダ / query_string / data を除去する。
 *  - 例外値・message・logentry・breadcrumbs・extra・contexts・tags の値を再帰スクラブし、
 *    機微キー（email / reporter_ip / ip / token / authorization 等）は値ごと `[REDACTED]` にする。
 *
 * 非機能（NFR-211-01 / 04）:
 *  - 純粋関数。`event` が部分的（exception 無し・request 無し・user 無し等）でも例外を投げない。
 *  - 正規表現は ReDoS を招かない形（バックトラッキング爆発を避ける）にし、長大文字列でも線形で処理する。
 *  - スタックトレースのファイル/行・エラー型・`context` タグ等の非 PII は保持する（NFR-211-02）。
 */

import type { Event, init } from '@sentry/nextjs'

/** `Sentry.init` が受け取る収集設定の型。@sentry/nextjs は型名を直接 export しないので引数から取り出す。 */
type DataCollection = NonNullable<Parameters<typeof init>[0]['dataCollection']>
type TraceLifecycle = NonNullable<Parameters<typeof init>[0]['traceLifecycle']>

/**
 * SDK の自動収集をすべて止める設定（FR-211-01。3 ランタイムの `Sentry.init` で共有する）。
 *
 * @sentry/nextjs 11 で `sendDefaultPii` が廃止され `dataCollection` に置き換わった。新しい既定は
 * 「利用者情報・Cookie・ヘッダ・通信の本文・クエリ・ローカル変数をすべて集める」なので、
 * 書かなければ投稿の座標（非公開にした地点を含む）まで外部へ送られうる。
 * `Required<>` で全項目の明記を強制し、SDK に項目が増えたら型検査で気づけるようにしている。
 * `userInfo: false` は IP アドレスの自動付与（ブラウザのセッション・サーバーのリクエスト）も止める。
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  // スタックの前後行はアプリのソースで個人情報を含まない。原因調査に要るので SDK の既定値のまま。
  frameContextLines: 5,
} satisfies Required<DataCollection>

/** FR-211-04: v11 の既定 stream は beforeSendTransaction を無視するため、3 ランタイムで static に固定する。 */
export const SENTRY_TRACE_LIFECYCLE = 'static' satisfies TraceLifecycle

/** スクラブ済みを示す置換トークン。`aiLogging.ts` の `[REDACTED]` と表記を合わせる。 */
const REDACTED = '[REDACTED]'

/**
 * 過大な文字列の取り込みを抑える上限（NFR-211-04）。これを超える文字列は末尾を切り詰める。
 * スタックトレース等の有用性を損なわない程度に余裕を持たせる。
 */
const MAX_STRING_LENGTH = 8192

/** 再帰スクラブの深さ上限。循環や極端にネストした構造での暴走を防ぐ。 */
const MAX_DEPTH = 8

/**
 * 値ごと除去する機微キー名（小文字・正規化後で比較）。
 * 区切り（`_` / `-` / 空白）を除いて部分一致させるため、ここは正規化済みの素片で持つ。
 */
const SENSITIVE_KEY_PARTS = [
  'email',
  'reporterip',
  'requestip',
  'ipaddress',
  'clientip',
  'remoteaddr',
  'xforwardedfor',
  'authorization',
  'cookie',
  'token',
  'apikey',
  'secret',
  'password',
  'passwd',
  'phone',
] as const

/** request.headers から落とす機微ヘッダ名（小文字比較）。 */
const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-forwarded-for',
  'x-real-ip',
  'forwarded',
  'proxy-authorization',
  'x-api-key',
  'apikey',
])

// ── PII 文字列パターン（すべて ReDoS 耐性のある線形マッチ） ──────────────────────

/**
 * メールアドレス。`+`/`*` のネストを避け、各文字クラスを単純な 1 回量化で構成する。
 * ローカル部・ドメイン部とも貪欲な単一文字クラスのみで、壊滅的バックトラッキングは起きない。
 */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

/** IPv4。各オクテットを 1〜3 桁に制限（過剰一致は許容、ReDoS 安全を優先）。 */
const IPV4_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g

/**
 * IPv6（簡易）。`::` 圧縮や hextet を含む形をカバー。`(?:...)` の単純連結のみで、
 * 入れ子量化を避けているためバックトラッキング爆発しない。短すぎる誤検出を防ぐため
 * 区切り `:` を 2 個以上含む並びだけを対象にする。
 */
const IPV6_RE = /\b(?:[A-Fa-f0-9]{1,4}:){2,7}[A-Fa-f0-9]{1,4}\b|\b(?:[A-Fa-f0-9]{1,4}:){1,7}:|::(?:[A-Fa-f0-9]{1,4}:){0,6}[A-Fa-f0-9]{1,4}\b/g

/** JWT（header.payload.signature の 3 セグメント base64url）。各セグメントは単一文字クラスの 1 回量化。 */
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g

/** `Bearer <token>`。`aiLogging.ts` と同方針。 */
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi

/** クエリやログ中の `apikey=...` / `api_key=...` / `key=...` / `token=...`。 */
const KV_SECRET_RE = /\b(?:api[_-]?key|key|token|access[_-]?token|secret|password)=[^\s&"'}]+/gi

/**
 * 1 つの文字列から PII を除去する純粋関数（最終防波堤として呼び出し側でも利用可）。
 * 非文字列はそのまま返す。順序は「構造を持つトークン → 汎用パターン」で、
 * Bearer/JWT/KV を先に潰してから email/IP を当てる。
 */
export function scrubString(value: string): string {
  if (typeof value !== 'string' || value.length === 0) return value
  let s = value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]` : value
  s = s.replace(BEARER_RE, `Bearer ${REDACTED}`)
  s = s.replace(JWT_RE, REDACTED)
  s = s.replace(KV_SECRET_RE, (m) => `${m.slice(0, m.indexOf('=') + 1)}${REDACTED}`)
  s = s.replace(EMAIL_RE, REDACTED)
  s = s.replace(IPV4_RE, REDACTED)
  s = s.replace(IPV6_RE, REDACTED)
  return s
}

/** キー名を区切り無し小文字に正規化する（`reporter_ip` → `reporterip`）。 */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]/g, '')
}

/** 正規化済みキー名が機微キーを部分一致で含むか。 */
function isSensitiveKey(key: string): boolean {
  const k = normalizeKey(key)
  return SENSITIVE_KEY_PARTS.some((part) => k.includes(part))
}

/**
 * 任意の値（オブジェクト / 配列 / 文字列 / プリミティブ）を再帰的にスクラブする。
 * - 機微キーに対応する値は中身を見ずに `[REDACTED]`。
 * - 文字列値は {@link scrubString}。
 * - 深さ上限・非プレーン値・null/undefined を安全に扱う（NFR-211-01）。
 */
function scrubValue(value: unknown, depth: number): unknown {
  if (value == null) return value
  if (typeof value === 'string') return scrubString(value)
  if (typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) return value

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1))
  }

  // プレーンなレコードのみ再帰する。Date/RegExp 等の特殊オブジェクトはそのまま返す。
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return value

  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : scrubValue(val, depth + 1)
  }
  return out
}

/** `event.user` の PII（email / ip_address / username / geo）を除去する。 */
function scrubUser(event: Event): void {
  if (!event.user) return
  // id は識別子だが PII 直結ではないため保持。geo は都市まで含むため落とす。
  const { id } = event.user
  event.user = id != null ? { id } : {}
}

/** `event.request` から cookies / 機微ヘッダ / query_string / data を除去する。 */
function scrubRequest(event: Event): void {
  const req = event.request
  if (!req) return

  if (req.cookies) delete req.cookies
  if (req.query_string != null) req.query_string = REDACTED
  if (req.data != null) req.data = scrubValue(req.data, 0)
  if (typeof req.url === 'string') req.url = scrubString(req.url)

  if (req.headers && typeof req.headers === 'object') {
    const headers = req.headers as Record<string, string>
    for (const name of Object.keys(headers)) {
      if (SENSITIVE_HEADER_NAMES.has(name.toLowerCase())) {
        headers[name] = REDACTED
      } else if (typeof headers[name] === 'string') {
        headers[name] = scrubString(headers[name])
      }
    }
  }
}

/** 例外値・型・スタックフレームの関数名等から PII を除去する（ファイル/行は保持）。 */
function scrubException(event: Event): void {
  const values = event.exception?.values
  if (!values) return
  for (const ex of values) {
    if (typeof ex.value === 'string') ex.value = scrubString(ex.value)
    // stacktrace の frames は filename / lineno / colno（非 PII・デバッグに必須）を保持し、
    // function 名やソース行に紛れ込んだ PII のみ落とす。
    const frames = ex.stacktrace?.frames
    if (frames) {
      for (const f of frames) {
        if (typeof f.function === 'string') f.function = scrubString(f.function)
      }
    }
  }
}

/**
 * breadcrumbs の message / data から PII を除去する。
 * REQ-330: fetch / xhr のパンくずの URL（data.url）からクエリ文字列（? 以降）とフラグメントを落とす。
 * 逆ジオコーディング（lat / lon）や範囲検索（lat=gte.…）の URL には、希少種の記録の近くの座標が入るため。
 */
function scrubBreadcrumbs(event: Event): void {
  const crumbs = event.breadcrumbs
  if (!crumbs) return
  for (const c of crumbs) {
    if (typeof c.message === 'string') c.message = scrubString(c.message)
    if (c.data && typeof c.data === 'object') {
      const data = scrubValue(c.data, 0) as Record<string, unknown>
      if (typeof data.url === 'string') {
        const cut = data.url.search(/[?#]/)
        if (cut >= 0) data.url = data.url.slice(0, cut)
      }
      c.data = data
    }
  }
}

/**
 * Sentry エラーイベントから PII を除去する純粋関数（FR-211-02）。
 * `event` を破壊的に書き換えつつ同じ参照を返す（Sentry の `beforeSend` 契約に合わせる）。
 * いかなる欠損フィールドに対しても例外を投げない（NFR-211-01）。
 */
export function scrubEvent<T extends Event>(event: T): T {
  if (!event || typeof event !== 'object') return event
  try {
    scrubUser(event)
    scrubRequest(event)
    scrubException(event)
    scrubBreadcrumbs(event)

    if (typeof event.message === 'string') event.message = scrubString(event.message)
    if (event.logentry?.message) event.logentry.message = scrubString(event.logentry.message)

    if (event.extra) event.extra = scrubValue(event.extra, 0) as typeof event.extra
    if (event.contexts) event.contexts = scrubValue(event.contexts, 0) as typeof event.contexts

    if (event.tags) {
      for (const [key, val] of Object.entries(event.tags)) {
        if (isSensitiveKey(key)) {
          event.tags[key] = REDACTED
        } else if (typeof val === 'string') {
          event.tags[key] = scrubString(val)
        }
      }
    }
  } catch {
    // 二次例外で監視自体を壊さない（NFR-211-01）。スクラブ失敗時は、
    // 少なくとも user/request の直接 PII を除去できているはずの状態で返す。
  }
  return event
}

/**
 * Sentry トランザクション（パフォーマンス）イベントから PII を除去する（FR-211-04）。
 * トランザクション名 / span 説明 / request からメール・IP・トークンを落とす。
 * `scrubEvent` を土台に span を追加処理する。
 */
export function scrubTransaction<T extends Event>(event: T): T {
  if (!event || typeof event !== 'object') return event
  try {
    if (typeof event.transaction === 'string') {
      event.transaction = scrubString(event.transaction)
    }
    scrubRequest(event)
    scrubBreadcrumbs(event)

    const spans = event.spans
    if (Array.isArray(spans)) {
      for (const span of spans) {
        const s = span as { description?: string; data?: Record<string, unknown> }
        if (typeof s.description === 'string') s.description = scrubString(s.description)
        if (s.data && typeof s.data === 'object') {
          s.data = scrubValue(s.data, 0) as Record<string, unknown>
        }
      }
    }
  } catch {
    // 監視を壊さない（NFR-211-01）
  }
  return event
}
