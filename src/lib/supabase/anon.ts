import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

/**
 * REQ-186: cookies() 非依存の anon Supabase クライアント。
 *
 * `@/lib/supabase/server` の `createClient` は `await cookies()` を呼ぶため Next.js App Router で
 * Dynamic API 使用と判定され、読み取り専用ルートの `export const revalidate`(ISR) を無効化して
 * しまう（ルートが毎リクエスト動的化する）。RLS で anon(未ログイン)に公開された読み取り専用
 * データのみを扱うルート（sitemap / area 一覧・詳細 / request 詳細メタ / lp 実績数値）では、
 * cookie を一切読まないこのクライアントを使うことで `revalidate` を実効化し ISR を成立させる。
 *
 * 認証セッションが必要なルート（ユーザー固有データ・書き込み）は従来どおり
 * `@/lib/supabase/server` の `createClient`（cookie 依存）を使うこと（REQ-186 FR-186-07）。
 *
 * NFR-186-01: anon 化後も RLS が真の防衛線。非公開データ（未承認投稿・非公開プロフィール等）は
 * anon ロールでは読めないため、公開データのみが配信される。
 *
 * env 未設定（誤設定）時は `null` を返す。呼び出し側は `lp/page.tsx` 同様に fail-open
 * （取得をスキップして描画自体は成功させる）で扱うこと（FR-186-01）。
 */
export function createAnonClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  // REQ-246: Database 型ジェネリックを配線し、公開読み取りルートでも DB 境界の型を復元する。
  return createSupabaseClient<Database>(url, anonKey)
}
