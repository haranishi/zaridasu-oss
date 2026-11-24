'use client'

// REQ-330: ログアウトに失敗した（トークンが切れたまま圏外にいて、セッションが残った）ことを通知で知らせる。
// AuthContext が失敗したときだけ読み込む。AuthContext から通知の部品（ToastContext → Toast）を静的に読むと、
// 全ページの共通部分のチャンクの分け方が変わり、ホームのページの JS が予算（10 kB）を超えるため（2026-10-02 実測）。

import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useToastContext } from '@/context/ToastContext'

export default function SignOutFailedNotice({ nonce, onShown }: { nonce: number; onShown: () => void }) {
  const toast = useToastContext()
  const { t } = useTranslation()
  // 失敗 1 回につき通知は 1 回（開発時の StrictMode で effect が 2 回走っても二重に出さない）
  const shown = useRef<number | null>(null)
  useEffect(() => {
    if (shown.current === nonce) return
    shown.current = nonce
    toast.error(t('auth.signOutFailed'))
    onShown()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce])
  return null
}
