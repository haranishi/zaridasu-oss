'use client'

import { useTranslation, Trans } from 'react-i18next'
import Image from 'next/image'
import { ShieldOff, ShieldCheck, AlertTriangle, ExternalLink, Mail } from 'lucide-react'
import Footer from '@/components/layout/Footer'
import PageHeader from '@/components/layout/PageHeader'
import PageBottomNav, { BottomNavSpacer } from '@/components/layout/PageBottomNav'
import Breadcrumb from '@/components/ui/Breadcrumb'
import CrayfishIllustration from '@/components/ui/CrayfishIllustration'
import { useTheme } from '@/context/ThemeContext'
import { SPECIES, FEEDBACK_FORM_URL } from '@/lib/constants'
import { PAGE_CONTAINER } from '@/lib/layout'
import { btnPrimaryCls } from '@/lib/formStyles'

// REQ-323 FR-323-05: 種別色も SPECIES 種マスタ経由で引く（about・trends・地図凡例で同じ 1 値）。
const speciesColorVar = (value: string) =>
  SPECIES.find((s) => s.value === value)?.colorVar ?? '--species-american'

// REQ-229 FR-229-01: 学名は SPECIES 種マスタを唯一の出どころにする（旧ハードコード解消）。
const scientificNameOf = (value: string): string =>
  SPECIES.find((s) => s.value === value)?.scientificName ?? ''

// REQ-141: FAQ JSON-LD は app/about/page.tsx (RSC) 側で SSR 出力する。
// このコンポーネントはインタラクティブ表示のみ担当する。
export default function AboutPage() {
  const { t } = useTranslation()
  const { dark } = useTheme()

  // REQ-322 FR-322-03: 未使用だった `color`（#EF4444 / #16A34A＝REQ-224 が禁じた赤×緑）と
  // `statusColor`（描画に使われていない）を削除した。定義が残っていると「使われている色」と
  // 区別がつかず、色の棚卸しのたびに再調査が要る。表示に使うのは name/image/scientific/status/desc。
  const SPECIES_INFO = [
    {
      name: t('species.american'),
      image: '/images/american.png',
      scientific: scientificNameOf('american'),
      status: t('about.species_info.american.status'),
      desc: t('about.species_info.american.desc'),
    },
    {
      name: t('species.bullfrog'),
      image: '/images/bullfrog.png',
      scientific: scientificNameOf('bullfrog'),
      status: t('about.species_info.bullfrog.status'),
      desc: t('about.species_info.bullfrog.desc'),
    },
  ]

  const card = `rounded-2xl shadow-xs p-6 ${dark ? 'bg-slate-900 border border-slate-800/60' : 'bg-white'}`
  const heading = dark ? 'text-slate-100' : 'text-gray-800'
  const subheading = dark ? 'text-slate-200' : 'text-gray-800'
  const body = dark ? 'text-slate-400' : 'text-gray-600'
  // REQ-180 a11y(color-contrast)/REQ-224: light の faint は学名・補足に使われ白地で 4.5:1 必須。
  // 旧 text-gray-400(#9ca3af)=2.53:1 は不足。--color-text-faint 相当の gray-500(#6b7280)=4.83:1 へ底上げ。
  const faint = dark ? 'text-slate-400' : 'text-gray-500'
  // REQ-180 a11y(color-contrast)/REQ-224: 外来種法セクションの強調赤。
  // dark: 淡赤地（bg-red-900/20 等）では red-500(#ef4444)=4.42:1 不足のため暗地エラー色 red-400(#f87171, 5.9:1)。
  // light: この赤は白地だけでなく赤系淡地（red-50 #fef2f2 / orange-50 #fff7ed）上にも出る。
  //   red-500=3.44–3.76:1、red-600(#dc2626)=red-50 上 4.41:1 でも僅かに不足するため、
  //   全背景で 4.5:1 を満たす red-700(#b91c1c, 5.88–6.47:1) を用いる。
  const lawRed = dark ? 'text-red-400' : 'text-red-700'
  // REQ-284 FR-284-21 / FR-284-34: 条件付特定外来生物（アメリカザリガニ）は「飼うのは OK」を
  // 禁止事項と並べて示す。可否の対比を赤と緑で表すと色覚多様性のある人に区別できないため、
  // 色は青系にし、アイコン（ShieldCheck / ShieldOff）と文言でも区別する。
  //
  // REQ-322 FR-322-03: その青を sky-700(#0369a1) / sky-300(#7dd3fc) で**手打ち**していたため、
  // 同じサイトの種別色の青 #0072B2 と見分けがつかない別値の青になっていた（Round 3 採点 #3）。
  // 状態色トークン --color-info（FR-322-03 で #0072B2 / ダーク #56b4e9 に統合済み）を使う。
  // コントラスト: light red-50(#fef2f2) 上で 4.74:1、dark slate-900 上で 7.73:1。
  const lawOk = 'text-info'
  // REQ-322 FR-322-03: 「条件付特定外来生物」「特定外来生物」のバッジは、種類図鑑では灰チップ、
  // 法令セクションでは橙(#c2410c on #ffedd5)/赤チップと**同じ語が2つの色で出ていた**
  // （Round 3 採点 #14）。しかも橙 #c2410c は種別色の橙 #D55E00 の近似色で、
  // 「見分けられない色に違う意味」を作っていた（同 #3）。
  // 法的区分の違いは**語そのもの**が担っているので、チップの色は 1 種類（灰）に統合する。
  // ※ 近似色の解消を「橙を #D55E00 に寄せる」で行うと #D55E00 on #ffedd5 = 3.38:1 となり
  //    AA 4.5:1 を割る。色を寄せるのではなく**色を使わない**のが REQ-224 の原則にも合う。
  const statusChip = dark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600'

  return (
    <div className={`min-h-screen ${dark ? 'bg-slate-950' : 'bg-gray-50'}`}>
      {/* REQ-320 FR-320-02: 赤ベタ + 戻る矢印だった独自ヘッダーを廃止し、
          アプリ本体（Header.tsx）と同じ白ヘッダー意匠へ統一する。
          h1（about.title）はこのページの唯一の h1 なので asH1 でヘッダー側に残す（AC-04）。 */}
      <PageHeader titleKey="about.title" asH1 />

      <Breadcrumb items={[{ label: t('about.title') }]} />

      {/* REQ-320 FR-320-05: 旧 max-w-2xl(672px) はこのページだけの幅で、他ページ(768px)と
          左端が 32px ずれていた。PAGE_CONTAINER へ寄せる。 */}
      <div className={`${PAGE_CONTAINER} py-6 space-y-6`}>
        {/* サービス概要 */}
        <div className={card}>
          <div className="flex justify-center mb-4">
            <CrayfishIllustration className="w-48 sm:w-56 drop-shadow-xs" />
          </div>
          <h2 className={`text-xl font-bold mb-3 text-center ${heading}`}>{t('about.serviceTitle')}</h2>
          <p className={`text-sm leading-relaxed ${body}`}>
            {t('about.serviceDesc')}
          </p>
        </div>

        {/* 使い方 — REQ-284 FR-284-11: ストーリーから該当箇所へ直接飛べるよう id を付与する */}
        <div id="how-to-use" className={`${card} scroll-mt-20`}>
          <h3 className={`font-bold mb-4 ${subheading}`}>{t('about.howToUse')}</h3>
          <div className="space-y-3">
            {[
              { step: '1', text: t('about.steps.1') },
              { step: '2', text: t('about.steps.2') },
              { step: '3', text: t('about.steps.3') },
              { step: '4', text: t('about.steps.4') },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  dark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700'
                }`}>
                  {item.step}
                </span>
                <p className={`text-sm ${body}`}>{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 種類図鑑 — REQ-284 FR-284-11 */}
        <div id="species" className={`${card} scroll-mt-20`}>
          <h3 className={`font-bold mb-4 ${subheading}`}>{t('about.speciesGuide')}</h3>
          <div className="space-y-5">
            {SPECIES_INFO.map((s) => (
              <div key={s.name} className="flex gap-3">
                <Image src={s.image} alt={s.name} width={48} height={48} className="w-12 h-12 object-contain shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className={`font-semibold text-sm ${subheading}`}>{s.name}</span>
                    {/* REQ-180 a11y(color-contrast)/REQ-224: ダークで slate-400/slate-700 は 4.03:1 と不足。
                        slate-300 へ引き上げて 4.5:1 を満たす（デザイントークンの暗地 muted 範囲内）。
                        light: gray-500(#6b7280) は gray-100 地(#f3f4f6)で 4.39:1 と僅か不足 → gray-600(#4b5563, 6.87:1)。 */}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusChip}`}>{s.status}</span>
                  </div>
                  <div className={`text-xs italic mb-1 ${faint}`}>{s.scientific}</div>
                  <div className={`text-xs leading-relaxed ${body}`}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 外来種法 — REQ-284 FR-284-11 */}
        <div id="law" className={`${card} scroll-mt-20`}>
          <h3 className={`font-bold mb-1 ${subheading}`}>{t('about.law')}</h3>
          <p className={`text-xs mb-4 ${faint}`}>
            {t('about.lawSubtitle')}
          </p>

          <div className="space-y-4">
            {/* アメリカザリガニ
                REQ-323 FR-323-05: 旧 `border-red-100 bg-red-50` / 隣のカードの `orange-*` は
                **種別色ではなくブランド赤系と橙**で、trends のドーナツ（青／橙）と同じ 2 種が
                この面だけピンク／アンバーに見えていた（Round 4 採点 🟡）。枠は種別色の CSS 変数
                （= trends・地図凡例と同じ値）から引き、面は無彩色にしてブランド赤との混同を断つ
                （FR-323-06: 赤は CTA とリンク専用）。 */}
            <div
              className={`rounded-xl border-2 p-4 ${dark ? 'bg-slate-800/40' : 'bg-white'}`}
              style={{ borderColor: `var(${speciesColorVar('american')})` }}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
                <Image src="/images/american.png" alt={t('about.law_info.american.title')} width={24} height={24} className="w-6 h-6 object-contain shrink-0" />
                <span className={`font-bold text-sm ${subheading}`}>{t('about.law_info.american.title')}</span>
                {/* REQ-322 FR-322-03: 種類図鑑と同じ灰チップへ（同じ語が 2 色で出ていた・近似橙の解消） */}
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${statusChip}`}>
                  {t('about.species_info.american.status')}
                </span>
              </div>
              <p className={`text-xs leading-relaxed mb-3 ${body}`}>
                <Trans i18nKey="about.law_info.american.desc" components={[<strong key="0" className={lawRed} />]} />
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {/* REQ-284 FR-284-21: 一般家庭での飼育は手続きなしで可能。禁止事項と並べて明示する。 */}
                <div className={`flex items-center gap-1.5 sm:col-span-2 ${lawOk}`}>
                  <ShieldCheck size={13} aria-hidden="true" />
                  <span>{t('about.law_info.american.allowed')}</span>
                </div>
                <div className={`flex items-center gap-1.5 ${lawRed}`}>
                  <ShieldOff size={13} aria-hidden="true" />
                  <span>{t('about.law_info.american.rule1')}</span>
                </div>
                <div className={`flex items-center gap-1.5 ${lawRed}`}>
                  <ShieldOff size={13} aria-hidden="true" />
                  <span>{t('about.law_info.american.rule2')}</span>
                </div>
              </div>
            </div>

            {/* ウシガエル（上のカードと同じ理由で種別色の CSS 変数から引く） */}
            <div
              className={`rounded-xl border-2 p-4 ${dark ? 'bg-slate-800/40' : 'bg-white'}`}
              style={{ borderColor: `var(${speciesColorVar('bullfrog')})` }}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
                <Image src="/images/bullfrog.png" alt={t('about.law_info.bullfrog.title')} width={24} height={24} className="w-6 h-6 object-contain shrink-0" />
                <span className={`font-bold text-sm ${subheading}`}>{t('about.law_info.bullfrog.title')}</span>
                {/* REQ-322 FR-322-03: 同上（法的区分の違いは語そのものが担う） */}
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${statusChip}`}>
                  {t('about.species_info.bullfrog.status')}
                </span>
              </div>
              <p className={`text-xs leading-relaxed mb-3 ${body}`}>
                <Trans i18nKey="about.law_info.bullfrog.desc" components={[<strong key="0" className={lawRed} />]} />
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className={`flex items-center gap-1.5 ${lawRed}`}>
                  <ShieldOff size={13} aria-hidden="true" />
                  <span>{t('about.law_info.bullfrog.rule1')}</span>
                </div>
                <div className={`flex items-center gap-1.5 ${lawRed}`}>
                  <ShieldOff size={13} aria-hidden="true" />
                  <span>{t('about.law_info.bullfrog.rule2')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 注意書き */}
          <div className={`mt-4 flex items-start gap-2 rounded-xl p-3 border ${
            dark ? 'bg-amber-900/20 border-amber-800/40' : 'bg-yellow-50 border-yellow-200'
          }`}>
            <AlertTriangle size={15} className={`shrink-0 mt-0.5 ${dark ? 'text-amber-400' : 'text-yellow-600'}`} />
            <p className={`text-xs leading-relaxed ${dark ? 'text-amber-300' : 'text-yellow-800'}`}>
              {t('about.law_info.warning')}
            </p>
          </div>

          {/* 環境省リンク */}
          <div className="mt-4 space-y-2">
            <p className={`text-xs font-semibold ${dark ? 'text-slate-400' : 'text-gray-600'}`}>{t('about.relatedLinks')}</p>
            {/* REQ-284 FR-284-23: 2026-08-05 に curl で到達確認。
                旧 .../4toriatsukai/zarigani.html と .../2outline/attention/usigaeru.html は
                いずれも HTTP 404 だったため、現存する環境省ページへ差し替えた。 */}
            {[
              { href: 'https://www.env.go.jp/nature/intro/2outline/regulation/jokentsuki.html', label: t('about.law_info.envLink1') },
              { href: 'https://www.env.go.jp/nature/intro/1law/regulation.html', label: t('about.law_info.envLink2') },
              { href: 'https://www.env.go.jp/nature/intro/', label: t('about.law_info.envLink3') },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1.5 text-xs ${lawRed} hover:underline`}
              >
                <ExternalLink size={12} aria-hidden="true" />
                {link.label}
              </a>
            ))}
          </div>
        </div>

        {/* データ利活用 */}
        <div className={card}>
          <h3 className={`font-bold mb-3 ${subheading}`}>{t('about.dataUsage')}</h3>
          <p className={`text-sm leading-relaxed ${body}`}>
            {t('about.dataUsageDesc')}
          </p>
        </div>

        {/* お問合せ */}
        <div className={card}>
          <h3 className={`font-bold mb-2 ${subheading}`}>{t('about.contact')}</h3>
          <p className={`text-sm mb-4 ${body}`}>
            {t('about.contactDesc')}
          </p>
          <a
            href={FEEDBACK_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('about.contactButton')}
            // REQ-320 FR-320-04: 主 CTA のグラデを手打ち（from-red-500 = #EF4444）していたため、
            // 同じ「押せる赤」が LP(#DC2626)・area(#EF4444)・ここ(グラデ)の 3 系統に割れていた。
            // 唯一の正である btnPrimaryCls（--color-accent トークン）へ寄せる。
            className={`${btnPrimaryCls} flex items-center justify-center gap-2 w-full py-3 text-sm font-bold`}
          >
            <Mail size={16} />
            {t('about.contactButton')}
          </a>
        </div>
      </div>

      <Footer />
      {/* 逃げ幅はフッターの**後ろ**に置く。前に置くと最下部までスクロールしたとき
          フッター最終行が fixed なナビの下に潜る（既存ページの `pb-20` の取り違え）。 */}
      <BottomNavSpacer />
      <PageBottomNav />
    </div>
  )
}
