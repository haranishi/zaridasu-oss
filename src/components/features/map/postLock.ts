/**
 * REQ-330（2 周目の点検 C6）: ピンの吹き出しの「ここで投稿」も、希少種の保護を通す。
 * その位置の近く（300 m）に自分の希少種の記録があれば true（投稿の位置を非公開に固定する）。
 * 圏外・確かめられないときも true（伏せる側に倒す）。
 * 調査機能の部品は呼ばれたときだけ読む（地図のチャンクを重くしない）。
 */
export async function mustLockPostAt(userId: string, pos: { lat: number; lng: number }): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  try {
    const [{ hasOwnRareNear }, { supabase }] = await Promise.all([
      import('@/features/fieldwork/data/rareSightings'),
      import('@/lib/supabase/client'),
    ])
    return await hasOwnRareNear(supabase, userId, pos)
  } catch {
    return true
  }
}
