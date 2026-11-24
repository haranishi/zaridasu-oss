import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

// REQ-246: Database 型ジェネリックを配線し、DB 読み取り/書き込みの型を復元する
// （`.from(x)`/`.rpc(y)` の列・引数がコンパイル時に検証されるようになる）。
let _client: SupabaseClient<Database> | null = null

/**
 * Browser 用 Supabase クライアントを取得する（singleton）。
 * 初回呼び出し時のみ `createBrowserClient` を実行し、以降はキャッシュを返す。
 */
export function createClient(): SupabaseClient<Database> {
  if (_client) return _client

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      '環境変数 NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください。'
    )
  }

  // REQ-246: @supabase/ssr と @supabase/supabase-js がそれぞれ内包する SupabaseClient 型は
  // 版差でジェネリック arity がズレ（"public" スキーマ引数の重複等）、型 identity が一致しない。
  // 返り値を top-level の SupabaseClient<Database> に橋渡しキャストすることで、アプリ全体の
  // `.from`/`.rpc` 引数推論を単一の型に揃える（ReturnType 推論だと Args が undefined に潰れる）。
  _client = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey) as unknown as SupabaseClient<Database>
  return _client
}

/**
 * Lazy 初期化された Supabase クライアントの Proxy。
 * `import { supabase }` で使うことで、モジュール評価時に環境変数アクセスを発生させない。
 */
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  // REQ-155: as unknown as Record<...> による型握り潰しを排し、Reflect.get で委譲する。
  // receiver は渡さない（getter が proxy ではなく実クライアントを this として走るようにするため）。
  get(_target, prop) {
    return Reflect.get(createClient(), prop)
  },
})
