// REQ-175: フィーチャーフラグ / 実験割付のクライアント側エントリ。
// 割付はサーバー（get_my_experiment_variants RPC・決定的ハッシュ）で確定し、
// クライアントは結果を受け取るだけ。取得失敗・未ログインは control にフォールバック（NFR-175-07）。
import { supabase } from '@/lib/supabase/client'
import { logError } from '@/lib/errorHandler'

export type VariantMap = Record<string, string>

// 実験キー（型安全な参照のための定数）
export const EXPERIMENTS = {
  aiFeedback: 'ai_feedback', // REQ-170
  newRanking: 'new_ranking', // REQ-171
} as const

let variantsPromise: Promise<VariantMap> | null = null

/**
 * 現在ユーザーの全有効実験の割付マップを取得（セッション内で1回だけ RPC）。
 * 失敗時は空マップ（= 全 control）にフォールバックする。
 */
export function getMyExperimentVariants(): Promise<VariantMap> {
  if (!variantsPromise) {
    variantsPromise = (async (): Promise<VariantMap> => {
      try {
        const { data, error } = await supabase.rpc('get_my_experiment_variants')
        if (error || !data || typeof data !== 'object') return {}
        return data as VariantMap
      } catch (e) {
        logError(e instanceof Error ? e : new Error(String(e)), 'getMyExperimentVariants')
        return {}
      }
    })()
  }
  return variantsPromise
}

/** ログイン状態変化時などにキャッシュを破棄して再取得させる。 */
export function resetExperimentCache(): void {
  variantsPromise = null
}
