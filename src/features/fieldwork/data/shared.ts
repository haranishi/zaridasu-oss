// REQ-330: 調査計画と希少種のデータ層で共通に使う部品。

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database.types'

export type FieldworkClient = SupabaseClient<Database>

export type FieldworkTables = Database['public']['Tables']

/**
 * UPDATE / DELETE は RLS で拒否されても「0 行の成功」として返る。`.select(...)` で返ってきた行を見て、
 * 0 行なら投げる（src/lib/data/private-spots.ts と同じ約束）。
 */
export function assertAffected(rows: readonly unknown[] | null, what: string): void {
  if (!rows || rows.length === 0) {
    throw new Error(`${what}権限がないか、対象が既に存在しません (RLS deny or not found)`)
  }
}

/** PostgreSQL の一意制約違反（23505）。送信待ちの再送で「もう入っている」ことを見分けるのに使う。 */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'
}
