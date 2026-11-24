import { supabase } from '@/lib/supabase/client'
import { trackEvent } from '@/lib/analytics'
import { ONBOARDING_COMPLETED_EVENT, isRegion, isSeen, type OnboardingMode, type Region, type Seen } from './index'

export const ONBOARDING_SAVE_TIMEOUT_MS = 10_000

/** 本人IDは認証から取得する。失敗は呼び出し元へ伝播し、再試行・あとでの判断に使う。 */
export async function completeOnboarding({ region, seen, mode = 'required' }: {
  region: Region
  seen: Seen
  mode?: OnboardingMode
}): Promise<void> {
  if (!isRegion(region) || !isSeen(seen)) throw new Error('Invalid onboarding answers')
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true
        reject(new Error('onboarding_save_timeout'))
      }, ONBOARDING_SAVE_TIMEOUT_MS)
    })
    const save = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (timedOut) throw new Error('onboarding_save_timeout')
      if (authError) throw authError
      if (!user) throw new Error('Authentication required')

      const { error } = await supabase.from('user_onboarding').upsert({
        user_id: user.id,
        region,
        seen_crayfish: seen,
      }, { onConflict: 'user_id' })
      if (error) throw error
      return user
    }
    const user = await Promise.race([save(), timeout])
    trackEvent('onboarding_completed', { mode, region, seen })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(ONBOARDING_COMPLETED_EVENT, { detail: { userId: user.id, region } }))
    }
  } finally {
    clearTimeout(timer)
  }
}
