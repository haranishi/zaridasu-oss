// REQ-079 Phase 4: 同一 hash の過去判定結果を再利用するユーティリティ。
// REQ-129 Phase 1: findImageDedup の戻り値を画像判定スコープに限定し、
//   過去投稿の audio_analysis / combined_decision が新規投稿に混入することを防ぐ。

// deno-lint-ignore no-explicit-any
type SupabaseLike = any

const LOOKBACK_DAYS = Number(Deno.env.get('AI_DEDUP_LOOKBACK_DAYS') ?? '30')
export const DEDUP_ENABLED = (Deno.env.get('AI_DEDUP_ENABLED') ?? 'true') !== 'false'

export type AudioDedupResult =
  | { found: true; analysis: Record<string, unknown>; sourcePostId: string }
  | { found: false }

export type ImageDedupResult =
  | { found: true; analysis: Record<string, unknown>; sourcePostId: string }
  | { found: false }

export async function findAudioDedup(
  supabase: SupabaseLike,
  audioHash: string | null | undefined,
  currentPostId: string,
): Promise<AudioDedupResult> {
  if (!DEDUP_ENABLED || !audioHash) return { found: false }
  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString()
    const { data, error } = await supabase
      .from('posts')
      .select('id, ai_result, ai_analyzed_at')
      .eq('ai_result->>audio_sha256', audioHash)
      .neq('id', currentPostId)
      .gte('ai_analyzed_at', since)
      .not('ai_result->audio_analysis', 'is', null)
      .order('ai_analyzed_at', { ascending: false })
      .limit(1)
    if (error || !data || data.length === 0) return { found: false }
    const row = data[0]
    if (row?.ai_result?.audio_sha256 !== audioHash) return { found: false }
    const analysis = row?.ai_result?.audio_analysis as Record<string, unknown> | undefined
    if (!analysis) return { found: false }
    return { found: true, analysis, sourcePostId: row.id }
  } catch (e) {
    console.warn('[dedup/audio] lookup failed (non-fatal):', e)
    return { found: false }
  }
}

// REQ-129 FR-129-01: 旧形式 (ai_result 直下に detected_species 等が並ぶ形) からも
// 画像判定に関係するフィールドのみを抽出する。`audio_analysis` / `combined_decision` /
// `model` 等の音声・統合判定スコープのフィールドは絶対に含めない。
const IMAGE_FIELDS = [
  'detected_species',
  'species_match',
  'confidence',
  'image_quality',
  'is_appropriate',
  'concerns',
  'notes',
  'per_photo',
  'photo_count',
  'analyzed_count',
  'failed_count',
] as const

function pickImageFields(
  aiResult: Record<string, unknown>,
): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const key of IMAGE_FIELDS) {
    if (aiResult[key] !== undefined) picked[key] = aiResult[key]
  }
  return picked
}

function isEmptyImageAnalysis(analysis: Record<string, unknown>): boolean {
  for (const key of IMAGE_FIELDS) {
    if (analysis[key] !== undefined) return false
  }
  return true
}

export async function findImageDedup(
  supabase: SupabaseLike,
  imageHashes: string[] | null | undefined,
  currentPostId: string,
  claimedSpecies?: string | null,
): Promise<ImageDedupResult> {
  if (!DEDUP_ENABLED || !imageHashes || imageHashes.length === 0) return { found: false }
  // REQ-129 FR-129-03: species 一致条件を防御層として追加。
  // claimedSpecies が空文字や null/undefined の場合は dedup を諦める（誤マッチ防止）。
  if (!claimedSpecies) return { found: false }
  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString()
    // サーバーが保存した実体ハッシュ（ai_result.image_sha256s）のみを検索する。申告値の image_hashes 列は使わない。
    // ⚠ jsonb の包含は filter('cs', JSON 文字列) で書く。`.contains(col, 配列)` は supabase-js が `cs.{a,b}`
    //   （Postgres の配列リテラル）にするため、jsonb 列では 22P02（無効な JSON）になり、検索が毎回失敗する
    //   （実際の PostgREST 14 で確認。失敗は黙って「流用なし」になるので、気づきにくい）。
    const { data, error } = await supabase
      .from('posts')
      .select('id, ai_result, ai_analyzed_at')
      .filter('ai_result->image_sha256s', 'cs', JSON.stringify(imageHashes))
      .eq('species', claimedSpecies)
      .neq('id', currentPostId)
      .gte('ai_analyzed_at', since)
      // REQ-129 FR-129-02: 「画像判定済み」フィルタ。新形式 (image_analysis) または
      // 旧形式 (top-level detected_species) のいずれかを持つレコードのみ採用。
      .or(
        'ai_result->image_analysis.not.is.null,ai_result->detected_species.not.is.null',
      )
      .order('ai_analyzed_at', { ascending: false })
      .limit(5)
    if (error || !data) return { found: false }
    // 配列長・順序まで完全一致するものだけを dedup 対象にする
    const exact = data.find((row: { ai_result?: { image_sha256s?: string[] } }) => {
      const h = row.ai_result?.image_sha256s
      if (!h || h.length !== imageHashes.length) return false
      return h.every((x, i) => x === imageHashes[i])
    })
    if (!exact) return { found: false }
    const aiResult = exact.ai_result as Record<string, unknown> | undefined
    if (!aiResult) return { found: false }

    // REQ-129 FR-129-01: 画像判定スコープに限定して返す。
    // - 新形式: ai_result.image_analysis があればそれを採用
    // - 旧形式: トップレベルから image 関連フィールドのみ抽出
    const nested = aiResult.image_analysis as
      | Record<string, unknown>
      | undefined
    const imageAnalysis = nested ?? pickImageFields(aiResult)
    if (!imageAnalysis || isEmptyImageAnalysis(imageAnalysis)) {
      return { found: false }
    }
    return { found: true, analysis: imageAnalysis, sourcePostId: exact.id }
  } catch (e) {
    console.warn('[dedup/image] lookup failed (non-fatal):', e)
    return { found: false }
  }
}
