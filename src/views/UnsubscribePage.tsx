'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { Loader2, MailX, Check, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

// REQ-234 FR-234-03: 配信停止公開ルート（ログイン不要・トークン検証のみ）。
// メールの List-Unsubscribe / 本文リンクから ?t=<token>&c=<category> で着地する。
// - c が単一カテゴリ（research_adopted / dormant_reengage / weekly_digest）なら、そのカテゴリを停止。
// - 「すべてのお知らせメールを停止」ボタンで c=all を適用できる（取引通知は対象外）。
// トークンは auth.users.id を直載せしない不透明な値（NFR-234-03）。RPC は user_id を露出しない。

const VALID_CATEGORIES = ['research_adopted', 'dormant_reengage', 'weekly_digest', 'all'] as const
type Category = (typeof VALID_CATEGORIES)[number]

type Status = 'idle' | 'working' | 'done' | 'error' | 'invalid'

function UnsubscribeInner() {
  const { t } = useTranslation()
  const params = useSearchParams()
  const token = params.get('t') ?? ''
  const rawCat = params.get('c') ?? 'all'
  const category: Category = (VALID_CATEGORIES as readonly string[]).includes(rawCat) ? (rawCat as Category) : 'all'

  const [status, setStatus] = useState<Status>('idle')
  const [appliedCategory, setAppliedCategory] = useState<Category>(category)

  const apply = useCallback(
    async (cat: Category) => {
      if (!token) {
        setStatus('invalid')
        return
      }
      setStatus('working')
      try {
        const { data, error } = await supabase.rpc('apply_unsubscribe', {
          p_token: token,
          p_category: cat,
        })
        if (error || data === false) {
          setStatus(error ? 'error' : 'invalid')
          return
        }
        setAppliedCategory(cat)
        setStatus('done')
      } catch {
        setStatus('error')
      }
    },
    [token],
  )

  // 着地時に、メールが指定したカテゴリを自動で停止する（List-Unsubscribe のワンクリック体験）。
  useEffect(() => {
    if (!token) {
      setStatus('invalid')
      return
    }
    void apply(category)
    // category は URL 由来で固定。token 変化時のみ再実行。
  }, [token, category, apply])

  const categoryLabel = (cat: Category): string =>
    cat === 'all' ? t('unsubscribe.categoryAll') : t(`unsubscribe.category.${cat}`)

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 px-4 py-16">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-gray-200 dark:border-slate-700/60 p-8 text-center">
        <div className="flex justify-center mb-4">
          <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400">
            {status === 'working' ? (
              <Loader2 size={26} className="animate-spin" />
            ) : status === 'done' ? (
              <Check size={26} className="text-green-600" />
            ) : status === 'invalid' || status === 'error' ? (
              <AlertCircle size={26} className="text-amber-600" />
            ) : (
              <MailX size={26} />
            )}
          </span>
        </div>

        <h1 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-2">{t('unsubscribe.title')}</h1>

        {status === 'working' && <p className="text-sm text-gray-600 dark:text-slate-300">{t('unsubscribe.working')}</p>}

        {status === 'done' && (
          <>
            <p className="text-sm text-gray-600 dark:text-slate-300 mb-4">
              {t('unsubscribe.done', { category: categoryLabel(appliedCategory) })}
            </p>
            {appliedCategory !== 'all' && (
              <button
                type="button"
                onClick={() => apply('all')}
                className="w-full py-2.5 rounded-xl bg-gray-800 dark:bg-slate-700 text-white font-bold text-sm hover:bg-gray-900 dark:hover:bg-slate-600 transition-colors mb-3"
              >
                {t('unsubscribe.stopAll')}
              </button>
            )}
            <p className="text-xs text-gray-400 dark:text-slate-500">{t('unsubscribe.manageHint')}</p>
          </>
        )}

        {status === 'invalid' && <p className="text-sm text-gray-600 dark:text-slate-300">{t('unsubscribe.invalid')}</p>}
        {status === 'error' && (
          <>
            <p className="text-sm text-gray-600 dark:text-slate-300 mb-4">{t('unsubscribe.error')}</p>
            <button
              type="button"
              onClick={() => apply(category)}
              className="w-full py-2.5 rounded-xl bg-gray-800 dark:bg-slate-700 text-white font-bold text-sm hover:bg-gray-900 dark:hover:bg-slate-600 transition-colors"
            >
              {t('unsubscribe.retry')}
            </button>
          </>
        )}

        <div className="mt-6">
          <Link href="/" className="text-sm text-red-600 hover:underline">
            {t('unsubscribe.backHome')}
          </Link>
        </div>
      </div>
    </main>
  )
}

export default function UnsubscribeClient() {
  // useSearchParams は Suspense 境界が必要（Next.js App Router）。
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader2 size={26} className="animate-spin text-gray-400" />
        </main>
      }
    >
      <UnsubscribeInner />
    </Suspense>
  )
}
