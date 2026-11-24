'use client'

import { useState, useEffect } from 'react'
import { Heart, Share2, Link2, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/ThemeContext'
import { useEmailResend } from '@/hooks/useEmailResend'
import { useToastContext } from '@/context/ToastContext'
import { buildShareUrl } from '@/lib/shareUtm'
import { trackShare } from '@/lib/lpAnalytics'

interface LikeSharePost {
  // REQ-236: content_id（非 PII）と /post/<id> の UTM 付き正規 URL 生成に使う。
  id: string
  municipality?: string | null
}

interface LabelItem {
  // REQ-183 FR-183-10/11: 表示は label 直参照ではなく value から t('species.*')/t('infoType.*') で解決する。
  // DetailPage は SPECIES/INFO_TYPES の全項目（value を含む）を渡すため、実行時に value が存在する。
  value?: string
  label?: string
}

interface LikeShareSectionProps {
  post: LikeSharePost
  species: LabelItem | undefined
  infoType: LabelItem | undefined
  likeCount: number
  liked: boolean
  likeLoading: boolean
  emailNotice: boolean
  // REQ-226 (FR-226-02): useLike が返す「未→済」成立カウンタ。増加時にハートの pop を 1 回再生する。
  likePulse: number
  isEmailConfirmed: boolean | undefined
  user: { email?: string } | null
  onLike: () => void
}

/**
 * いいね・SNSシェア・メール確認通知セクション
 *
 * REQ-236: 既存の X / LINE シェアに加え、Web Share API（モバイル最強の DM 送信導線）・
 *          UTM 付与・リンクコピー・GA4 `share` 計測を追加する。Web Share / clipboard は
 *          プログレッシブエンハンスメント（非対応環境では X/LINE リンクが従来どおり機能）。
 */
export default function LikeShareSection({
  post,
  species,
  infoType,
  likeCount,
  liked,
  likeLoading,
  emailNotice,
  likePulse,
  isEmailConfirmed,
  user,
  onLike,
}: LikeShareSectionProps) {
  const { dark } = useTheme()
  const { t } = useTranslation()
  const toast = useToastContext()
  const { resendEmail, resendLoading, resendCooldownSec } = useEmailResend()
  const [copied, setCopied] = useState(false)
  // REQ-226 (FR-226-02): いいね成立（未→済）の pop 再生フラグ。likePulse の増加で true にし、
  //   onAnimationEnd で false に戻す。連打中も likePulse は成立時のみ増えるため多重再生しない。
  //   reduced-motion 時は globals.css のグローバル @media が animation を 0.01ms に潰すため
  //   実質「動かずに」fill のみ即時切替となる（NFR-226-02）。初回マウント（pulse=0）では再生しない。
  const [popping, setPopping] = useState(false)
  useEffect(() => {
    if (likePulse > 0) setPopping(true)
  }, [likePulse])

  const card = `rounded-2xl shadow-xs p-5 ${dark ? 'bg-slate-900 border border-slate-800/60' : 'bg-white'}`
  const btnBase = `flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors ${
    dark ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
  }`

  // REQ-236 FR-236-02: シェア文言を i18n から組み立てる（4 言語）。種ラベル・情報種別・地域は変数差し込み。
  const shareText = t('share.text', {
    species: species?.value ? t(`species.${species.value}`) : t('share.defaultSpecies'),
    infoType: infoType?.value ? t(`infoType.${infoType.value}`) : '',
    municipality: post.municipality ?? '',
  })
  // REQ-236 FR-236-03: /post/<id> を基点に UTM を付与（経路ごとに utm_source を変える）。
  const sharePath = `/post/${post.id}`

  // REQ-236 FR-236-01: Web Share API。client マウント後に対応判定（SSR では undefined）。
  const canWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const canCopy =
    typeof navigator !== 'undefined' && !!navigator.clipboard && typeof navigator.clipboard.writeText === 'function'

  async function handleWebShare() {
    const url = buildShareUrl({ method: 'web_share', path: sharePath })
    try {
      await navigator.share({ title: t('share.appTitle'), text: shareText, url })
      // 共有実行（シート表示）を計測。AbortError（ユーザーキャンセル）は下の catch で握りつぶす。
      trackShare({ method: 'web_share', content_id: post.id })
    } catch {
      // ユーザーキャンセル / 非対応 / 二次例外は無視（NFR-236-03）。X/LINE/コピーで代替できる。
    }
  }

  async function handleCopy() {
    const url = buildShareUrl({ method: 'copy', path: sharePath })
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast?.success(t('share.linkCopied'))
      trackShare({ method: 'copy', content_id: post.id })
    } catch {
      // clipboard 不可（権限・非対応・非セキュアコンテキスト）でも二次例外を出さない（NFR-236-03）。
      toast?.error(t('share.copyFailed'))
    }
  }

  return (
    <div className={`${card} space-y-3`}>
      {emailNotice && isEmailConfirmed === false && (
        <div className={`rounded-xl border p-3 flex items-start gap-2 ${
          dark ? 'bg-amber-900/20 border-amber-600/40' : 'bg-amber-50 border-amber-200'
        }`}>
          <span className="text-sm shrink-0">⚠️</span>
          <div className="flex-1">
            <p className={`text-xs font-bold ${dark ? 'text-amber-200' : 'text-amber-900'}`}>
              {t('detail.emailNotConfirmed')}
            </p>
            <p className={`text-xs mt-0.5 ${dark ? 'text-amber-300/70' : 'text-amber-700'}`}>
              {t('detail.emailNotConfirmedLike')}
            </p>
            <button
              onClick={() => resendEmail(user?.email ?? '')}
              disabled={resendLoading || resendCooldownSec > 0}
              className={`text-xs font-semibold mt-1.5 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                dark ? 'bg-amber-600/30 hover:bg-amber-600/50 text-amber-200' : 'bg-amber-200 hover:bg-amber-300 text-amber-900'
              }`}
            >
              {resendLoading ? t('detail.resendSending') : resendCooldownSec > 0 ? t('detail.resendCooldown', { sec: resendCooldownSec }) : t('detail.resendEmail')}
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onLike}
          disabled={likeLoading}
          aria-busy={likeLoading}
          // REQ-325 FR-325-01: このボタンは「淡い面の上の文字」しか無いのに、白地用の色を使っていた。
          //   いいね済み: red-500 on red-50   = 3.44:1
          //   未いいね  : gray-500 on gray-100 = 4.39:1（hover で red-500 on red-50 = 3.44:1）
          // いずれも AA 未満。面に合わせて brand-700(red-50 上 5.91:1) / gray-600(gray-100 上 6.87:1) へ。
          // 隣の共有ボタン（btnBase）は既に bg-gray-100 + text-gray-600 なので色も揃う。
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl transition-all ${
            liked
              ? 'bg-red-50 text-brand-700 border border-red-200'
              : dark
              ? 'bg-slate-700 text-slate-400 hover:text-red-400 hover:bg-slate-600'
              : 'bg-gray-100 text-gray-600 hover:text-brand-700 hover:bg-red-50'
          }`}
        >
          <Heart
            size={16}
            fill={liked ? 'currentColor' : 'none'}
            className={popping ? 'animate-like-pop' : undefined}
            onAnimationEnd={() => setPopping(false)}
          />
          {t('detail.like')}{likeCount > 0 && <span className="font-bold">{likeCount}</span>}
        </button>

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <span className={`text-xs ${dark ? 'text-slate-400' : 'text-gray-400'}`}>{t('detail.share')}</span>
          {/* REQ-236 FR-236-01: Web Share（対応環境のみ表示。非対応では下の X/LINE にフォールバック）。 */}
          {canWebShare && (
            <button
              type="button"
              onClick={handleWebShare}
              className={btnBase}
              aria-label={t('share.shareNative')}
            >
              <Share2 className="w-3.5 h-3.5" />
              {t('share.shareNative')}
            </button>
          )}
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(buildShareUrl({ method: 'x', path: sharePath }))}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackShare({ method: 'x', content_id: post.id })}
            className={btnBase}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zM17.083 19.77h1.833L7.048 4.126H5.084L17.083 19.77z" />
            </svg>
            X
          </a>
          <a
            href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(buildShareUrl({ method: 'line', path: sharePath }))}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackShare({ method: 'line', content_id: post.id })}
            className={btnBase}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
            </svg>
            LINE
          </a>
          {/* REQ-236 FR-236-05: リンクコピー（UTM 付き URL・完了トースト）。clipboard 対応時のみ表示。 */}
          {canCopy && (
            <button
              type="button"
              onClick={handleCopy}
              className={btnBase}
              aria-label={t('share.copyLink')}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Link2 className="w-3.5 h-3.5" />}
              {copied ? t('share.linkCopied') : t('share.copyLink')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
