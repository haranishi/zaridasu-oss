'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/ThemeContext'
import { useIntroStory } from '@/hooks/useIntroStory'
import { prefersReducedMotion } from '@/lib/achievement'
import { btnPrimaryCls } from '@/lib/formStyles'
import { faint } from '@/lib/themeClasses'

/**
 * REQ-284: はじめて来た人への「誘いポップアップ」（FR-284-01〜04）。
 *
 * - 全画面を占有しない下部シート。地図操作（z-420）より前、モーダル（z-430以上）より後ろ。
 * - 表示条件と 5 秒の遅延は useIntroStory が持つ（FR-284-02 / 03）。
 * - ［読んでみる］は起動要求を出すだけで、ストーリー本体は providers.tsx の OnboardingHost が
 *   dynamic(ssr:false) で読み込む（AC-18: / の page chunk 10KB 予算を守るため、動的 import の
 *   任意モードの起点を OnboardingHost に集約している）。
 * - 呼び出し側（HomePage）も本コンポーネントを dynamic(ssr:false) でマウントする。
 */
export interface IntroPromptProps {
  /** ストーリー最終画面［投稿してみる］から呼ぶ投稿導線。 */
  onPostClick?: () => void
}

export default function IntroPrompt({ onPostClick }: IntroPromptProps) {
  const { t } = useTranslation()
  const { dark } = useTheme()
  const { promptOpen, openStory, dismissForSession, optOut } = useIntroStory({ onPostClick })
  const [visible, setVisible] = useState(false)

  // NFR-284-05: reduced-motion では即座に定位置へ（スライドさせない）。
  // 通常は SignupBanner.tsx:29-33 と同じ「マウント → rAF 2回 → visible」でスライドインさせる。
  useEffect(() => {
    if (!promptOpen) { setVisible(false); return }
    if (prefersReducedMotion()) { setVisible(true); return }
    let second: number | undefined
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setVisible(true))
    })
    return () => {
      cancelAnimationFrame(first)
      if (second !== undefined) cancelAnimationFrame(second)
    }
  }, [promptOpen])

  if (!promptOpen) return null

  return (
    // REQ-320 FR-320-07: SignupBanner と同じ位置規則に揃える。
    // 両者は排他表示（FR-284-14）だが、片方だけ地図中央に出ると「地図が主役」が崩れる。
    //  - 下端はボトムナビの実高（h-14 + safe-area）ちょうどに密着させる（旧 4rem は隙間が余っていた）
    //  - xl 以上では左寄せにして、地図中央のクラスタ（1440 で x=689/719）を避ける
    <div
      // REQ-323 FR-323-01: SignupBanner と同じ理由で .above-bottom-nav（lg 以上は下端へ）。
      // 水域の一覧が開いている間は、一覧を覆うので globals.css が [data-bottom-promo] を隠す。
      data-bottom-promo
      className={`above-bottom-nav pointer-events-none fixed left-0 right-0 z-425 flex justify-center xl:justify-start sm:p-3 xl:px-6 transition-transform duration-300 ease-out ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      {/* REQ-323 回帰修正: 390px でボトムナビの投稿 FAB（w-14 の丸＋ring-4 の白リング＝
          ナビ上端から 19.75px 突き出す）が、ナビ実高に密着させたこのカードへ食い込み、
          主 CTA［読んでみる］の下端 6px を白リングで削っていた。
          FAB を隠すと投稿導線が消えるため、カード側に FAB の突き出しぶんの下マージンを取る。
          追記: 当初は「768px 以上は外側の sm:p-3 が同じ役目を果たす」と書いていたが**誤り**。
          p-3 は 12px しかなく 19.75px に届かないので、768px では矩形が 3.75px 重なったままだった
          （実測 768×1024: カード下端 y=956 / 丸 y=952.25）。CTA には掛からないものの、
          SignupBanner 側と同じ基準（矩形で 0）に揃える。
            <sm  … 外側に padding が無いので mb-6(24px) > 19.75px
            sm〜 … 外側 sm:p-3(12px) と合わせて 24px にするため mb-3
            lg〜 … ボトムナビ自体が消える（lg:hidden / .above-bottom-nav も下端へ）ので 0 に戻す */}
      <div
        role="region"
        aria-labelledby="intro-prompt-title"
        data-testid="intro-prompt"
        className={`pointer-events-auto relative w-full max-w-lg border p-3 shadow-2xl mb-6 rounded-2xl sm:mb-3 sm:p-4 lg:mb-0 ${
          dark
            ? 'bg-slate-900 border-slate-700 shadow-black/60'
            : 'bg-white border-gray-200 shadow-gray-300/50'
        }`}
      >
        {/* REQ-323 FR-323-08: 離脱手段は［×］＋［今後表示しない］の 2 つだけにする。
            旧実装は［あとで］（枠線も背景も無いただの文字）と［今後表示しない］が並び、
            押せるかも違いも分からなかった（Round 4 採点）。［あとで］の挙動（セッション内スヌーズ）は
            そのまま × に移す＝振る舞いは変えず、見た目だけ「閉じる」の共通記号に寄せる。
            SignupBanner の × と同じ「absolute + 44px タップ域」で行の高さを増やさない。 */}
        <button
          type="button"
          onClick={dismissForSession}
          data-testid="intro-prompt-later"
          aria-label={t('intro.prompt.later')}
          className={`absolute top-0.5 right-0.5 rounded-full min-h-11 min-w-11 inline-flex items-center justify-center transition-colors ${
            dark ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          <X size={16} aria-hidden="true" />
        </button>

        <div className="mb-2 flex items-center gap-3 pe-11">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl ${dark ? 'bg-blue-400/15' : 'bg-blue-50'}`} aria-hidden="true">{'\u{1F99E}'}</span>
          <div className="min-w-0">
            <p className={`text-xs font-bold ${dark ? 'text-blue-300' : 'text-blue-700'}`}>{t('intro.prompt.kicker')}</p>
            <h2 id="intro-prompt-title" className={`mt-0.5 text-pretty text-base font-bold leading-snug ${dark ? 'text-slate-100' : 'text-gray-900'}`}>
              {t('intro.prompt.title')}
            </h2>
          </div>
        </div>
        <p className={`mb-3 text-sm leading-relaxed ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
          {t('intro.prompt.body')}
        </p>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <button
            type="button"
            onClick={openStory}
            data-testid="intro-prompt-read"
            className={`${btnPrimaryCls} min-h-11 px-4 text-sm font-bold shadow-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`}
          >
            {t('intro.prompt.read')}
          </button>
          {/* REQ-318 FR-318-04: ［今後表示しない］は「二度と出さない」不可逆な操作なのに、
              light=text-gray-400(#9ca3af) が白カード上 2.54:1・dark=text-slate-500 が 3.75:1 で
              どちらも AA 未満だった。トークン参照の faint()（light 4.8:1 / dark 7.0:1）へ寄せる。
              REQ-323 FR-323-08: そのうえで**枠線**を与える。文字色を直しても、枠も背景も無い
              下線テキストは「押せる物」に見えない（Round 4 採点）。主 CTA と並ぶ副ボタンにする。 */}
          <button
            type="button"
            onClick={optOut}
            data-testid="intro-prompt-never"
            className={`shrink-0 min-h-11 px-3 rounded-xl border text-xs transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${faint(dark)} ${
              dark ? 'border-slate-600 hover:bg-slate-800' : 'border-gray-300 hover:bg-gray-100'
            } hover:text-(--color-text)`}
          >
            {t('intro.prompt.never')}
          </button>
        </div>
      </div>
    </div>
  )
}
