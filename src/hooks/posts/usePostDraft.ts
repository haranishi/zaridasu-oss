import { useEffect } from 'react'
import type { PostFormData } from '@/types'

// 投稿フォームの下書き（入力中の内容）を端末に自動保存する。
//
// 保存先は利用者ごとに分ける（REQ-330 の点検で見つかった穴）。以前は 1 つのキー `zaridasu_draft_post` を
// 全員で共有していたため、同じ端末で次にログインした人のフォームに前の人の位置や文が出ていた。
// ログアウトしたら clearDraftsOnSignOut で消す。古い共有のキーは持ち主が分からないので、読まずに消す。
// 地点（調査計画・ピン・非公開スポット）から開いたフォームは下書きを読まず書かない（PostForm 側で enabled=false）。
// 希少種の近くの地点の座標や、非公開を固定した状態を端末に残さないため。

const DRAFT_KEY_PREFIX = 'zaridasu_draft_post:'
/** 利用者で分ける前のキー。持ち主が分からないので、見つけたら消す。 */
const LEGACY_DRAFT_KEY = 'zaridasu_draft_post'
const DEBOUNCE_MS = 500

export function draftKey(userId: string | null | undefined): string {
  return `${DRAFT_KEY_PREFIX}${userId ?? 'anon'}`
}

function dropLegacy(): void {
  try {
    localStorage.removeItem(LEGACY_DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

/** 投稿フォームの入力内容を500msデバウンスでlocalStorageに自動保存する（enabled=false なら何もしない） */
export function usePostDraft(fields: Partial<PostFormData>, userId: string | null | undefined, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(userId), JSON.stringify(fields))
      } catch {
        /* localStorage 使用不可の場合は無視 */
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [fields, userId, enabled])
}

/** 保存済み草稿を読み込む。存在しない場合は null を返す */
export function loadDraft(userId: string | null | undefined): Partial<PostFormData> | null {
  dropLegacy()
  try {
    const raw = localStorage.getItem(draftKey(userId))
    return raw ? (JSON.parse(raw) as Partial<PostFormData>) : null
  } catch {
    return null
  }
}

/** 保存済み草稿を削除する */
export function clearDraft(userId: string | null | undefined): void {
  try {
    localStorage.removeItem(draftKey(userId))
  } catch {
    /* ignore */
  }
}

/** ログアウト・退会のとき: その人の下書きと、持ち主の分からない古い下書き・未ログインの下書きを消す。 */
export function clearDraftsOnSignOut(userId: string | null | undefined): void {
  clearDraft(userId)
  clearDraft(null)
  dropLegacy()
}
