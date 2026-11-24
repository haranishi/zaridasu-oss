'use client'

// REQ-330: パネルとシートで共通に使う小さな部品。地図のレイヤー（FieldworkLayer）からは import しない
// （パネル・シートと一緒に、押したときに読み込まれる）。
//
// 色だけで状態を表さない（REQ-224）。済み=緑の丸＋チェック＋「済み」、飛ばし=灰の破線の丸＋「飛ばし」、
// 未調査=白い丸＋「未調査」。希少種と非公開は REQ-329 の非公開スポットと同じ紫（#7C3AED）と錠前で表す。
// 「希少種あり」の印（錠前・札・件数）は、「希少種を自分の地図に表示」を入れたときだけ出す（画面写真から
// 場所が漏れないように）。呼び出し側が showRare と合わせて rare を渡す。
// 日本語は語の途中で折らない: パネルとシートの外枠に word-break: auto-phrase と text-wrap: pretty を付ける
// （REQ-325 のオンボーディングと同じ。Chromium の BudouX が文節で折る。Safari では無視されるだけ）。

import { useRef, type ReactNode } from 'react'
import { AlertTriangle, Check, Loader2, Lock, MapPin, SkipForward, X } from 'lucide-react'
import type { TFunction } from 'i18next'
import { Trans, useTranslation } from 'react-i18next'

import { useTheme } from '@/context/ThemeContext'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useFocusTrap } from '@/hooks/useFocusTrap'

import type { StopStatus } from '../data/stops'
import type { RecordPosition } from '../lib/positionRule'

/** ライト／ダークの配色（QuickSaveSheet と同じ考え方）。 */
export function tone(dark: boolean) {
  return {
    card: dark ? 'bg-slate-900 text-slate-100' : 'bg-white text-gray-900',
    muted: dark ? 'text-slate-400' : 'text-gray-600',
    subtle: dark ? 'bg-slate-800' : 'bg-gray-50',
    border: dark ? 'border-slate-700' : 'border-gray-200',
    btn: dark
      ? 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700'
      : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50',
    input: dark
      ? 'border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-400'
      : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500',
    violet: dark ? 'text-violet-300' : 'text-violet-800',
  }
}

export type Tone = ReturnType<typeof tone>

/** 日本語を文節で折る（語の途中で改行しない）。パネル・シートの外枠に付ける。 */
export const phraseWrap = '[word-break:auto-phrase] text-pretty'

/** 区切りの見出し（15px 以上の太字・上に区切り線）。 */
export const sectionHeading = 'text-[15px] font-bold'

/** 小さめのボタン（44px のタップ域）。 */
export const smallBtn =
  'inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500'

/** 地点の番号の丸。済み=緑＋チェック、飛ばし=灰の破線、未=白。希少種ありは紫の錠前を添える。 */
export function StopBadge({ number, status, rare = false, size = 'md' }: { number: number; status: StopStatus; rare?: boolean; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'w-10 h-10 text-base' : 'w-8 h-8 text-sm'
  const look =
    status === 'done'
      ? 'bg-emerald-700 text-white border-2 border-emerald-700'
      : status === 'skipped'
        ? 'bg-gray-200 text-gray-700 border-2 border-dashed border-gray-500'
        : 'bg-white text-gray-900 border-2 border-gray-900'
  return (
    <span aria-hidden="true" className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-bold ${box} ${look}`}>
      {number}
      {status === 'done' && (
        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-emerald-700 ring-1 ring-emerald-700">
          <Check size={11} strokeWidth={3} />
        </span>
      )}
      {status === 'skipped' && (
        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-gray-700 ring-1 ring-gray-500">
          <SkipForward size={9} strokeWidth={3} />
        </span>
      )}
      {rare && (
        <span data-testid="fieldwork-rare-lock" className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-white ring-1 ring-white">
          <Lock size={9} strokeWidth={3} />
        </span>
      )}
    </span>
  )
}

/** 状態の文字（記号つき）。色が分からなくても読める。屋外で読めるよう 14px。 */
export function StatusText({ status, dark }: { status: StopStatus; dark: boolean }) {
  const { t } = useTranslation()
  const cls =
    status === 'done'
      ? dark ? 'text-emerald-300' : 'text-emerald-800'
      : dark ? 'text-slate-300' : 'text-gray-700'
  const icon = status === 'done' ? '✓' : status === 'skipped' ? '⏭' : '○'
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap ${cls}`}>
      <span aria-hidden="true">{icon}</span>
      {t(`fieldwork.stops.status.${status}`)}
    </span>
  )
}

/** 「希少種あり」の印（紫の錠前＋文字）。「希少種を自分の地図に表示」を入れているときだけ出す。 */
export function RareChip({ dark }: { dark: boolean }) {
  const { t } = useTranslation()
  return (
    <span
      data-testid="fieldwork-rare-chip"
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold whitespace-nowrap ${
        dark ? 'bg-violet-500/20 text-violet-200' : 'bg-violet-100 text-violet-800'
      }`}
    >
      <Lock size={13} aria-hidden="true" />
      {t('fieldwork.stops.rare')}
    </span>
  )
}

/**
 * 安全の一言（地点シートと「まとめて案内」の前に毎回出す）。⚠ の下に 3 行の箇条書きにして、語の途中で折らない。
 * 現地で読むものなので 15px（見出しは太字）。屋外の明るさでも読める大きさにする。
 */
export function SafetyNote({ dark, className = '' }: { dark: boolean; className?: string }) {
  const { t } = useTranslation()
  const color = dark ? 'text-amber-200' : 'text-amber-900'
  return (
    <div data-testid="fieldwork-safety" className={`text-[15px] leading-snug ${color} ${className}`}>
      <p className="flex items-center gap-1.5 font-bold">
        <AlertTriangle size={16} aria-hidden="true" className="shrink-0" />
        {t('fieldwork.safety.title')}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-6">
        <li>{t('fieldwork.safety.water')}</li>
        <li>{t('fieldwork.safety.children')}</li>
        <li>{t('fieldwork.safety.trespass')}</li>
      </ul>
    </div>
  )
}

/** 「あなたと運営だけ」の一言（紫の錠前）。 */
export function PrivateNote({ dark, text, className = '' }: { dark: boolean; text: string; className?: string }) {
  return (
    <p className={`flex items-start gap-1.5 text-sm leading-relaxed ${dark ? 'text-violet-200' : 'text-violet-800'} ${className}`}>
      <Lock size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </p>
  )
}

/**
 * 距離の書き方。1000 m 未満は 10 m 単位（「60m」）、1000 m 以上は km で小数 1 桁（「2.8km」。10 km 以上は整数）。
 * 「2844m」のような細かすぎる数を出さない。「約」は翻訳文の側に付ける。
 */
export function formatDistance(m: number): string {
  const meters = Number.isFinite(m) && m > 0 ? m : 0
  const rounded = Math.round(meters / 10) * 10
  if (rounded < 1000) return `${Math.max(10, rounded)}m`
  const km = meters / 1000
  return km >= 10 ? `${Math.round(km)}km` : `${(Math.round(km * 10) / 10).toFixed(1)}km`
}

/** 数と単位を折り返さない固まり（翻訳文の <nw>…</nw>）。 */
const NOWRAP = { nw: <span className="whitespace-nowrap" /> }

/**
 * 記録に使う位置（確定前に、現在地か地点の座標かを見せる）。1 行目に何を使うか、2 行目にその理由を書く。
 * `reserveReasonLine` のときは理由が無くても 2 行目の高さを取っておき、位置が更新されても下のボタンを動かさない。
 */
export function PositionLine({
  position,
  locating,
  dark,
  reserveReasonLine = false,
}: {
  position: RecordPosition | null
  locating: boolean
  dark: boolean
  reserveReasonLine?: boolean
}) {
  const { t } = useTranslation()
  let main: ReactNode
  let reason: ReactNode = null
  if (locating) {
    main = t('fieldwork.position.locating')
  } else if (!position) {
    main = t('fieldwork.position.freeFailed')
  } else if (position.source === 'gps') {
    main =
      position.accuracy == null ? (
        t('fieldwork.position.gpsNoAccuracy')
      ) : (
        <Trans i18nKey="fieldwork.position.gps" values={{ m: Math.round(position.accuracy) }} components={NOWRAP} />
      )
  } else if (position.reason === 'manual') {
    main = t('fieldwork.position.manual')
  } else {
    main = t('fieldwork.position.map')
    reason =
      position.reason === 'far' ? (
        <Trans i18nKey="fieldwork.position.reasonFar" values={{ distance: formatDistance(position.distanceM ?? 0) }} components={NOWRAP} />
      ) : (
        t(position.reason === 'inaccurate' ? 'fieldwork.position.reasonInaccurate' : 'fieldwork.position.reasonNoFix')
      )
  }
  return (
    <div role="status" data-testid="fieldwork-position" className={`flex items-start gap-1.5 text-sm leading-snug ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
      {locating ? (
        <Loader2 size={15} aria-hidden="true" className="mt-0.5 shrink-0 animate-spin" />
      ) : (
        <MapPin size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
      )}
      <span className="min-w-0">
        <span className="block">{main}</span>
        {(reason || reserveReasonLine) && (
          <span className="block min-h-[1.375em]" data-testid="fieldwork-position-reason">
            {reason}
          </span>
        )}
      </span>
    </div>
  )
}

/**
 * 記録のシートの枠（スマホは下から出るシート、PC は中央）。地図の上に重ね、閉じると調査パネルに戻る。
 * 背景を押すと閉じる（背景は読み上げの対象外のボタン）。Esc でも閉じる。フォーカスは中に閉じ込める。
 */
export function SheetFrame({
  titleId,
  title,
  icon,
  onClose,
  children,
  testId,
}: {
  titleId: string
  title: ReactNode
  icon?: ReactNode
  onClose: () => void
  children: ReactNode
  testId?: string
}) {
  const { t } = useTranslation()
  const { dark } = useTheme()
  const c = tone(dark)
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref)
  useEscapeKey(onClose)
  useBodyScrollLock()
  return (
    <div className="fixed inset-0 z-430 flex items-end md:items-center justify-center">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('fieldwork.sheetClose')}
        onClick={onClose}
        className={`absolute inset-0 cursor-default ${dark ? 'bg-black/70' : 'bg-black/50'}`}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        className={`relative ${c.card} ${phraseWrap} w-full md:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className={`sticky top-0 z-10 flex items-center justify-between gap-2 border-b px-5 py-3 ${c.card} ${c.border}`}>
          <h2 id={titleId} className="flex min-w-0 items-center gap-2 text-lg font-bold">
            {icon}
            <span className="min-w-0 wrap-break-word">{title}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('fieldwork.sheetClose')}
            className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full ${dark ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-4 px-5 pt-4 pb-5">{children}</div>
      </div>
    </div>
  )
}

/** 地点の表示名（名前が無ければ「地点 N」）。 */
export function stopName(stop: { name: string | null; number: number }, t: TFunction): string {
  return stop.name?.trim() || t('fieldwork.stops.defaultName', { n: stop.number })
}

/** 希少種の表示名。一覧に無い古い key はそのまま出す。「その他」は書いた名前。 */
export function rareSpeciesName(
  row: { species_key: string; species_label: string | null },
  t: (key: string) => string,
  known: (key: string) => boolean
): string {
  if (row.species_key === 'other') return row.species_label?.trim() || t('fieldwork.rareSpecies.other')
  return known(row.species_key) ? t(`fieldwork.rareSpecies.${row.species_key}`) : row.species_key
}
