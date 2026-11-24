/**
 * _shared/supabaseAdmin.ts — service-role（RLS を迂回する管理者権限）クライアントの単一生成点
 *
 * REQ-287 FR-287-01。
 *
 * 背景:
 *   以前は 14 本の Edge Function がそれぞれ
 *     createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
 *   をインラインで呼んでいた。キーを差し替えるたびに 14 箇所を書き換える必要があり、
 *   2026-07-28 に発覚した service_role キーの露出（ダッシュボード由来トリガーへの
 *   リテラル埋め込み）を機に、生成点を 1 箇所へ集約する。
 *
 * キーの選択順（新方式キーへの段階移行）:
 *   1. SUPABASE_SECRET_KEY        … 新方式（sb_secret_…）。今後こちらへ寄せる。
 *   2. SUPABASE_SERVICE_ROLE_KEY  … レガシー JWT 方式。後方互換のフォールバック。
 *
 *   移行が完了し（Function Secrets に SUPABASE_SECRET_KEY を登録し、Vault も差し替え、
 *   全経路の疎通を確認したら）、REQ-287 FR-287-05 でフォールバックを削除する。
 *
 * 注意:
 *   - anon / publishable キーをここに混ぜないこと。呼び出し元ユーザーの検証に anon が要る
 *     関数（notify-comment）は、別途 anon クライアントを自前で生成する（仕様・REQ-024 系）。
 *   - 返すクライアントは RLS を迂回する。呼び出し元の権限確認は各関数の責務。
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Supabase プロジェクト URL（Edge Function ランタイムが自動設定）。 */
export function getSupabaseUrl(): string {
  const url = Deno.env.get('SUPABASE_URL')
  if (!url) throw new Error('[supabaseAdmin] SUPABASE_URL が未設定です')
  return url
}

/**
 * service-role 相当のキーを返す。
 * 新方式 SUPABASE_SECRET_KEY を優先し、未設定ならレガシー SUPABASE_SERVICE_ROLE_KEY を使う。
 */
export function getServiceRoleKey(): string {
  const secret = Deno.env.get('SUPABASE_SECRET_KEY')
  if (secret) return secret
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  throw new Error(
    '[supabaseAdmin] SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY のいずれも未設定です',
  )
}

/** 現在どちらのキーが使われているか（ログ・診断用。実値は返さない）。 */
export function getServiceRoleKeySource(): 'secret' | 'legacy' | 'none' {
  if (Deno.env.get('SUPABASE_SECRET_KEY')) return 'secret'
  if (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return 'legacy'
  return 'none'
}

/** service-role の Supabase クライアントを生成する（RLS を迂回する）。 */
export function createServiceClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getServiceRoleKey())
}
