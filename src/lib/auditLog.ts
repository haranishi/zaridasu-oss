import { supabase } from './supabase/client'
import { logError } from '@/lib/errorHandler'
import type { Json } from '@/types/database.types'

/**
 * 管理者操作を audit_logs テーブルに記録する。
 * 書き込み失敗は操作をブロックしない（fire-and-forget）。
 */
export interface AuditLogParams {
  adminId: string
  // REQ-149: login_success / login_failed を追加（実際の書き込みは admin_login_record RPC が行う）
  action: 'delete_post' | 'delete_comment' | 'resolve_report' | 'grant_admin' | 'revoke_admin' | 'toggle_official' | 'approve_post' | 'reject_post' | 'login_success' | 'login_failed'
  targetType: 'post' | 'comment' | 'report' | 'user'
  targetId: string
  // REQ-246: audit_logs.details（jsonb）の Insert 型に合わせて Json で受ける（呼び出し側は素直な JSON オブジェクトのみ渡す）。
  details?: Json
}

export async function writeAuditLog({ adminId, action, targetType, targetId, details = {} }: AuditLogParams): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert({
    admin_id: adminId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  })
  if (error) {
    logError(error, 'auditLog:write')
  }
}
