'use client'
// REQ-282 D-8（分割候補・実施は個別REQ）: hero/特徴/使い方/FAQ/CTA のセクション単位でサブコンポーネント化する（760行）。

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useTranslation } from 'react-i18next'
import {
  Map,
  Sparkles,
  ClipboardList,
  Trophy,
  Camera,
  CheckCircle2,
  Plus,
  Search,
} from 'lucide-react'
import { pushLpEvent } from '@/lib/lpAnalytics'
// REQ-320 FR-320-02: ロゴの SVG（ブランド赤 #dc2626 の手打ち）が Header.tsx とここに
// 2 本コピーされていた。共通コンポーネントへ寄せて色の出どころを 1 つにする。
import BrandMark from '@/components/layout/BrandMark'

/**
 * REQ-321 FR-321-07: 日本語の「1 文字だけ次行に落ちる」折返しを止める指定。
 *
 * ■ 何が起きていたか（390 / 768 / 1440 の実測）
 *   「あなたの報告が、すぐ地図にの／る」   … lp.features.mapTitle（h3）
 *   「どこにいるか、まだよく分かっていませ／ん」… lp.problem.item2Title（h3）
 *   「秋田県の全25市／町村」                … lp.stats.areaValue（dd・768px）
 * 日本語は既定で**どこでも改行できる**ため、和文の見出しは容器幅しだいで語中・活用語尾で割れる。
 * SectionHeading の h2 と hero の h1 には既に対策が入っていたが、**h3 と dd には無かった**。
 *
 * ■ なぜこの 2 つをセットで当てるのか
 *   - `text-wrap: balance`（= text-balance）… 行長を均すので「最終行 1 文字」が構造的に起きない。
 *     Chrome/Safari/Firefox で実装済み。行数上限（Chrome は 6 行）を超えると無効化されるため、
 *     見出しのような短いテキスト専用。
 *   - `word-break: auto-phrase` … 日本語を文節単位で折る。Chrome 系のみだが、
 *     効かないブラウザでも balance 側が残るので劣化はしない（progressive enhancement）。
 * 文言は一切削らない（FR-321-07 の但し書き）。CSS だけで解決する。
 */
const JP_HEADING_WRAP = 'text-balance [word-break:auto-phrase]'

/**
 * 本文（複数行になる段落）用。`balance` は行数の多い段落では効かない／重いので、
 * 最終行の孤立だけを潰す `text-wrap: pretty`（= text-pretty）を使う。
 */
const JP_BODY_WRAP = 'text-pretty [word-break:auto-phrase]'

// REQ-176: LP の CTA はルート画面で AuthModal をサインアップモード起動するクエリ付きリンク。
const SIGNUP_HREF = '/?auth=signup&from=lp'
const LOGIN_HREF = '/?auth=login&from=lp'
const MAP_HREF = '/map'

export interface LpStats {
  totalPosts: number
  totalUsers: number
}

interface LandingPageProps {
  stats: LpStats | null
}

export default function LandingPage({ stats }: LandingPageProps) {
  const { t } = useTranslation()
  const revealRootRef = useRevealRoot()

  return (
    <div
      ref={revealRootRef}
      className="min-h-screen overflow-x-clip bg-white text-gray-900 dark:bg-slate-950 dark:text-slate-100"
    >
      <LpAnalytics />
      <LpHeader />
      {/* REQ-187 (NFR-176-07): /lp は RootMain がルート <main> ラッパーを外す分岐ルート。
          本文をここで唯一の <main id="main-content"> として描画することで、上の <LpHeader>(=<header>)
          を banner、下の <footer> を contentinfo として、いずれもトップレベル landmark に露出させる。 */}
      <main id="main-content">
        <LpHero />
        <LpMarquee />
        <LpProblem />
        <LpFeatures />
        <LpHowItWorks />
        <LpStatsSection stats={stats} />
        <LpFaq />
        <LpFinalCta />
      </main>
      <footer className="relative overflow-hidden border-t border-gray-200 px-5 pb-28 pt-14 dark:border-slate-800 md:pb-12">
        {/* Junni 風の巨大ゴーストワードマーク（装飾） */}
        <p
          aria-hidden="true"
          className="pointer-events-none select-none text-center text-[clamp(3.2rem,13vw,9rem)] font-black leading-none tracking-tighter text-gray-100 dark:text-slate-900"
        >
          ZARIDASU
        </p>
        <div className="mx-auto mt-8 flex max-w-5xl flex-col items-center gap-4 text-sm text-gray-600 dark:text-slate-400">
          <nav aria-label={t('lp.footer.navLabel')} className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            <Link href="/about" className="hover:text-primary-600 hover:underline">{t('lp.footer.about')}</Link>
            <Link href="/terms" className="hover:text-primary-600 hover:underline">{t('lp.footer.terms')}</Link>
            <Link href="/privacy" className="hover:text-primary-600 hover:underline">{t('lp.footer.privacy')}</Link>
          </nav>
          {/* REQ-318 FR-318-11: 年は `{{year}}` 補間（詳細は Footer.tsx の同 FR コメント）。 */}
          <p suppressHydrationWarning>{t('lp.footer.copyright', { year: new Date().getFullYear() })}</p>
        </div>
      </footer>
      <LpStickyCta />
    </div>
  )
}

// ── 鉤括弧フレーズの泣き別れ防止 ─────────────────────────────────────────────
// 「見つけた」のようなキーフレーズが行をまたがないよう、「…」単位で nowrap にする。
// 鉤括弧を含まない言語（en 等）ではそのまま全文を返す。
function NoBreakQuotes({ text }: { text: string }) {
  const parts = text.split(/(「[^」]*」)/)
  if (parts.length === 1) return <>{text}</>
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('「') ? (
          <span key={i} className="whitespace-nowrap">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

// ── スクロール出現（.lp-reveal → .is-in） ───────────────────────────────────
function useRevealRoot() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    // REQ-205 (FR-205-01/02): JS が稼働した証としてゲートクラスを付与する。
    // これが付いて初めて CSS 側で .lp-reveal が初期非表示（opacity:0）になる。
    // JS 無効・ハイドレーション失敗・チャンクロード失敗ではこの行に到達しないため、
    // .lp-reveal は可視のまま残り、本文/CTA が永続非表示にならない。
    root.classList.add('lp-js-ready')
    const targets = Array.from(root.querySelectorAll<HTMLElement>('.lp-reveal'))
    if (targets.length === 0) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in')
            io.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    targets.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return ref
}

// ── 無限アニメの画面外停止（FR-204-02・WCAG/INP配慮） ───────────────────────
// 対象要素を IntersectionObserver で監視し、ビューポート外のとき .lp-anim-paused を
// 付与して animation-play-state: paused にする。reduced-motion 時や IO 非対応時は
// 何もしない（全体ルールが既にアニメを潰すため）。
function useAnimationPause<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)
    ) {
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          entry.target.classList.toggle('lp-anim-paused', !entry.isIntersecting)
        }
      },
      { rootMargin: '0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return ref
}

// ── 計測（lp_view + スクロール深度） ─────────────────────────────────────────
function LpAnalytics() {
  const firedDepths = useRef(new Set<number>())

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const utm: Record<string, string> = {}
    params.forEach((value, key) => {
      if (key.startsWith('utm_')) utm[key] = value
    })
    pushLpEvent('lp_view', { referrer: document.referrer || undefined, ...utm })

    const onScroll = () => {
      const doc = document.documentElement
      const scrollable = doc.scrollHeight - window.innerHeight
      if (scrollable <= 0) return
      const percent = ((window.scrollY || doc.scrollTop) / scrollable) * 100
      for (const threshold of [25, 50, 75, 100]) {
        if (percent >= threshold && !firedDepths.current.has(threshold)) {
          firedDepths.current.add(threshold)
          pushLpEvent('lp_scroll', { percent: threshold })
        }
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return null
}

/**
 * REQ-323 FR-323-02: eyebrow（セクション上の小さな英字ラベル）の色を決める唯一の場所。
 *
 * 白背景用の `text-white/60` を**ブランド赤の面にも流用**していたのが不合格の原因だった。
 * 白 60% は下地で意味が変わる: slate-950 の上では 9.8:1 だが、最終CTA のグラデ赤
 * （評価者の実測 #C93636）の上では **2.77:1** しか無い。面ごとに modifier を分ける。
 */
const EYEBROW_TONE = {
  /** 白・淡色の面。gray-500 は白地 4.83:1。 */
  onLight: 'text-gray-500 dark:text-slate-400',
  /** 反転セクション（bg-slate-950）。白 60% でも 9.8:1 で通る。 */
  onDark: 'text-white/60',
  /** ブランド赤の面（最終CTA）。白ベタで 5.17:1（#C93636 上）／4.83:1（#dc2626 上）。 */
  onBrand: 'text-white',
  /**
   * REQ-325 FR-325-02: ヒーローのように**淡赤に染まった面**。
   * ヒーローは白ではなく、`bg-primary-500/15` のオーブが白地に乗った #FDE5E5〜#FDE9E9 の帯で、
   * ここに brand-600(#dc2626) を置くと **4.03:1** しか無かった（Round 5c 採点 TOP5-1）。
   * brand-800(#991b1b) なら同じ帯で 6.9:1・白地でも 8.3:1 で、グラデのどこに乗っても AA を割らない。
   * ダークは反転面（slate-950）に載るので、赤は明側の red-400（7.29:1）へ振る
   * （brand-800 のままだと暗地で 1.9:1 になる）。
   */
  onBrandTint: 'text-primary-800 dark:text-red-400',
} as const

// ── セクション見出し（番号 + 英ラベル + 大見出し） ──────────────────────────
function SectionHeading({ no, en, title, light }: { no: string; en: string; title: string; light?: boolean }) {
  return (
    <div className="lp-reveal">
      <p
        aria-hidden="true"
        className={`flex items-baseline gap-3 font-mono text-xs tracking-[0.3em] ${
          light ? EYEBROW_TONE.onDark : EYEBROW_TONE.onLight
        }`}
      >
        <span className="text-primary-500 font-bold">({no})</span>
        <span className="uppercase">{en}</span>
      </p>
      <h2 className={`mt-4 text-3xl font-extrabold leading-tight tracking-tight ${JP_HEADING_WRAP} md:text-5xl`}>{title}</h2>
    </div>
  )
}

// ── CTA ボタン（主/副） ──────────────────────────────────────────────────────
function CtaButtons({ position, inverted }: { position: 'hero' | 'mid' | 'footer'; inverted?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <Link
        href={SIGNUP_HREF}
        onClick={() => pushLpEvent('lp_cta_signup', { position })}
        className={`group w-full rounded-full px-9 py-4 text-center text-base font-bold shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl sm:w-auto ${
          inverted
            ? 'bg-white text-primary-700 hover:bg-primary-50'
            : 'bg-primary-600 text-white hover:bg-primary-700'
        }`}
      >
        {t('lp.hero.ctaPrimary')}
        <span aria-hidden="true" className="ml-2 inline-block transition-transform duration-300 group-hover:translate-x-1">→</span>
      </Link>
      <Link
        href={MAP_HREF}
        onClick={() => pushLpEvent('lp_cta_map', { position })}
        className={`w-full rounded-full border px-9 py-4 text-center text-base font-medium transition-colors sm:w-auto ${
          inverted
            // REQ-323 FR-323-02: 枠線 white/50 は赤地で 2.11:1 と UI 部品 3:1 未満で、
            // 「押せる範囲」の輪郭が読めなかった。white/80 で 3.52:1。
            ? 'border-white/80 text-white hover:bg-white/10'
            : 'border-gray-300 text-gray-700 hover:border-gray-900 hover:text-gray-900 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-300 dark:hover:text-white'
        }`}
      >
        {t('lp.hero.ctaSecondary')}
      </Link>
    </div>
  )
}

// ── ヘッダー ────────────────────────────────────────────────────────────────
function LpHeader() {
  const { t } = useTranslation()
  // FR-204-08: reduced-motion 設定時は即時スクロール（JS の behavior は CSS の抑止が効かない）。
  const scrollToTop = () => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
  }
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200/70 bg-white/80 backdrop-blur-md dark:border-slate-800/70 dark:bg-slate-950/80">
      {/* FR-204-06: 本文へのスキップリンク（Header.tsx と同パターン）。 */}
      <a
        href="#main-content"
        className="sr-only rounded-md bg-primary-600 px-4 py-2 text-sm font-bold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50"
      >
        {t('header.skipToMain')}
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        {/* FR-204-03/04: 可視テキスト「ザリダス」をアクセシブルネームに含める（aria-label で上書きしない）。
            補助ラベルは可視ラベルの後ろに視覚非表示で連結し i18n 化する。 */}
        <button onClick={scrollToTop} className="flex items-center gap-2.5">
          <BrandMark className="h-7 w-7 shrink-0 rounded-lg" />
          <span className="text-xl font-black tracking-tight text-primary-600">ザリダス</span>
          <span aria-hidden="true" className="hidden font-mono text-[10px] uppercase tracking-[0.3em] text-gray-400 dark:text-slate-500 sm:inline">
            Zaridasu
          </span>
          <span className="sr-only">{t('lp.header.logoLabel')}</span>
        </button>
        <div className="flex items-center gap-1.5">
          <Link
            href={LOGIN_HREF}
            className="px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-slate-300 dark:hover:text-white"
          >
            {t('lp.header.login')}
          </Link>
          <Link
            href={SIGNUP_HREF}
            onClick={() => pushLpEvent('lp_cta_signup', { position: 'header' })}
            className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-bold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-lg"
          >
            {t('lp.header.cta')}
          </Link>
        </div>
      </div>
    </header>
  )
}

// ── ① ヒーロー ──────────────────────────────────────────────────────────────
function LpHero() {
  const { t } = useTranslation()
  // FR-204-02: ヒーロー外へスクロールしたら浮遊オーブ／スクロールキューのアニメを停止。
  const orbARef = useAnimationPause<HTMLDivElement>()
  const orbBRef = useAnimationPause<HTMLDivElement>()
  const scrollLineRef = useAnimationPause<HTMLSpanElement>()
  return (
    <section className="lp-grid-bg relative overflow-hidden px-5 pb-20 pt-20 md:pb-28 md:pt-28">
      {/* 浮遊オーブ（装飾） */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div ref={orbARef} className="lp-orb-a absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary-500/15 blur-3xl md:h-96 md:w-96" />
        <div ref={orbBRef} className="lp-orb-b absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-primary-600/10 blur-3xl md:h-112 md:w-md" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <p aria-hidden="true" className={`lp-hero-in font-mono text-[11px] uppercase tracking-[0.35em] md:text-xs ${EYEBROW_TONE.onBrandTint}`}>
          Akita Invasive Species Map — Citizen Science
        </p>
        <h1 className={`lp-hero-in lp-hd1 mt-6 max-w-4xl text-[clamp(2.5rem,7.5vw,5.5rem)] font-black leading-[1.08] tracking-tighter ${JP_HEADING_WRAP}`}>
          <NoBreakQuotes text={t('lp.hero.title')} />
        </h1>
        <p className={`lp-hero-in lp-hd2 mt-7 max-w-2xl text-base leading-relaxed text-gray-600 dark:text-slate-300 md:text-lg ${JP_BODY_WRAP}`}>
          {t('lp.hero.subtitle')}
        </p>
        <div className="lp-hero-in lp-hd3 mt-10">
          <CtaButtons position="hero" />
        </div>

        {/*
          REQ-206 (FR-206-01/02/03): ヒーロービジュアル。地図画面を様式化した
          プレースホルダー（最終アートは後日差し替え。元データ public/lp/hero.svg）。
          LCP 対象のため next/image + priority。width/height 固定で CLS を抑える（NFR-206-02）。
          画像は sharp で WebP 化済み（public/lp/hero.webp）。
        */}
        <div className="lp-hero-in lp-hd3 mt-16 overflow-hidden rounded-3xl shadow-2xl ring-1 ring-gray-200 dark:ring-slate-800 md:mt-20">
          <Image
            src="/lp/hero.webp"
            alt={t('lp.hero.imageAlt')}
            width={1600}
            height={800}
            priority
            sizes="(min-width: 1152px) 1088px, (min-width: 768px) 90vw, 100vw"
            className="h-auto w-full"
          />
        </div>
      </div>

      {/* スクロールキュー
          REQ-322 FR-322-04: 「SCROLL」が gray-400(#9ca3af) で、下地がヒーロー画像の
          明るいグレー（評価者の実測 #ECECEC）に重なると 2.10:1 しか無かった（Round 3 採点 #6）。
          gray-600(#4b5563) なら #ececec 上で 6.40:1、白地でも 7.56:1 と下地を選ばず通る。
          細線も同系へ寄せて、文字だけ濃く線が薄い不揃いを作らない。 */}
      <div aria-hidden="true" className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 md:flex">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-gray-600 dark:text-slate-400">Scroll</span>
        <span ref={scrollLineRef} className="lp-scroll-line block h-10 w-px bg-gray-600 dark:bg-slate-400" />
      </div>
    </section>
  )
}

// ── マーキー帯（装飾） ───────────────────────────────────────────────────────
// FR-204-01: 自動スクロール（5s超・WCAG 2.2.2）を止められるよう一時停止トグルを設置。
//   - ホバー／フォーカス時は CSS（:hover / :focus-within）で自動一時停止。
//   - キーボードでも止められるよう実ボタン（aria-hidden にしない）を置く。
// FR-204-02: ビューポート外ではトラックを paused にしてモバイル負荷を下げる。
function LpMarquee() {
  const { t } = useTranslation()
  const [paused, setPaused] = useState(false)
  const trackRef = useAnimationPause<HTMLDivElement>()

  // REQ-318 FR-318-09: 停止ボタンを帯の上に絶対配置するのをやめ、帯の下へ独立配置した。
  //  - 旧実装は `absolute right-2 top-1/2 ... bg-white/90 opacity-60 text-[10px]` で、
  //    流れる 3xl〜5xl の文字とボタン文字が重なり **390/768/1440 の 3 幅すべてで両方とも判読不能**。
  //    「モーションを止める手段」が一番読めない、という逆転が起きていた。
  //  - 独立配置＋不透明背景（bg-white / dark:bg-slate-900）＋ text-xs(12px)＋
  //    text-gray-700 on white = 10.3:1 ＋ min-h-11/min-w-11（44px タップ域）で作り直す。
  //  - 親の px-5 内に収めるので、帯自体の overflow-hidden にも画面外にも引っかからない。
  //  - `overflow-hidden` はトラック側の div へ移す（ボタンは帯の外なのでクリップ対象にしない）。
  return (
    <div className="relative select-none border-y border-gray-200 py-5 dark:border-slate-800">
      <div aria-hidden="true" className="overflow-hidden">
        <div ref={trackRef} className={`lp-marquee-track${paused ? ' lp-marquee-stopped' : ''}`}>
          {[0, 1].map((i) => (
            <span key={i} className="flex shrink-0 items-baseline whitespace-nowrap pr-10 text-3xl font-black tracking-tight md:text-5xl">
              <span className="text-primary-600">ZARIDASU</span>
              <span className="mx-5 lp-outline">みつけて、のせて、まもる。</span>
              {/* REQ-323 FR-323-02: 旧 gray-300(#d1d5db) は白地 1.47:1、ダークの slate-700 は
                  slate-950 上 1.95:1 で、どちらも「見えない文字が流れている」状態だった。
                  gray-600 = 7.56:1 / slate-400 = 7.87:1。 */}
              <span className="text-gray-600 dark:text-slate-400">CITIZEN SCIENCE MAP, AKITA</span>
              <span className="mx-5 text-primary-600">—</span>
            </span>
          ))}
        </div>
      </div>
      {/* REQ-320 FR-320-05: 停止ボタンだけが素の px-5 で、1440px では x=1310〜1420 と
          本文コンテナの右端（x=1296）より外に出ていた。他セクションと同じ max-w-6xl に載せて
          縦の揃え線（左右とも）に合わせる。 */}
      <div className="mx-auto flex max-w-6xl justify-end px-5 mt-3">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-gray-500 bg-white px-4 text-xs font-bold tracking-wider text-gray-700 transition-colors hover:bg-gray-100 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {paused ? t('lp.marquee.play') : t('lp.marquee.pause')}
        </button>
      </div>
    </div>
  )
}

// ── ② 課題共感（常時ダーク反転セクション） ──────────────────────────────────
function LpProblem() {
  const { t } = useTranslation()
  const items = [1, 2, 3] as const
  return (
    <section className="bg-slate-950 px-5 py-24 text-white md:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeading no="01" en="Issue" title={t('lp.problem.title')} light />
        <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {items.map((n, i) => (
            <div key={n} className={`lp-reveal lp-d${i + 1} border-t border-white/15 pt-6`}>
              <p aria-hidden="true" className="font-mono text-sm font-bold text-primary-500">
                {String(n).padStart(2, '0')}
              </p>
              {/* REQ-321 FR-321-07: item2Title「…分かっていませ／ん」が 390/1440 の両方で割れていた。 */}
              <h3 className={`mt-3 text-xl font-bold leading-snug ${JP_HEADING_WRAP}`}>{t(`lp.problem.item${n}Title`)}</h3>
              <p className={`mt-3 text-sm leading-relaxed text-white/70 ${JP_BODY_WRAP}`}>{t(`lp.problem.item${n}Body`)}</p>
            </div>
          ))}
        </div>
        <p className="lp-reveal mt-12">
          <Link href="/about" className="text-sm font-medium text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline">
            {t('lp.problem.moreLink')} →
          </Link>
        </p>
      </div>
    </section>
  )
}

// ── ③ 特徴カード ×4 ─────────────────────────────────────────────────────────
const FEATURES = [
  { key: 'map', Icon: Map },
  { key: 'ai', Icon: Sparkles },
  { key: 'requests', Icon: ClipboardList },
  { key: 'gamification', Icon: Trophy },
] as const

function LpFeatures() {
  const { t } = useTranslation()
  return (
    <section className="px-5 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeading no="02" en="Features" title={t('lp.features.title')} />
        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          {FEATURES.map(({ key, Icon }, i) => (
            <div
              key={key}
              className={`lp-reveal lp-d${(i % 2) + 1} group rounded-3xl border border-gray-200 p-8 transition-all duration-300 hover:-translate-y-1 hover:border-primary-300 hover:shadow-xl dark:border-slate-800 dark:hover:border-primary-700 md:p-10`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110 dark:bg-slate-900">
                <Icon aria-hidden="true" className="h-6 w-6 text-primary-600" />
              </div>
              {/* REQ-321 FR-321-07: mapTitle「…すぐ地図にの／る」が 390/1440 の両方で割れていた。 */}
              <h3 className={`mt-6 text-xl font-bold leading-snug md:text-2xl ${JP_HEADING_WRAP}`}>{t(`lp.features.${key}Title`)}</h3>
              <p className={`mt-3 text-sm leading-relaxed text-gray-600 dark:text-slate-300 md:text-base ${JP_BODY_WRAP}`}>
                {t(`lp.features.${key}Body`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── ④ 使い方3ステップ ───────────────────────────────────────────────────────
const STEPS = [
  { n: 1, Icon: Search },
  { n: 2, Icon: Camera },
  { n: 3, Icon: CheckCircle2 },
] as const

function LpHowItWorks() {
  const { t } = useTranslation()
  return (
    <section className="bg-gray-50 px-5 py-24 dark:bg-slate-900 md:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeading no="03" en="How It Works" title={t('lp.how.title')} />
        <ol className="mt-20 grid gap-14 md:grid-cols-3 md:gap-8">
          {STEPS.map(({ n, Icon }, i) => (
            <li key={n} className={`lp-reveal lp-d${i + 1} relative`}>
              {/* 背景のゴースト数字 */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-14 left-0 select-none text-[6.5rem] font-black leading-none tracking-tighter text-primary-600/10 dark:text-primary-500/10 md:text-[8rem]"
              >
                {String(n).padStart(2, '0')}
              </span>
              <div className="relative pt-8">
                <Icon aria-hidden="true" className="h-8 w-8 text-primary-600" />
                <h3 className={`mt-4 text-xl font-bold md:text-2xl ${JP_HEADING_WRAP}`}>{t(`lp.how.step${n}Title`)}</h3>
                <p className={`mt-3 text-sm leading-relaxed text-gray-600 dark:text-slate-300 md:text-base ${JP_BODY_WRAP}`}>
                  {t(`lp.how.step${n}Body`)}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <div className="lp-reveal mt-16 flex justify-center">
          <CtaButtons position="mid" />
        </div>
      </div>
    </section>
  )
}

// ── ⑤ 実績・社会的証明 ──────────────────────────────────────────────────────
function LpStatsSection({ stats }: { stats: LpStats | null }) {
  const { t, i18n } = useTranslation()
  const { ref, inView } = useInView()
  return (
    <section ref={ref} className="px-5 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeading no="04" en="Numbers" title={t('lp.stats.title')} />
        <dl className="mt-14 grid gap-10 sm:grid-cols-3">
          {/* 数値はISR時に取得。取得失敗（stats=null）時は数値カードを出さない（FR-176-06） */}
          {stats && (
            <>
              <CountUpStat
                label={t('lp.stats.postsLabel')}
                value={stats.totalPosts}
                unit={t('lp.stats.postsUnit')}
                locale={i18n.language}
                start={inView}
                delayClass="lp-d1"
              />
              <CountUpStat
                label={t('lp.stats.usersLabel')}
                value={stats.totalUsers}
                unit={t('lp.stats.usersUnit')}
                locale={i18n.language}
                start={inView}
                delayClass="lp-d2"
              />
            </>
          )}
          <div className="lp-reveal lp-d3 border-t-2 border-primary-600 pt-5">
            <dt className="font-mono text-xs uppercase tracking-[0.2em] text-gray-500 dark:text-slate-400">
              {t('lp.stats.areaLabel')}
            </dt>
            {/* REQ-321 FR-321-07: 768px で「秋田県の全25市／町村」と地名が割れていた。 */}
            <dd className={`mt-3 text-2xl font-extrabold tracking-tight md:text-3xl ${JP_HEADING_WRAP}`}>{t('lp.stats.areaValue')}</dd>
          </div>
        </dl>
        <p className={`lp-reveal mx-auto mt-16 max-w-2xl text-center text-sm leading-relaxed text-gray-600 dark:text-slate-400 ${JP_BODY_WRAP}`}>
          {t('lp.stats.operator')}
        </p>
      </div>
    </section>
  )
}

function useInView() {
  const ref = useRef<HTMLElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window)) {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -15% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return { ref, inView }
}

function CountUpStat({
  label,
  value,
  unit,
  locale,
  start,
  delayClass,
}: {
  label: string
  value: number
  unit: string
  locale: string
  start: boolean
  delayClass: string
}) {
  const display = useCountUp(value, start)
  return (
    <div className={`lp-reveal ${delayClass} border-t-2 border-primary-600 pt-5`}>
      <dt className="font-mono text-xs uppercase tracking-[0.2em] text-gray-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-3 text-5xl font-black tracking-tighter text-primary-600 md:text-6xl">
        {new Intl.NumberFormat(locale).format(display)}
        {unit && <span className="ml-1.5 text-lg font-bold text-gray-500 dark:text-slate-400">{unit}</span>}
      </dd>
    </div>
  )
}

function useCountUp(target: number, start: boolean) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!start) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    const duration = 1400
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const progress = Math.min((now - t0) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(target * eased))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, start])
  return value
}

// ── ⑥ FAQ ───────────────────────────────────────────────────────────────────
const FAQ_LINKS: Record<number, { href: string; labelKey: string } | undefined> = {
  6: { href: '/about', labelKey: 'lp.faq.a6Link' },
  7: { href: '/privacy', labelKey: 'lp.faq.a7Link' },
}

function LpFaq() {
  const { t } = useTranslation()
  const [openId, setOpenId] = useState<number | null>(null)

  const toggle = (n: number) => {
    setOpenId((current) => {
      const next = current === n ? null : n
      if (next !== null) pushLpEvent('lp_faq_open', { question_id: `q${n}` })
      return next
    })
  }

  return (
    <section className="bg-gray-50 px-5 py-24 dark:bg-slate-900 md:py-32">
      {/* REQ-320 FR-320-05: FAQ だけ max-w-3xl(768px) で、他セクション（max-w-6xl=1152px）と
          紙面幅が違った。1440px では ISSUE/FEATURES/HOW IT WORKS/NUMBERS が x=145〜1295 なのに
          FAQ だけ x=336〜1104 で、スクロール中に版面が狭くなって見える（Round 1 採点 #5）。
          回答テキストが横に間延びしないよう、本文側に読み幅の上限を持たせる。 */}
      <div className="mx-auto max-w-6xl">
        <SectionHeading no="05" en="FAQ" title={t('lp.faq.title')} />
        <div className="lp-reveal mt-12 divide-y divide-gray-200 border-y border-gray-200 dark:divide-slate-800 dark:border-slate-800">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => {
            const open = openId === n
            const link = FAQ_LINKS[n]
            return (
              <div key={n}>
                <button
                  onClick={() => toggle(n)}
                  aria-expanded={open}
                  aria-controls={`lp-faq-answer-${n}`}
                  className="group flex w-full items-center justify-between gap-4 py-5 text-left text-base font-bold transition-colors hover:text-primary-600 md:py-6 md:text-lg"
                >
                  <span className="flex items-baseline gap-4">
                    <span aria-hidden="true" className="font-mono text-xs text-primary-600">
                      Q{n}
                    </span>
                    {t(`lp.faq.q${n}`)}
                  </span>
                  <Plus
                    aria-hidden="true"
                    className={`h-5 w-5 shrink-0 text-gray-500 transition-transform duration-300 group-hover:text-primary-600 dark:text-slate-400 ${
                      open ? 'rotate-45' : ''
                    }`}
                  />
                </button>
                <div id={`lp-faq-answer-${n}`} hidden={!open} className="pb-6 pl-9">
                  {/* セクション幅を広げたぶん、回答文だけは読み幅（1 行 35-50 字相当）で止める */}
                  <p className={`max-w-measure text-sm leading-relaxed text-gray-600 dark:text-slate-300 md:text-base ${JP_BODY_WRAP}`}>
                    {t(`lp.faq.a${n}`)}
                  </p>
                  {link && (
                    <Link
                      href={link.href}
                      className="mt-2 inline-block text-sm font-medium text-primary-600 underline-offset-4 hover:underline dark:text-primary-400"
                    >
                      {t(link.labelKey)} →
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── ⑦ 最終CTA ───────────────────────────────────────────────────────────────
function LpFinalCta() {
  const { t } = useTranslation()
  return (
    <section className="relative overflow-hidden bg-linear-to-br from-primary-600 via-primary-700 to-[#7f1d1d] px-5 py-28 md:py-36">
      {/* ラジアルハイライト（装飾） */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-1/3 left-1/2 h-144 w-xl -translate-x-1/2 rounded-full bg-white/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-4xl text-center text-white">
        {/* REQ-323 FR-323-02: 旧 `text-white/60` は赤地で 2.77:1（Round 2 で指摘され、
            第3・第4周の要件に入れ損ねていたもの）。赤面用の modifier へ寄せる。 */}
        <p aria-hidden="true" className={`lp-reveal font-mono text-[11px] uppercase tracking-[0.35em] ${EYEBROW_TONE.onBrand}`}>
          Join Us
        </p>
        <h2 className={`lp-reveal lp-d1 mt-5 text-[clamp(2rem,6vw,4rem)] font-black leading-[1.15] tracking-tighter ${JP_HEADING_WRAP}`}>
          <NoBreakQuotes text={t('lp.final.title')} />
        </h2>
        {/* REQ-323 FR-323-02: 同じ節の本文 `text-white/85` も赤地で 3.82:1 と AA 未満だった
            （要件の表には載っていないが原因も面も同じ＝白の不透明度）。18px は WCAG の
            「大きな文字」(24px / 太字18.66px) に届かないので 4.5:1 が要る。白ベタで 4.83:1。
            階層は不透明度ではなく字の大きさ・太さで作る。 */}
        <p className={`lp-reveal lp-d2 mt-6 text-base leading-relaxed text-white md:text-lg ${JP_BODY_WRAP}`}>
          {t('lp.final.subtitle')}
        </p>
        <div className="lp-reveal lp-d3 mt-10 flex justify-center">
          <CtaButtons position="footer" inverted />
        </div>
      </div>
    </section>
  )
}

// ── モバイル追従CTAバー ──────────────────────────────────────────────────────
function LpStickyCta() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 480)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95 md:hidden">
      <Link
        href={SIGNUP_HREF}
        onClick={() => pushLpEvent('lp_cta_signup', { position: 'sticky' })}
        className="block w-full rounded-full bg-primary-600 py-3 text-center text-base font-bold text-white transition-colors hover:bg-primary-700"
      >
        {t('lp.sticky.cta')}
      </Link>
      <p className="mt-1.5 text-center text-xs text-gray-500 dark:text-slate-400">{t('lp.sticky.note')}</p>
    </div>
  )
}
