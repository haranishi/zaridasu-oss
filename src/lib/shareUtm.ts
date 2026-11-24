/**
 * REQ-236 (FR-236-03): シェア URL に UTM を付与する共通ユーティリティ。
 *
 * 既存の流入計測（REQ-182 の `from=lp`＋UTM）と整合させ、投稿シェア経由の流入を
 * GA4 で `utm_source` / `utm_medium` / `utm_campaign` 別に帰属できるようにする。
 *
 * 方針:
 *   - 正規 URL（origin）は SSR-safe な `getRuntimeOrigin()`（client では window.origin、
 *     SSR では BASE_URL）を基点にする。`window.location.href` を直接使わない
 *     （クエリ/ハッシュの取りこぼし・既存 UTM の二重付与を避ける）。
 *   - 既に同名の UTM が付いている場合は上書きする（決め打ちの campaign に正規化）。
 *   - PII は載せない（投稿 ID は非 PII なので content として許容するが、本関数は URL のみ扱う）。
 */
import type { AcquisitionSource } from '@/lib/acquisition'
import { getRuntimeOrigin } from '@/lib/constants'

/** シェア経路（GA4 の utm_source / イベント method と一致させる）。 */
export type ShareMethod = 'x' | 'line' | 'web_share' | 'copy'

export interface BuildShareUrlOptions {
  /** シェア経路。utm_source に入る。 */
  method: ShareMethod
  /**
   * 共有対象の相対パス（例 `/post/<id>`）または絶対 URL。
   * 省略時は現在ページ（client のみ。SSR では origin ルート）を使う。
   */
  path?: string
  /** utm_campaign（既定 `post_share`）。 */
  campaign?: string
  /**
   * utm_content（REQ-289 FR-289-01）。クリエイティブ／投稿単位の識別子。
   * 未指定なら付与しない（既存の呼び出し元の出力を変えないため）。
   * PII を入れないこと（NFR-289-02）。
   */
  content?: string
}

const UTM_MEDIUM = 'social'
const DEFAULT_CAMPAIGN = 'post_share'
/** 外部施策の utm_medium。アプリ内シェア（social）と区別する。 */
const CAMPAIGN_MEDIUM = 'campaign'

/**
 * UTM 付きの正規シェア URL を生成する。
 * 非対応・例外時も決して throw せず、最低限のフォールバック URL を返す（NFR-236-03）。
 */
export function buildShareUrl({
  method,
  path,
  campaign = DEFAULT_CAMPAIGN,
  content,
}: BuildShareUrlOptions): string {
  const origin = getRuntimeOrigin()
  try {
    // path が絶対 URL ならそのまま、相対パスなら origin と結合、未指定なら現在 URL（client）。
    let base: URL
    if (path) {
      base = new URL(path, origin)
    } else if (typeof window !== 'undefined') {
      base = new URL(window.location.href)
    } else {
      base = new URL(origin)
    }
    base.searchParams.set('utm_source', method)
    base.searchParams.set('utm_medium', UTM_MEDIUM)
    base.searchParams.set('utm_campaign', campaign)
    if (content) base.searchParams.set('utm_content', content)
    return base.toString()
  } catch {
    // URL 構築に失敗しても呼び出し元（シェア導線）を止めない。
    const sep = '?'
    const safePath = path ?? '/'
    const contentParam = content ? `&utm_content=${encodeURIComponent(content)}` : ''
    return `${origin}${safePath.startsWith('/') ? safePath : `/${safePath}`}${sep}utm_source=${encodeURIComponent(method)}&utm_medium=${UTM_MEDIUM}&utm_campaign=${encodeURIComponent(campaign)}${contentParam}`
  }
}

/** 外部施策の媒体。GA4 の utm_source と一致させる。 */
export type CampaignMedium =
  | 'instagram'
  | 'x'
  | 'game'
  | 'flyer'
  | 'meishi'
  | 'univ'
  | 'note'

export interface BuildCampaignUrlOptions {
  /** utm_source（媒体）。 */
  medium: CampaignMedium
  /** `?from=` に入る流入元。台帳（acquisition.ts）の値のみ許可する。 */
  from: AcquisitionSource
  /** utm_campaign（施策名）。例 `deadline_list_2026q3`。 */
  campaign: string
  /** utm_content（クリエイティブ／投稿単位）。**施策開始前に必ず決めること**。 */
  content?: string
  /** 着地パス（既定 `/`）。`/lp` など。 */
  path?: string
  /** サインアップモーダルを自動で開くか（既定 true。LP CTA と同じ挙動）。 */
  openSignup?: boolean
}

/**
 * 外部施策（IG・チラシQR・名刺・ゲーム送客など）用の計測 URL を生成する（REQ-289 FR-289-02）。
 *
 * `buildShareUrl` はアプリ内のシェア導線専用で、外部施策の URL を組む手段が無かった。
 * 手作業で URL を組むと表記ゆれとパラメータ漏れが必ず起きるため、ここへ集約する。
 *
 * 例:
 *   buildCampaignUrl({ medium: 'instagram', from: 'ig_story', campaign: 'deadline_list', content: '2026-08-02_a' })
 *   → https://zaridasu.com/?auth=signup&from=ig_story&utm_source=instagram&utm_medium=campaign&utm_campaign=deadline_list&utm_content=2026-08-02_a
 */
export function buildCampaignUrl({
  medium,
  from,
  campaign,
  content,
  path = '/',
  openSignup = true,
}: BuildCampaignUrlOptions): string {
  const origin = getRuntimeOrigin()
  try {
    const url = new URL(path, origin)
    if (openSignup) url.searchParams.set('auth', 'signup')
    url.searchParams.set('from', from)
    url.searchParams.set('utm_source', medium)
    url.searchParams.set('utm_medium', CAMPAIGN_MEDIUM)
    url.searchParams.set('utm_campaign', campaign)
    if (content) url.searchParams.set('utm_content', content)
    return url.toString()
  } catch {
    return origin
  }
}
