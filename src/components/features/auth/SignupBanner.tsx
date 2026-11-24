'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { useTranslation } from 'react-i18next'
import { useIntroOverlayOpen } from '@/hooks/useIntroStory'
import { isBannerOptedOut, markBannerOptedOut, readLocal, writeLocal, SIGNUP_BANNER_OPTOUT_KEY } from '@/lib/introStorage'
import { trackEvent } from '@/lib/analytics'
import { btnPrimaryCls } from '@/lib/formStyles'

const DISMISS_KEY = 'signup_banner_dismissed_at'
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000 // 24時間
const SHOW_DELAY_MS = 3 * 1000 // 3秒後

interface SignupBannerProps {
  onSignupClick: () => void
  onLoginClick: () => void
}

export default function SignupBanner({ onSignupClick, onLoginClick }: SignupBannerProps) {
  const { dark } = useTheme()
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  // REQ-284 FR-284-14: 誘いポップアップ／ストーリー本体の表示中は出さない（多重ポップアップ禁止）。
  const introOverlayOpen = useIntroOverlayOpen()

  useEffect(() => {
    // REQ-284 FR-284-13: 恒久 opt-out は表示判定の最初で return する（期限で復活させない）。
    if (isBannerOptedOut(SIGNUP_BANNER_OPTOUT_KEY)) return

    // REQ-284 FR-284-15: localStorage が使えない環境でも例外で UI を壊さない。
    const dismissed = readLocal(DISMISS_KEY)
    if (dismissed && Date.now() - Number(dismissed) < DISMISS_DURATION_MS) return

    const timer = setTimeout(() => {
      setMounted(true)
      // 少し遅らせてスライドアニメーションを発火
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    }, SHOW_DELAY_MS)

    return () => clearTimeout(timer)
  }, [])

  function handleDismiss() {
    setVisible(false)
    writeLocal(DISMISS_KEY, String(Date.now()))
    setTimeout(() => setMounted(false), 300)
  }

  // REQ-284 FR-284-13 / AC-07: 恒久的に断る。期限付きスヌーズ（× / あとで）とは別の明示操作。
  function handleNeverShowAgain() {
    markBannerOptedOut(SIGNUP_BANNER_OPTOUT_KEY)
    trackEvent('banner_optout', { banner: 'signup' })
    setVisible(false)
    setTimeout(() => setMounted(false), 300)
  }

  if (!mounted) return null
  // AC-06: 紹介系オーバーレイを閉じたら従来どおりの条件で再表示される（mounted は保持する）。
  if (introOverlayOpen) return null

  return (
    /**
     * REQ-320 FR-320-07: このバナーが地図のマーカーを覆っていた。
     *
     * 実測（Round 1・地図の初期中心/ズームは AC-06 で不変）:
     *   390×844 … クラスタは (164, 604) と (194, 742)。旧バナーは概ね y=450〜745 を占有し、
     *             地図が素で見えるのは実質 25px しか残っていなかった。
     *   1440×900 … クラスタは (689, 632) と (719, 770)。旧バナーは中央に居座り
     *             x=465〜975 / y=530〜820 ＝ **両方のクラスタの真上**だった。
     *
     * 打ち手は地図側ではなくバナー側（要件どおり）:
     *   ① 高さを詰める … 旧 ≒295px → ≒146px。390 で上側クラスタ (y=604) が露出する。
     *      メリット 2 行は情報量より地図の可視領域を優先し、sm 未満では畳む
     *      （文言は残す＝ sm 以上と AuthModal で読める）。
     *   ② 下端をナビに密着 … 旧 `bottom: 4rem + safe` + 外側 p-3 で 20px の無駄な隙間があった。
     *      ナビの実高は `h-14`(3.5rem) + safe-area なので、その値ちょうどに合わせる。
     *   ③ 広い画面では中央を避ける … xl(1280px≥) から**左寄せ**にする。1440 でカード右端は
     *      x=24+512=536 で、クラスタ x=689/719 に届かない。右寄せにしないのは、右下に
     *      現在地ボタン・右端中央に写真タブがあるため。
     *
     * 残る限界（正直に記録）: 390 の下側クラスタ (y=742) はボトムナビ上端から 38px しか
     * 離れていないため、**下端に置く UI である限り必ず重なる**。中心/ズームを動かさずに
     * これを避ける方法は無い（AC-06）。
     */
    <div
      // REQ-323 FR-323-01: 下端はボトムナビの実高に合わせるが、ナビは lg 以上で消えるので
      // オフセットも同じ境界で畳む（globals.css の .above-bottom-nav）。
      // 水域の一覧が開いている間は、一覧を覆うので globals.css が [data-bottom-promo] を隠す。
      data-bottom-promo
      className={`above-bottom-nav fixed left-0 right-0 z-40 flex justify-center xl:justify-start sm:p-3 xl:px-6 transition-transform duration-300 ease-out ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      {/* REQ-323 回帰修正（IntroPrompt.tsx:61-67 と同じ欠陥・こちらが取り残されていた）:
          ボトムナビの投稿 FAB は w-14 の丸を `-mt-5` で持ち上げ、さらに ring-4 の白リングを
          纏うので **ナビ上端から 19.75px 突き出す**（実測 390px: ナビ上端 y=787 / 丸 y=772.25 /
          リング込み y=768.25）。このカードは .above-bottom-nav でナビ実高ちょうどに密着するため、
          突き出したぶんがそのままカードに食い込む。
          カードの丈は関係ない（wrapper は fixed で bottom だけを持ち、カードは上へ伸びる＝
          下端の位置は高さに依存しない）。実測でも 390px の当バナー(h=150) と誘いシート(h=171) は
          下端が同じ y=788 だった。足りていなかったのは**下マージンそのもの**。
          FAB を隠すと投稿導線が消えるので、カード側で FAB のリングごと避ける:
            <sm  … 外側に padding が無いので mb-6(24px) > 19.75px
            sm〜 … 外側 sm:p-3(12px) と合わせて 24px にするため mb-3
            lg〜 … ボトムナビ自体が消える（lg:hidden / .above-bottom-nav も下端へ）ので 0 に戻す */}
      <div className={`relative w-full max-w-lg border p-3 shadow-2xl mb-6 rounded-2xl sm:mb-3 sm:p-4 lg:mb-0 ${
        dark
          ? 'bg-slate-900 border-slate-700 shadow-black/60'
          : 'bg-white border-gray-200 shadow-gray-300/50'
      }`}>
        {/* 閉じる（44px のタップ域は absolute で確保し、行の高さには算入しない＝丈を詰める） */}
        <button
          onClick={handleDismiss}
          aria-label={t('common.close')}
          className={`absolute top-0.5 right-0.5 rounded-full min-h-11 min-w-11 inline-flex items-center justify-center transition-colors ${
            dark ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          <X size={16} />
        </button>

        {/* 見出し */}
        <p className={`flex items-center gap-2 pe-11 text-sm font-bold ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
          <span aria-hidden="true">🦞</span>
          {t('signupBanner.title')}
        </p>

        {/* メリット（上記①）。
            出すのは **バナーが地図の中央から外れる xl 以上だけ**にする。
            それ未満ではバナーが地図の真上に重なるので、情報量より可視領域を優先する
            （文言は xl 以上と AuthModal で読める＝どこからも消える訳ではない）。 */}
        <div className={`hidden xl:block rounded-xl p-3 mt-3 space-y-2 ${dark ? 'bg-slate-800/60' : 'bg-gray-50'}`}>
          <div className="flex items-center gap-2.5 text-sm">
            <span className="text-base" aria-hidden="true">💬</span>
            <span className={dark ? 'text-slate-300' : 'text-gray-700'}>{t('signupBanner.benefit1')}</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <span className="text-base" aria-hidden="true">📊</span>
            <span className={dark ? 'text-slate-300' : 'text-gray-700'}>{t('signupBanner.benefit2')}</span>
          </div>
        </div>

        {/* ボタン
            REQ-320 FR-320-04: 主 CTA のグラデを手打ち（from-red-500 = #EF4444）していたため
            「押せる赤」が 3 系統に割れていた。唯一の正である btnPrimaryCls へ寄せる。 */}
        {/* REQ-323 FR-323-08: 離脱手段を［×］＋［今後表示しない］の 2 つに整理した。
            旧実装は［×］［今は不要］［今後表示しない］の 3 つが並び、しかも後ろ 2 つは
            枠線も背景も無いただの文字だった。［今は不要］は × と**まったく同じ挙動**
            （24 時間スヌーズ）なので、重複している方を消す。 */}
        <div className="flex gap-2 mt-2 xl:mt-4">
          <button
            onClick={onSignupClick}
            className={`${btnPrimaryCls} flex-1 min-h-11 px-3 text-sm font-bold`}
          >
            {t('signupBanner.signupButton')}
          </button>
          {/* 恒久 opt-out（REQ-284 FR-284-13）。旧［今は不要］が座っていた位置をそのまま使う
              ＝バナーの丈は変わらない。枠線付きの副ボタンにして「押せる」ことを見た目で示す。 */}
          <button
            type="button"
            onClick={handleNeverShowAgain}
            data-testid="signup-banner-never"
            className={`shrink-0 inline-flex items-center justify-center min-h-11 min-w-11 px-3 rounded-xl border text-xs transition-colors ${
              dark ? 'border-slate-600 text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            {t('banner.neverShowAgain')}
          </button>
        </div>

        {/* ログイン導線。REQ-323 FR-323-08: 枠線付きのチップにして「押せる」ことを見た目で示す。 */}
        <div className={`flex flex-wrap items-center justify-center gap-1.5 mt-2 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
          <span>{t('signupBanner.alreadyHaveAccount')}</span>
          <button
            onClick={onLoginClick}
            className={`inline-flex items-center justify-center min-h-11 min-w-11 px-3 rounded-xl border transition-colors ${
              dark ? 'border-slate-600 hover:bg-slate-800 hover:text-slate-200' : 'border-gray-300 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            {t('signupBanner.login')}
          </button>
        </div>
      </div>
    </div>
  )
}
