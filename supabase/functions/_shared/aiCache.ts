// REQ-078 Phase 3: Gemini Context Caching の cache_id を取得・作成・refresh する共通ロジック。
// フィーチャーフラグ GEMINI_CACHE_ENABLED=true のときのみ動作。
// Cache miss / API エラー時は null を返し、呼び出し側はフォールバックで通常推論を行う。

// deno-lint-ignore no-explicit-any
type SupabaseLike = any

const CACHE_ENABLED = (Deno.env.get('GEMINI_CACHE_ENABLED') ?? 'false') === 'true'
const CACHE_TTL_SECONDS = Number(Deno.env.get('GEMINI_CACHE_TTL_SECONDS') ?? '3600')
const REFRESH_MARGIN_SECONDS = Number(Deno.env.get('GEMINI_CACHE_REFRESH_MARGIN_SECONDS') ?? '300')

export interface CacheLookupResult {
  cacheId: string | null
  status: 'hit' | 'miss' | 'refresh' | 'error' | 'disabled'
}

interface CacheRow {
  cache_id: string
  expires_at: string
}

export async function getOrCreateCache(
  supabase: SupabaseLike,
  functionName: 'analyze-audio' | 'analyze-image',
  model: string,
  apiKey: string,
  buildSystemContent: () => Record<string, unknown>,
): Promise<CacheLookupResult> {
  if (!CACHE_ENABLED) return { cacheId: null, status: 'disabled' }

  try {
    const { data } = await supabase
      .from('ai_cache_registry')
      .select('cache_id, expires_at')
      .eq('function_name', functionName)
      .eq('model', model)
      .maybeSingle()

    const row = data as CacheRow | null
    const now = Date.now()

    // 有効期限まで十分余裕がある場合は hit
    if (row?.cache_id && row.expires_at) {
      const expiresAt = new Date(row.expires_at).getTime()
      const remaining = (expiresAt - now) / 1000
      if (remaining > REFRESH_MARGIN_SECONDS) {
        return { cacheId: row.cache_id, status: 'hit' }
      }
      // 余裕なし → refresh（失敗時は旧 cache_id をそのまま返して次回に託す）
      const fresh = await createCachedContent(model, apiKey, buildSystemContent()).catch(() => null)
      if (fresh) {
        await upsertCache(supabase, functionName, model, fresh)
        return { cacheId: fresh.cacheId, status: 'refresh' }
      }
      return { cacheId: row.cache_id, status: 'hit' }
    }

    // レジストリに無い → 新規作成
    const created = await createCachedContent(model, apiKey, buildSystemContent()).catch(() => null)
    if (!created) return { cacheId: null, status: 'miss' }
    await upsertCache(supabase, functionName, model, created)
    return { cacheId: created.cacheId, status: 'miss' }
  } catch (e) {
    console.warn('[ai_cache] lookup/create failed:', e)
    return { cacheId: null, status: 'error' }
  }
}

interface CreatedCache {
  cacheId: string
  expiresAt: string
  tokenCount?: number
}

async function createCachedContent(
  model: string,
  apiKey: string,
  systemContent: Record<string, unknown>,
): Promise<CreatedCache | null> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`
  const body = {
    model: `models/${model}`,
    ttl: `${CACHE_TTL_SECONDS}s`,
    ...systemContent,
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.warn(`[ai_cache] create ${res.status}: ${text.slice(0, 200)}`)
    return null
  }
  const data = await res.json() as {
    name?: string
    expireTime?: string
    usageMetadata?: { totalTokenCount?: number }
  }
  if (!data.name || !data.expireTime) return null
  return {
    cacheId: data.name,
    expiresAt: data.expireTime,
    tokenCount: data.usageMetadata?.totalTokenCount,
  }
}

async function upsertCache(
  supabase: SupabaseLike,
  functionName: string,
  model: string,
  cache: CreatedCache,
): Promise<void> {
  await supabase.from('ai_cache_registry').upsert(
    {
      function_name: functionName,
      model,
      cache_id: cache.cacheId,
      expires_at: cache.expiresAt,
      token_count: cache.tokenCount ?? null,
    },
    { onConflict: 'function_name,model' },
  )
}
