'use client'

import { useRef, useState } from 'react'
import { Loader2, Check, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { usePushSubscription } from '@/hooks/usePushSubscription'
import { useProgress } from '@/hooks/useProfile'
import { useUnlocks } from '@/hooks/useUnlocks'
import UnlockTeaser from '@/components/ui/UnlockTeaser'
import { faint } from '@/lib/themeClasses'

// REQ-194: プロフィール編集モーダルを src/components/modals/ 配下へ一本化。
// DashboardPage / ProfilePage に重複していたローカル定義をこの共通コンポーネントに集約する。
// REQ-249: アバター絵文字は「基本セット（常時）」＋「拡張セット（Lv2 で解放＝コスメ報酬）」に分ける。
//   基本セットは誰でも選べる（自己表現の最低限は非ゲート）。拡張はレベルで段階解放する。
const EMOJI_BASE = ['🦞', '🐸', '🔍', '🗺️', '🌱', '🏆']
const EMOJI_EXTRA = ['🐢', '🦎', '🐟', '🌿', '🏔️', '🌊']

interface EditProfileModalProps {
  profile: {
    display_name: string | null
    avatar_emoji: string | null
    bio?: unknown
    is_public?: unknown
    [key: string]: unknown
  }
  onSave: (updates: {
    display_name?: string | null
    avatar_emoji?: string
    bio?: string | null
    is_public?: boolean
    notify_survey_request?: boolean
    // REQ-234: ライフサイクルメールのカテゴリ別 opt-in/out
    notify_research_adopted?: boolean
    notify_dormant_reengage?: boolean
    notify_weekly_digest?: boolean
  }) => Promise<void>
  onClose: () => void
  dark: boolean
  // REQ-249: レベル連動でアバター拡張絵文字を解放するため、進捗取得に使う userId。
  //   未指定なら進捗は取得されずフェイルオープン（拡張も選択可）＝既存/テスト利用を壊さない。
  userId?: string
}

export default function EditProfileModal({ profile, onSave, onClose, dark, userId }: EditProfileModalProps) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDivElement>(null)
  // REQ-249: アバター拡張絵文字の解放判定（Lv2）。匿名/未取得はフェイルオープン。
  const { progress } = useProgress(userId)
  const { isUnlocked, unlockLevelOf } = useUnlocks(progress?.level)
  const avatarPlusUnlocked = isUnlocked('avatar_emoji_plus')
  const avatarPlusLevel = unlockLevelOf('avatar_emoji_plus') ?? 0

  // 注: '名無し調査員' はサーバ側 RPC の既定値（COALESCE(display_name, '名無し調査員')）。
  // 既定ニックネーム判定（未設定なら入力欄を空に）のため比較リテラルはサーバ値のまま保持する。表示文言は t() 化する。
  const [name, setName] = useState(profile.display_name === '名無し調査員' ? '' : profile.display_name ?? '')
  const [emoji, setEmoji] = useState(profile.avatar_emoji ?? '🦞')
  const [bio, setBio] = useState(typeof profile.bio === 'string' ? profile.bio : '')
  const [isPublic, setIsPublic] = useState(profile.is_public !== false)
  // REQ-088 Phase 4: 調査依頼通知の opt-out。未取得時は既定値 true
  const [notifySurvey, setNotifySurvey] = useState(profile.notify_survey_request !== false)
  // REQ-234: ライフサイクルメール 3 カテゴリの opt-in/out。未取得時は既定値 true。
  const [notifyResearchAdopted, setNotifyResearchAdopted] = useState(profile.notify_research_adopted !== false)
  const [notifyDormant, setNotifyDormant] = useState(profile.notify_dormant_reengage !== false)
  const [notifyWeeklyDigest, setNotifyWeeklyDigest] = useState(profile.notify_weekly_digest !== false)
  const [saving, setSaving] = useState(false)
  // REQ-193 (FR-193-04): 保存失敗をモーダル内インラインエラーで表示する（DeleteAccountModal と同型）。
  const [error, setError] = useState('')

  // REQ-237: Web Push 購読（メール=REQ-234 とは別の即時チャネル）。
  // 許諾はトグル ON 時に subscribe() がプリプロンプト後段としてブラウザ許諾を取る（FR-237-04）。
  const push = usePushSubscription()
  const handlePushToggle = async (next: boolean) => {
    if (next) await push.subscribe()
    else await push.unsubscribe()
  }

  useEscapeKey(onClose)
  useFocusTrap(dialogRef)
  useBodyScrollLock()

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave({
        display_name: name.trim() || null,
        avatar_emoji: emoji,
        bio: bio.trim() || null,
        is_public: isPublic,
        notify_survey_request: notifySurvey,
        notify_research_adopted: notifyResearchAdopted,
        notify_dormant_reengage: notifyDormant,
        notify_weekly_digest: notifyWeeklyDigest,
      })
      onClose()
    } catch (err: unknown) {
      // REQ-193 (FR-193-04): 失敗時はモーダルを閉じず、スピナーを止めてインラインエラーを表示する。
      setError(err instanceof Error ? err.message : t('profile.saveError'))
      setSaving(false)
    }
  }

  const cardBg = dark ? 'bg-slate-900 border-slate-700/60' : 'bg-white border-gray-200'
  // REQ-268 FR-268-05: iOS Safari のフォーカス時自動ズームを避けるため入力は 16px（text-base）以上。
  const inputCls = `w-full px-3 py-2 rounded-lg border text-base md:text-sm ${dark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-gray-300 text-gray-800'}`
  const labelCls = `block text-sm font-medium mb-1 ${dark ? 'text-slate-300' : 'text-gray-700'}`
  const emojiBtnCls = (selected: boolean) =>
    `w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${
      selected
        ? 'bg-brand-600 text-white ring-2 ring-red-400 scale-110'
        : dark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-gray-100 hover:bg-gray-200'
    }`

  return (
    <div className="fixed inset-0 z-430 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="edit-profile-title">
      <button
        type="button"
        aria-label={t('common.close')}
        tabIndex={-1}
        className="fixed inset-0 bg-black/50 cursor-default border-0 p-0"
        onClick={onClose}
      />
      <div ref={dialogRef} className={`relative w-full max-w-sm max-h-[90dvh] overflow-y-auto rounded-2xl border shadow-xl p-5 space-y-4 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <h3 id="edit-profile-title" className={`font-bold ${dark ? 'text-slate-100' : 'text-gray-800'}`}>{t('profilePage.editTitle')}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            // REQ-325 FR-325-01: hover 面が gray-100 になるのに文字色は gray-400 のままで 2.31:1
            //（UI 部品の 3:1 も割る）。閉じるアイコンは gray-600（gray-100 上 6.87:1）にする。
            className={`p-1 rounded-lg ${dark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-gray-100 text-gray-600'}`}
          >
            <X size={18} />
          </button>
        </div>

        <div>
          <span id="edit-profile-icon-label" className={labelCls}>{t('profilePage.iconLabel')}</span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="edit-profile-icon-label">
            {EMOJI_BASE.map(e => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                aria-pressed={emoji === e}
                className={emojiBtnCls(emoji === e)}
              >
                {e}
              </button>
            ))}
            {EMOJI_EXTRA.map(e => {
              // REQ-249: 拡張絵文字は Lv2 で解放。ただし現在の自分のアバターが拡張側にある場合は
              //   ロック中でも選択可能にして、既存の見た目を剥奪しない（NFR-249-03 グランドファーザー）。
              const locked = !avatarPlusUnlocked && emoji !== e
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => { if (!locked) setEmoji(e) }}
                  disabled={locked}
                  aria-disabled={locked}
                  aria-pressed={emoji === e}
                  // a11y(NFR-249-04): ロックを色/グレースケールだけに頼らず、ラベルのテキストで明示する。
                  aria-label={locked ? `${e} — ${t('unlocks.lockedAtLevel', { level: avatarPlusLevel })}` : undefined}
                  title={locked ? t('unlocks.lockedAtLevel', { level: avatarPlusLevel }) : undefined}
                  className={`${emojiBtnCls(emoji === e)} ${locked ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                >
                  {e}
                </button>
              )
            })}
          </div>
          {!avatarPlusUnlocked && (
            <UnlockTeaser
              unlockLevel={avatarPlusLevel}
              featureLabelKey="unlocks.features.avatar_emoji_plus"
              currentXp={progress?.xp}
              dark={dark}
              className="mt-2"
            />
          )}
        </div>

        <div>
          <label htmlFor="edit-profile-nickname" className={labelCls}>{t('profilePage.nicknameLabel')}</label>
          <input
            id="edit-profile-nickname"
            type="text"
            maxLength={20}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('profilePage.nicknamePlaceholder')}
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor="edit-profile-bio" className={labelCls}>{t('profilePage.bioLabel')}</label>
          <textarea
            id="edit-profile-bio"
            maxLength={100}
            rows={2}
            value={bio}
            onChange={e => setBio(e.target.value)}
            className={inputCls}
          />
          <p className={`text-xs mt-0.5 ${faint(dark)}`}>{t('profilePage.bioCount', { count: bio.length })}</p>
        </div>

        <label htmlFor="edit-profile-public" className={`flex items-center gap-2 text-sm ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
          <input id="edit-profile-public" type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="rounded-sm" />
          {t('profilePage.showInRanking')}
        </label>

        <label htmlFor="edit-profile-notify" className={`flex items-center gap-2 text-sm ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
          <input id="edit-profile-notify" type="checkbox" checked={notifySurvey} onChange={e => setNotifySurvey(e.target.checked)} className="rounded-sm" />
          {t('profilePage.notifySurvey')}
        </label>

        {/* REQ-234: ライフサイクルメール（研究採用・休眠復帰・週次ダイジェスト）のカテゴリ別 opt-in/out */}
        <fieldset className="space-y-2 pt-1">
          <legend className={`text-xs font-semibold mb-1 ${faint(dark)}`}>{t('profilePage.lifecycleSection')}</legend>
          <label htmlFor="edit-profile-notify-research" className={`flex items-center gap-2 text-sm ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
            <input id="edit-profile-notify-research" type="checkbox" checked={notifyResearchAdopted} onChange={e => setNotifyResearchAdopted(e.target.checked)} className="rounded-sm" />
            {t('profilePage.notifyResearchAdopted')}
          </label>
          <label htmlFor="edit-profile-notify-dormant" className={`flex items-center gap-2 text-sm ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
            <input id="edit-profile-notify-dormant" type="checkbox" checked={notifyDormant} onChange={e => setNotifyDormant(e.target.checked)} className="rounded-sm" />
            {t('profilePage.notifyDormant')}
          </label>
          <label htmlFor="edit-profile-notify-weekly" className={`flex items-center gap-2 text-sm ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
            <input id="edit-profile-notify-weekly" type="checkbox" checked={notifyWeeklyDigest} onChange={e => setNotifyWeeklyDigest(e.target.checked)} className="rounded-sm" />
            {t('profilePage.notifyWeeklyDigest')}
          </label>
        </fieldset>

        {/* REQ-237: Web Push（即時通知）のトグル。対応環境のみ操作可。非対応はメール（REQ-234）へ誘導。 */}
        <fieldset className="space-y-2 pt-1">
          <legend className={`text-xs font-semibold mb-1 ${faint(dark)}`}>{t('profilePage.pushSection')}</legend>
          {push.supported ? (
            <>
              <label htmlFor="edit-profile-push" className={`flex items-center gap-2 text-sm ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
                <input
                  id="edit-profile-push"
                  type="checkbox"
                  checked={push.subscribed}
                  disabled={push.busy}
                  onChange={e => { void handlePushToggle(e.target.checked) }}
                  className="rounded-sm"
                />
                {push.busy && <Loader2 size={14} className="animate-spin" />}
                {t('profilePage.pushEnable')}
              </label>
              {push.permission === 'denied' && (
                <p className={`text-xs ${faint(dark)}`}>{t('profilePage.pushDenied')}</p>
              )}
            </>
          ) : (
            <p className={`text-xs ${faint(dark)}`}>
              {push.unsupportedReason === 'ios_needs_pwa'
                ? t('profilePage.pushIosHint')
                : t('profilePage.pushUnsupported')}
            </p>
          )}
        </fieldset>

        {/* REQ-193 (FR-193-04): 保存失敗のインラインエラー（role="alert"・DeleteAccountModal と同型） */}
        {error && (
          <p className="text-sm text-red-500" role="alert">{error}</p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {t('profilePage.save')}
        </button>
      </div>
    </div>
  )
}
