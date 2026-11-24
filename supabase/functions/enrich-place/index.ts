/**
 * enrich-place Edge Function — REQ-231
 *
 * 投稿の lat/lng から字レベル地名・近傍水系名・水辺フラグ（+任意で標高）を
 * サーバー側で逆ジオコーディングして付与し、posts へ書き戻す。
 *
 * 起動経路（FR-231-03）:
 *   posts INSERT → DB トリガー private.trigger_enrich_place → pg_net → 本関数（非同期）。
 *   AI 解析（analyze-image）と同じ「INSERT トリガー → pg_net → Edge Function」パターン。
 *
 * Nominatim 利用規約の順守（NFR-231-01 / AC-03）はここ + _shared/geocodeProvider に集約:
 *   (a) 全体 1req/秒スロットリング（_shared/geocodeThrottle）
 *   (b) 識別可能 User-Agent（連絡先付き。_shared/geocodeProvider.getUserAgent）
 *   (c) geo_cache による DB 永続キャッシュ（同一グリッドは外部 API を再コールしない）
 *   (d) bulk バックフィルを公開サーバで無制限に走らせる経路は設けない
 *
 * フェイルセーフ（NFR-231-04 / AC-02）:
 *   付与失敗・タイムアウト・kill switch でも投稿は成立。列は NULL のまま、後から再付与可。
 *
 * 【必要な環境変数（Supabase Dashboard → Settings → Edge Functions → Secrets）】
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY : 自動設定
 *   GEOCODE_CONTACT_EMAIL : Nominatim 用 UA に差す連絡先（規約上 推奨。実値はコミットしない）
 *   GEOCODE_PROVIDER      : nominatim（既定）/ opencage / geoapify
 *   OPENCAGE_API_KEY / GEOAPIFY_API_KEY : 商用/高頻度フォールバック用（任意）
 *   GEO_ENRICH_ENABLED    : 'false' で付与を即停止（kill switch / AC-07）
 *   GEO_WATER_ENABLED     : 'true' で OnWater（水辺フラグ）を取得（既定 OFF）
 *   GEO_ELEVATION_ENABLED : 'true' で Open Topo Data（標高）を取得（既定 OFF・CORS 不可のためサーバー側のみ）
 *   WEBHOOK_SECRET        : webhook 共有秘密（未設定なら grace period）
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireWebhookSecret, WebhookAuthError } from '../_shared/webhookAuth.ts'
import {
  fetchElevation,
  fetchIsOnWater,
  type GeoSource,
  isEnrichEnabled,
  makeGridKey,
  reverseGeocode,
} from '../_shared/geocodeProvider.ts'
import { createServiceClient } from '../_shared/supabaseAdmin.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

const CACHE_TTL_DAYS = Number(Deno.env.get('GEO_CACHE_TTL_DAYS') ?? '365')

interface EnrichResult {
  locality: string | null
  water_body: string | null
  is_on_water: boolean | null
  elevation_m: number | null
  geo_source: GeoSource | null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // webhook 共有秘密（pg_net 起動経路）。未設定なら grace period（webhookAuth）。
    try {
      requireWebhookSecret(req)
    } catch (e) {
      if (e instanceof WebhookAuthError) {
        console.warn('[enrich-place] webhook secret mismatch')
        return json({ error: 'unauthorized' }, 401)
      }
      throw e
    }

    // kill switch（AC-07 / NFR-231-02(c)）。停止中は何もしない（投稿は成立済み）。
    if (!isEnrichEnabled()) {
      return json({ skipped: 'enrich_disabled' })
    }

    const payload = await req.json().catch(() => ({}))
    // DB Webhook は { record } 形式。直接呼び出しの { id, lat, lng } も許容。
    const record = (payload.record ?? payload) as {
      id?: string
      lat?: number | string
      lng?: number | string
    }

    const id = record?.id
    const lat = typeof record?.lat === 'string' ? Number(record.lat) : record?.lat
    const lng = typeof record?.lng === 'string' ? Number(record.lng) : record?.lng

    if (!id || typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return json({ skipped: 'no_coords' })
    }

    const supabase = createServiceClient()

    // 冪等スキップ（FR-231-03 / AC-02）: 既に付与済みなら再付与しない（二重 webhook 配信対策）。
    const { data: current } = await supabase
      .from('posts')
      .select('geo_enriched_at')
      .eq('id', id)
      .maybeSingle()
    if (current?.geo_enriched_at) {
      return json({ skipped: 'already_enriched' })
    }

    const gridKey = makeGridKey(lat, lng)

    // ── DB 永続キャッシュ参照（AC-03(c)）: 同一グリッドは外部 API を再コールしない ──
    let result: EnrichResult | null = null
    const { data: cached } = await supabase
      .from('geo_cache')
      .select('locality, water_body, is_on_water, elevation_m, geo_source, fetched_at')
      .eq('grid_key', gridKey)
      .maybeSingle()

    const cacheFresh =
      cached?.fetched_at &&
      Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_DAYS * 86400_000

    if (cached && cacheFresh) {
      result = {
        locality: cached.locality ?? null,
        water_body: cached.water_body ?? null,
        is_on_water: cached.is_on_water ?? null,
        elevation_m: cached.elevation_m ?? null,
        geo_source: 'cache',
      }
    } else {
      // ── 外部 API で取得（throttle + timeout + retry は provider 側）──
      const place = await reverseGeocode(lat, lng)
      // 水辺・標高は任意（既定 OFF）。有効時のみ追加で取得。
      const [isOnWater, elevation] = await Promise.all([
        fetchIsOnWater(lat, lng),
        fetchElevation(lat, lng),
      ])

      result = {
        locality: place?.locality ?? null,
        water_body: place?.water_body ?? null,
        is_on_water: isOnWater,
        elevation_m: elevation,
        geo_source: place?.geo_source ?? null,
      }

      // 何かしら取得できた場合のみキャッシュに保存（全 NULL はキャッシュしない＝次回再試行を許す）。
      const gotSomething =
        result.locality !== null ||
        result.water_body !== null ||
        result.is_on_water !== null ||
        result.elevation_m !== null
      if (gotSomething) {
        await supabase
          .from('geo_cache')
          .upsert(
            {
              grid_key: gridKey,
              lat: Number(lat.toFixed(3)),
              lng: Number(lng.toFixed(3)),
              locality: result.locality,
              water_body: result.water_body,
              is_on_water: result.is_on_water,
              elevation_m: result.elevation_m,
              geo_source: result.geo_source,
              fetched_at: new Date().toISOString(),
            },
            { onConflict: 'grid_key' },
          )
          .then(undefined, (e: unknown) => console.warn('[enrich-place] geo_cache upsert failed:', e))
      }
    }

    // ── posts へ書き戻し（service_role。protect_post_status は service_role を素通り）──
    // 取得できた値が全て NULL でも geo_enriched_at は打つ（再起動の無限ループを避ける）。
    const { error: updErr } = await supabase
      .from('posts')
      .update({
        locality: result.locality,
        water_body: result.water_body,
        is_on_water: result.is_on_water,
        elevation_m: result.elevation_m,
        geo_source: result.geo_source,
        geo_enriched_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updErr) throw updErr

    console.log(
      `[enrich-place] post ${id} → locality=${result.locality}, water=${result.water_body}, on_water=${result.is_on_water}, elev=${result.elevation_m}, source=${result.geo_source}`,
    )

    return json({
      enriched: true,
      locality: result.locality,
      water_body: result.water_body,
      is_on_water: result.is_on_water,
      elevation_m: result.elevation_m,
      geo_source: result.geo_source,
    })
  } catch (e) {
    // fail-open: 付与失敗でも投稿は成立済み。500 を返しても posts は壊れない。
    console.error('[enrich-place] エラー:', e)
    return json({ error: String(e) }, 500)
  }
}

if (import.meta.main) {
  serve(handleRequest)
}
