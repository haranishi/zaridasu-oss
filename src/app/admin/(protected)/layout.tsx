import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * REQ-245 FR-245-04（多層防御 / defense-in-depth）: admin の**保護ルート**にサーバー側の認可ゲートを置く。
 *
 * これまで /admin 配下の認可は middleware（src/middleware.ts の matcher）単独に依存していた。
 * ここでサーバーコンポーネント側でも `getUser()`（JWT を Auth サーバーで再検証・Cookie 改ざん耐性）＋
 * role 検証を行い、middleware を無効化/迂回しても未認可ユーザーには保護ページの内容を一切描画しない
 * （AC-04）。middleware・RLS はそのまま維持し、これは追加の防衛線（既存機能は弱めない）。
 *
 * 重要: /admin/login は本ルートグループ `(protected)` の**外**にあるため、このゲートを通らない。
 *   ログインフォームは未認証ユーザーに引き続き到達可能（鶏と卵の回避）。/admin/login への redirect も
 *   ループしない（login はゲート対象外）。
 *
 * fail-closed: middleware（REQ-137）と同じく「error が無く user が取れた」時だけ認証済みとみなす。
 *   getUser() は Supabase 到達不可時に throw せず error を返すことがあるため、error 有り or user 無しは
 *   /admin/login へ、認証済みだが非 admin は / へ（middleware の挙動と一致）。
 *
 * `createClient()`（await cookies()）を使うため本ルートは動的レンダリングになる（admin は非公開・
 * SEO/ISR 不要のため問題なし）。
 */
export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  const user = data?.user

  if (error || !user) redirect('/admin/login')
  if (user.app_metadata?.role !== 'admin') redirect('/')

  return <>{children}</>
}
