'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ArrowLeft, Check, CircleHelp, Eye, EyeOff, Loader2, MapPin, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/ThemeContext'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useIntroOverlayLock } from '@/hooks/useIntroStory'
import { markIntroRead, writeLocal } from '@/lib/introStorage'
import { ONBOARDING_COMPLETED_EVENT, REGIONS, SEEN, isFreshSignup, type Region, type Seen, type OnboardingMode } from '@/lib/onboarding'
import { useAuth } from '@/context/AuthContext'
import { completeOnboarding } from '@/lib/onboarding/complete'
import { SPECIES } from '@/lib/constants'
import { btnPrimaryCls } from '@/lib/formStyles'

/** 段階 → 見出しのキー。`s${step}` のような組み立てにすると、画面が増減したときに黙ってずれる。 */
const TITLE_KEYS: Record<number, string> = {
  1: 'onboarding.askRegion.q',
  2: 'onboarding.askSeen.q',
  3: 'onboarding.fact.bubble',
  4: 'onboarding.finish.startMap',
}
/** 完了画面のピンは実際の地図と同じ色で描く。色を書き写すと REQ-327 の食い違いが再発する。 */
const MARKER_COLOR = SPECIES.find(s => s.value === 'american')?.color ?? '#0072B2'
const TOTAL_STEPS = 4
type FinishAction = 'post' | 'map'

export interface OnboardingFlowProps {
  mode: OnboardingMode
  onClose: () => void
  onPostClick?: () => void
  onMapClick?: () => void
}

export default function OnboardingFlow({ mode, onClose, onPostClick, onMapClick }: OnboardingFlowProps) {
  const { t } = useTranslation()
  const { dark } = useTheme()
  const titleId = useId()
  const actionHintId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const savingRef = useRef(false)
  const [step, setStep] = useState(1)
  const [figureLoaded, setFigureLoaded] = useState(false)
  const [region, setRegion] = useState<Region | null>(null)
  const [seen, setSeen] = useState<Seen | null>(null)
  const [savingAction, setSavingAction] = useState<FinishAction | null>(null)
  const [retryAction, setRetryAction] = useState<FinishAction | null>(null)
  const [failures, setFailures] = useState(0)
  const { user } = useAuth()
  const optional = mode === 'optional'
  // REQ-326: 必須モードでも、登録から時間が経っている＝既存会員には 1 画面目から「あとで」を出す。
  // 入口で止めると、集めたい当の参加が減る。登録直後は回答が直後の体験（地図の初期位置）に
  // 効くので必須のまま。判定できないときは既存会員側に倒す（閉じ込めない）。
  const existingMember = !optional && !isFreshSignup(user?.created_at)
  const close = useCallback(() => {
    if (!optional || savingRef.current) return
    markIntroRead()
    onClose()
  }, [optional, onClose])
  useEscapeKey(close)
  useFocusTrap(dialogRef, true, step)
  useBodyScrollLock()
  useIntroOverlayLock()

  // 画面が切り替わったら、長い本文の途中位置を持ち越さず、新しい見出しから読み始められるようにする。
  // useFocusTrap の張り直し後にこの effect が走るため、最終的なフォーカスは見出しになる。
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0
    headingRef.current?.focus({ preventScroll: true })
  }, [step])

  const saving = savingAction !== null

  // ボタンがdisabledになるとフォーカスをbodyへ戻すブラウザがある。
  // 次のTabがダイアログ外で発生しないよう、描画時点で安定した見出しへ移す。
  useLayoutEffect(() => {
    if (saving) headingRef.current?.focus({ preventScroll: true })
  }, [saving])

  function goBack() {
    if (step <= 1 || savingRef.current) return
    setRetryAction(null)
    setStep(current => current - 1)
  }

  async function finish(action: FinishAction) {
    if (!region || !seen || savingRef.current) return
    savingRef.current = true
    setSavingAction(action)
    setRetryAction(null)
    try {
      if (optional) {
        writeLocal('zaridasu_onboarding_region_v1', region)
        window.dispatchEvent(new CustomEvent(ONBOARDING_COMPLETED_EVENT, { detail: { region } }))
      }
      else await completeOnboarding({ region, seen, mode })
    } catch {
      setFailures(n => n + 1)
      setRetryAction(action)
      return
    } finally {
      savingRef.current = false
      setSavingAction(null)
    }
    markIntroRead()
    onClose()
    if (action === 'post') onPostClick?.()
    else onMapClick?.()
  }

  const titleKey = TITLE_KEYS[step] ?? 'onboarding.askRegion.q'
  const area = t(region && region !== 'other' ? `onboarding.region.${region}` : 'onboarding.area.akita')
  const card = dark ? 'border-slate-600 bg-slate-800' : 'border-gray-200 bg-white'
  const interactiveCard = dark ? 'border-slate-400 bg-slate-800' : 'border-gray-500 bg-white'
  const focusRing = `focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${dark ? 'focus-visible:ring-offset-slate-900' : 'focus-visible:ring-offset-white'}`
  const secondary = `min-h-11 w-full rounded-xl border px-4 py-2 font-bold transition-colors disabled:cursor-wait disabled:opacity-60 ${interactiveCard} ${focusRing}`
  const missingSelection = step === 1 && !region
    ? t('onboarding.selectionHint.region')
    : step === 2 && !seen
      ? t('onboarding.selectionHint.seen')
      : ''
  const stageLabel = step <= 2
    ? t('onboarding.stage.question', { current: step, total: 2 })
    : step === 3
      ? t('onboarding.stage.mapGuide')
      : t('onboarding.finish.done')

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="onboarding"
      className="fixed inset-0 z-450 flex items-center justify-center bg-black/50 p-2 sm:p-5">
      {/* 高さは幅ごとに固定（390 は 95dvh・640px 以上は min(800px, 95dvh)）＝画面が変わっても ×・進捗・主ボタンが動かない。
          本文だけが内側でスクロールし、フッターは本文に被さらない。word-break: auto-phrase は Chromium の BudouX による日本語の文節改行
          （「ザリ／くん」「だ／れも」の語中改行を避ける）。未対応ブラウザは無視するので害はない。 */}
      <div
        ref={dialogRef}
        onKeyDownCapture={(event) => {
          // 保存中は操作ボタンがすべて無効になる。Tab の行き先を見出しに固定し、
          // 一時的にフォーカス可能要素が減ってもダイアログ外へ抜けないようにする。
          if (saving && event.key === 'Tab') {
            event.preventDefault()
            headingRef.current?.focus({ preventScroll: true })
            return
          }
          // 必須モードの1画面目は見出しより前に操作要素がない。画面遷移後の
          // 見出しから Shift+Tab したときだけ末尾へ循環させる。
          if (event.target !== headingRef.current || event.key !== 'Tab' || !event.shiftKey || optional || step !== 1) return
          const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href]:not([tabindex="-1"])')
          const last = controls?.[controls.length - 1]
          if (!last) return
          event.preventDefault()
          last.focus()
        }}
        className={`flex h-[95dvh] max-h-[95dvh] w-full max-w-lg sm:h-[min(800px,95dvh)] flex-col overflow-hidden rounded-3xl shadow-2xl [word-break:auto-phrase] ${dark ? 'bg-slate-900 text-slate-100' : 'bg-white text-gray-800'}`}
      >
        <div className="mb-1 flex min-h-11 shrink-0 items-center gap-2 px-3 pt-3 sm:px-5 sm:pt-5">
          {step > 1
            ? <button type="button" onClick={goBack} disabled={saving} data-testid="onboarding-back" aria-label={t('onboarding.back')} className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full disabled:cursor-wait disabled:opacity-40 ${focusRing}`}><ArrowLeft aria-hidden="true" size={22} /></button>
            : <span aria-hidden="true" className="h-11 w-11 shrink-0" />}
          <div role="progressbar" aria-label={t('intro.modal.progress', { current: step, total: TOTAL_STEPS })} aria-valuemin={1} aria-valuemax={TOTAL_STEPS} aria-valuenow={step} className="h-3 flex-1 overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-(--color-info)" style={{ width: `${step * (100 / TOTAL_STEPS)}%` }} />
          </div>
          {/* バーの塗りだけでは進み具合が読み取りにくいので数字を添える（採点1周目の指摘）。 */}
          <span aria-hidden="true" className={`shrink-0 text-xs tabular-nums ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{step} / {TOTAL_STEPS}</span>
          {optional
            ? <button type="button" onClick={close} disabled={saving} data-testid="onboarding-close" aria-label={t('intro.modal.close')} className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full disabled:cursor-wait disabled:opacity-40 ${focusRing}`}><X aria-hidden="true" size={22} /></button>
            : <span aria-hidden="true" className="h-11 w-11 shrink-0" />}
        </div>
        {/* REQ-327: 高さは画面ごとに動かさない（動かすと ×・進捗・主ボタンの位置が毎回変わる）。
            代わりに中身が足りない画面では上下中央へ寄せる。`justify-center` ではなく内側の `m-auto` を使うのは、
            中身が溢れたときに `justify-center` だと上端が切れてスクロールで戻れなくなるため（auto マージンは
            余白が無いとき 0 に解決するので溢れても素直に流れる）。 */}
        <div ref={contentRef} data-testid="onboarding-step" data-step={step} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-3">
          <div className={`m-auto w-full ${step === 3 ? 'space-y-2' : 'space-y-4'}`}>
          {step === 1 && <div className={`flex items-center gap-3 rounded-2xl border p-3 ${card}`}>
            <Image src="/images/intro/intro-06-invitation.webp" alt="" width={128} height={128} sizes="56px" className="h-14 w-14 shrink-0 rounded-full object-cover" />
            <div className="min-w-0">
              <p className="text-pretty text-sm font-bold">{t('onboarding.greet.bubble')}</p>
              <p className={`mt-1 text-pretty text-xs leading-relaxed ${dark ? 'text-slate-400' : 'text-gray-600'}`}>{t('onboarding.greet.effort')}</p>
            </div>
          </div>}
          <div>
            <p className={`mb-1 text-xs font-bold ${dark ? 'text-blue-300' : 'text-blue-700'}`}>{stageLabel}</p>
            {/* 見出しは吹き出しから分けて全幅を使う。画面遷移時はここへフォーカスする。 */}
            <h2
              ref={headingRef}
              id={titleId}
              tabIndex={-1}
              className="text-pretty text-xl font-bold leading-snug outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >{t(titleKey, { area })}</h2>
            {step === 3 && <p className={`mt-2 text-pretty text-sm ${dark ? 'text-slate-300' : 'text-gray-700'}`}>{t(seen === 'yes' ? 'onboarding.fact.seenYes' : 'onboarding.fact.seenNo')}</p>}
            {step === 4 && <p className={`mt-2 text-pretty text-sm leading-relaxed ${dark ? 'text-slate-300' : 'text-gray-700'}`}>{t('onboarding.finish.bubble')}</p>}
          </div>
          {(step === 1 || step === 2) && <>
            <div className="space-y-2" role="group" aria-labelledby={titleId}>
              {(step === 1 ? REGIONS : SEEN).map((option, i) => {
                const selected = (step === 1 ? region : seen) === option.value
                const SeenIcon = i === 0 ? Eye : i === 1 ? EyeOff : CircleHelp
                return <button key={option.value} type="button" data-testid={`onboarding-option-${option.value}`} aria-pressed={selected}
                  onClick={() => { if (step === 1) setRegion(option.value as Region); else setSeen(option.value as Seen) }}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left font-bold transition-colors ${focusRing} ${selected
                    ? dark ? 'border-blue-400 bg-blue-950/50' : 'border-blue-600 bg-blue-50'
                    : interactiveCard}`}>
                  <span aria-hidden="true" className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${selected ? dark ? 'bg-blue-400/20 text-blue-200' : 'bg-blue-100 text-blue-800' : dark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>
                    {step === 1 ? <MapPin size={18} /> : <SeenIcon size={18} />}
                  </span>
                  <span>{t(option.labelKey)}</span>
                  {selected && <Check aria-hidden="true" size={20} className="ml-auto shrink-0" />}
                </button>
              })}
            </div>
            <p className="text-sm leading-relaxed">{t(step === 1 ? (optional ? 'onboarding.askRegion.consentLocal' : 'onboarding.askRegion.consent') : 'onboarding.askSeen.hint')}</p>
          </>}
          {/* 同じ画像要素を画面1から eager で読み込み、最適化 URL・srcset をそのまま再利用する。 */}
            <div hidden={step !== 3} className={`rounded-xl border p-2 ${card}`}>
              <div className="grid grid-cols-2 text-center text-sm font-bold"><span>{t('onboarding.fact.labelCoarse')}</span><span>{t('onboarding.fact.labelFine')}</span></div>
              {/* 元画像の上下の空白だけを詰め、左右の地図は幅いっぱいに表示する。 */}
              <div className={`overflow-hidden rounded-xl ${figureLoaded ? '' : dark ? 'bg-slate-700/50' : 'bg-gray-100'}`}>
                <Image src="/images/intro/intro-02-map-coarse-vs-fine.webp" alt={t('intro.slides.2.imageAlt')} width={1024} height={1024} sizes="(max-width: 512px) 90vw, 440px" loading="eager" onLoad={() => setFigureLoaded(true)} className="-my-[16%] h-auto w-full object-contain" />
              </div>
              <p className="mt-1 text-xs">{t('onboarding.fact.legend')}</p>
            </div>
          {step === 3 && <>
            {/* REQ-326: 出典3行が注意書き1行より重く、伝えたい順序と逆になっていた（採点2周目の指摘）。
                出典は研究の誠実さとして残し、本文を一段大きく・リンクを行内に畳んで主従を入れ替える。 */}
            <figure className={`rounded-xl border-l-4 p-2 ${card}`}>
              <blockquote className="text-base font-bold leading-snug">{t('intro.slides.2.quote')}</blockquote>
              <figcaption className="mt-1 text-xs leading-snug">{t('intro.slides.2.quoteSource')}<a href="https://www.env.go.jp/nature/amezari_keii.html" target="_blank" rel="noopener noreferrer" className="underline">{t('intro.slides.2.quoteLink')}</a></figcaption>
            </figure>
          </>}
          {step === 4 && <>
            <div className="overflow-hidden rounded-2xl border border-blue-200 bg-green-100 dark:border-slate-600">
              <p className="bg-white/85 px-3 py-2 text-xs font-bold text-gray-800">{t('onboarding.finish.diagramTitle')}</p>
              {/* REQ-327: 池は比較図と同じ描き方（淡い塗り＋濃い輪郭）にする。緑の陸に対して
                  輪郭が 4.9:1 で分離し、画面3と画面4で池の見た目が変わらない。
                  ピンは 2 つの池にだけ置き、**1 つは点の無い池のまま残す**。
                  ピンの先端が池の内側に来るように置く（旧実装は 1 本が陸の上に立っていた）。 */}
              <svg viewBox="0 0 400 160" className="w-full" aria-hidden="true"><path d="M0 120L400 25M80 0L190 160M280 0L310 160" stroke="white" strokeWidth="15" /><g fill="#BAD6F1" stroke="#1E68B8" strokeWidth="2"><ellipse cx="240" cy="75" rx="48" ry="23" /><ellipse cx="85" cy="118" rx="25" ry="14" /><ellipse cx="330" cy="45" rx="30" ry="15" /></g>{([[222, 72], [258, 82], [85, 118]] as const).map(([x, y]) => (
                <g key={x} transform={`translate(${x - 7},${y - 18}) scale(0.5)`}>
                  <path d="M14 0C8.477 0 4 4.477 4 10c0 7.5 10 26 10 26s10-18.5 10-26C24 4.477 19.523 0 14 0z" fill={MARKER_COLOR} stroke="white" strokeWidth="2" />
                </g>
              ))}</svg>
            </div>
            <div className={`rounded-xl border p-4 ${card}`}><h3 className="font-bold">{t('onboarding.finish.tipTitle')}</h3><p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{t('intro.slides.5.body')}</p></div>
          </>}
          </div>
        </div>
        {/* REQ-325: 主ボタンは常に見える（Duolingo の固定 CONTINUE）。本文側をスクロールさせるので sticky は使わない
            （旧 sticky＋負マージンは、内容が収まる高さでもフッターが本文に 20px 食い込み、画面2の保存の説明や画面5のカードの下端を隠していた）。
            旧 pb-safe は env(safe-area-inset-bottom) が 0 の端末で下余白を消し、最後のボタンが角に張り付いて切れて見えた。 */}
        <div aria-busy={saving} className={`shrink-0 space-y-2 border-t px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] ${dark ? 'border-slate-700 bg-slate-900' : 'border-gray-100 bg-white'}`}>
          <p id={actionHintId} className={`min-h-5 text-center text-xs ${dark ? 'text-slate-400' : 'text-gray-600'}`}>{missingSelection || <span aria-hidden="true">&nbsp;</span>}</p>
          {step === 4 && retryAction && <p role="alert" className={`text-sm font-semibold ${dark ? 'text-red-300' : 'text-red-700'}`}>{t('onboarding.error.save')}</p>}
          {step < 4 ? <button type="button" data-testid="onboarding-continue" aria-describedby={missingSelection ? actionHintId : undefined} disabled={(step === 1 && !region) || (step === 2 && !seen)} onClick={() => setStep(n => n + 1)} className={`${btnPrimaryCls} min-h-11 w-full px-4 py-3 font-bold ${focusRing} ${dark ? 'disabled:bg-slate-700! disabled:text-slate-300!' : 'disabled:bg-gray-200! disabled:text-gray-600!'} disabled:opacity-100! disabled:shadow-none`}>{t('onboarding.continue')}</button>
            : <button type="button" data-testid="onboarding-post" aria-busy={savingAction === 'post'} disabled={saving} onClick={() => void finish('post')} className={`${btnPrimaryCls} min-h-11 w-full px-4 py-3 font-bold ${focusRing}`}>
              <span className="inline-flex items-center justify-center gap-2">{savingAction === 'post' && <Loader2 aria-hidden="true" size={18} className="animate-spin" />}{t(savingAction === 'post' ? 'onboarding.saving' : retryAction === 'post' ? 'onboarding.error.retry' : 'intro.cta.post')}</span>
            </button>}
          {/* REQ-325: 画面4の「まずは見るだけ」は両モードで出す（required では保存して閉じる＝投稿を強制しない）。画面1の「まずは見るだけ」は optional だけ */}
          {(step === 4 || (optional && step === 1)) && <button type="button" data-testid="onboarding-map-only" aria-busy={savingAction === 'map'} disabled={saving} onClick={() => {
            if (step === 4) void finish('map')
            else {
              close()
              onMapClick?.()
            }
          }} className={secondary}>
            <span className="inline-flex items-center justify-center gap-2">{savingAction === 'map' && <Loader2 aria-hidden="true" size={18} className="animate-spin" />}{t(savingAction === 'map' ? 'onboarding.saving' : retryAction === 'map' ? 'onboarding.error.retry' : 'onboarding.finish.mapOnly')}</span>
          </button>}
          {/* REQ-326: 既存会員は 1〜3 画面目でもここから抜けられる。行は作らないので次回また出る。 */}
          {existingMember && step !== 4 && <button type="button" data-testid="onboarding-skip" disabled={saving} onClick={onClose} className={secondary}>{t('onboarding.later')}</button>}
          {/* 副ボタンがない画面でも同じ高さを確保し、主ボタンの位置を揃える。 */}
          {step !== 4 && !(optional && step === 1) && !existingMember && <div aria-hidden="true" className="h-11" />}
          {!optional && step === 4 && failures >= 2 && <button type="button" data-testid="onboarding-later" disabled={saving} onClick={onClose} className={secondary}>{t('onboarding.error.later')}</button>}
        </div>
      </div>
    </div>
  )
}
