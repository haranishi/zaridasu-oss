'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { useMyActivity } from '@/hooks/posts/useMyActivity'
import { buildActivityCalendar, legendSteps, type ActivityDay, type LegendStep } from '@/lib/activityCalendar'
import { addDays, jstToday, weekdayMonday0 } from '@/lib/jstDate'
import { INFO_TYPES } from '@/lib/constants'
import { cardCls, faint, heading } from '@/lib/themeClasses'
import { btnPrimaryCls, btnRetryCls } from '@/lib/formStyles'
import { Skeleton } from '@/components/ui/Skeleton'
import styles from './ActivityGrass.module.css'

const INTL_LOCALE: Record<string, string> = { ja: 'ja-JP', en: 'en-US', ko: 'ko-KR', zh: 'zh-CN' }
/** 曜日の名前を付ける行（月・水・金）。ほかの行は、読み上げだけに出す。 */
const SHOWN_WEEKDAYS = [0, 2, 4]
/** 曜日の名前を作るための、月曜から始まる1週間（日付は曜日だけが意味を持つ）。 */
const SAMPLE_WEEK = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']
/** 一覧は、新しい7日ぶんから出し、「さらに表示」で14日ずつ足す（高さを固定した内側のスクロールは、指で扱いにくいので使わない）。 */
const LIST_FIRST = 7
const LIST_MORE = 14

interface ActivityGrassProps {
  userId: string
  /** 今日（日本時間のYYYY-MM-DD）。テストで固定するときだけ渡す。 */
  today?: string
}

/**
 * マイページの「活動の記録」。過去1年に記録を投稿した日を、GitHubの貢献グラフのように草で見せる。
 * 本人だけが見る。連続日数・途切れ・比較・順位は出さない。濃さは1日5件で頭打ち。
 */
export default function ActivityGrass({ userId, today: todayProp }: ActivityGrassProps) {
  const { t, i18n } = useTranslation()
  const { rows, loading, error, retry } = useMyActivity(userId)
  const [today] = useState(() => todayProp ?? jstToday())
  const calendar = useMemo(() => (rows ? buildActivityCalendar(rows, today) : null), [rows, today])
  const [picked, setPicked] = useState<string | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [listShown, setListShown] = useState(LIST_FIRST)
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef(new Map<string, HTMLDivElement>())
  const pendingFocus = useRef(false)

  const locale = INTL_LOCALE[i18n.language?.slice(0, 2)] ?? 'ja-JP'
  const fmt = useMemo(() => ({
    day: new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' }),
    dayWithYear: new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' }),
    month: new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }),
    weekday: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'Asia/Tokyo' }),
  }), [locale])
  // 去年の日付だけ、年も付ける（一覧・詳細・読み上げで、いつの日か分かるように）
  const dayText = (date: string) => (date.slice(0, 4) === today.slice(0, 4) ? fmt.day : fmt.dayWithYear).format(new Date(`${date}T00:00:00+09:00`))
  const monthText = (month: number) => fmt.month.format(new Date(Date.UTC(2026, month - 1, 1)))
  const weekdayText = (weekday: number) => fmt.weekday.format(new Date(`${SAMPLE_WEEK[weekday]}T00:00:00+09:00`))

  // 選んだ日は、押した日を優先し、まだ何も選んでいなければ最新の活動日。Tab で入る位置も、選んだ日（なければ今日）。
  const selected = picked ?? calendar?.activeDays[0]?.date ?? null
  const focusDate = focused ?? selected ?? today
  const selectedDay: ActivityDay | null = selected && calendar ? calendar.byDate[selected] ?? null : null

  // 横に送れる側の端に、うすい影を出す（続きがあることの手がかり）。再描画せず、枠の属性だけを書き換える
  const updateEdges = useCallback(() => {
    const scroller = scrollerRef.current
    const wrap = wrapRef.current
    if (!scroller || !wrap) return
    const max = scroller.scrollWidth - scroller.clientWidth
    wrap.dataset.moreLeft = String(scroller.scrollLeft > 2)
    wrap.dataset.moreRight = String(scroller.scrollLeft < max - 2)
  }, [])

  // はじめは、いちばん新しい側（右端）を見せる
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (scroller) scroller.scrollLeft = scroller.scrollWidth
    updateEdges()
  }, [calendar, updateEdges])

  useEffect(() => {
    window.addEventListener('resize', updateEdges)
    return () => window.removeEventListener('resize', updateEdges)
  }, [updateEdges])

  // 矢印キーで動いたときだけ、新しい位置へフォーカスを移す
  useEffect(() => {
    if (!pendingFocus.current) return
    pendingFocus.current = false
    cellRefs.current.get(focusDate)?.focus()
  }, [focusDate])

  if (loading) {
    return (
      <section className={cardCls()} aria-busy="true" aria-label={t('activityGrass.title')}>
        <Skeleton className="h-5 w-32 mb-3" />
        <Skeleton className="h-4 w-56 mb-4" />
        <Skeleton className="h-28 w-full" />
      </section>
    )
  }

  if (error || !calendar) {
    return (
      <section className={cardCls()} aria-labelledby={`${listId}-title`}>
        <h3 id={`${listId}-title`} className={`text-sm font-semibold mb-3 ${heading()}`}>{t('activityGrass.title')}</h3>
        <p role="alert" className={`text-sm mb-3 ${faint()}`}>{t('activityGrass.loadError')}</p>
        <button type="button" onClick={retry} className={btnRetryCls(false)}>{t('common.retry')}</button>
      </section>
    )
  }

  const choose = (date: string) => {
    setPicked(date)
    setFocused(date)
  }
  const revealInGrid = (date: string) => {
    const cell = cellRefs.current.get(date)
    const scroller = scrollerRef.current
    if (cell && scroller) scroller.scrollLeft = Math.max(0, cell.offsetLeft - scroller.clientWidth / 2)
  }
  // 一覧から選んだら、表の位置を合わせ、画面の外にある詳細を見える位置まで動かす（動かすのは外にあるときだけ。一瞬で動かす）
  const pickFromList = (date: string) => {
    choose(date)
    revealInGrid(date)
    detailRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' })
  }
  const clamp = (date: string) => (date < calendar.start ? calendar.start : date > calendar.end ? calendar.end : date)
  const move = (from: string, target: string) => {
    const next = clamp(target)
    if (next === from) return
    pendingFocus.current = true
    setFocused(next)
  }
  // 日付の順に動く。上下は前後の日、左右は前後の週の同じ曜日
  const onCellKeyDown = (event: KeyboardEvent<HTMLDivElement>, date: string) => {
    const weekday = weekdayMonday0(date)
    switch (event.key) {
      case 'ArrowUp': move(date, addDays(date, -1)); break
      case 'ArrowDown': move(date, addDays(date, 1)); break
      case 'ArrowLeft': move(date, addDays(date, -7)); break
      case 'ArrowRight': move(date, addDays(date, 7)); break
      case 'Home': move(date, addDays(date, -weekday)); break
      case 'End': move(date, addDays(date, 6 - weekday)); break
      case 'Enter':
      case ' ': choose(date); break
      default: return
    }
    event.preventDefault()
  }

  // 凡例の件数。範囲・以上の言い回しは言語ごと
  const stepLabel = (step: LegendStep) =>
    step.to === null ? t('activityGrass.legendOrMore', { n: step.from })
      : step.to > step.from ? t('activityGrass.legendRange', { from: step.from, to: step.to })
        : String(step.from)

  const typeText = (byType: Record<string, number>) => {
    const order = INFO_TYPES.map(type => type.value as string)
    return Object.entries(byType)
      .sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
      .map(([type, count]) => t('activityGrass.typeCount', { type: t(`infoType.${type}`, { defaultValue: type }), count }))
      .join(t('activityGrass.itemSeparator'))
  }

  const hasRecords = calendar.totalDays > 0
  const legend = legendSteps()

  return (
    <section className={`${cardCls()} ${styles.root}`} aria-labelledby={`${listId}-title`}>
      <h3 id={`${listId}-title`} className={`text-sm font-semibold ${hasRecords ? 'mb-1' : 'mb-3'} ${heading()}`}>{t('activityGrass.title')}</h3>
      {hasRecords && (
        <>
          <p className={`${styles.summary} ${heading()}`}>
            <Trans i18nKey="activityGrass.summary" values={{ days: calendar.totalDays, records: calendar.totalRecords }} components={{ big: <span className={styles.big} /> }} />
          </p>
          <p className={`text-xs mt-1 mb-4 ${faint()}`}>{t('activityGrass.note')}</p>
        </>
      )}

      <div ref={wrapRef} className={styles.scrollWrap} data-more-left="false" data-more-right="false">
      <div ref={scrollerRef} className={styles.scroller} onScroll={updateEdges}>
        <div className={styles.table}>
          <div className={styles.monthRow} aria-hidden="true">
            <span className={styles.corner} />
            {calendar.monthLabels.map(label => (
              <span key={label.week} className={styles.month} style={{ gridColumn: label.week + 2 }}>{monthText(label.month)}</span>
            ))}
          </div>
          <div role="grid" aria-label={t('activityGrass.gridLabel')} className={styles.grid}>
            {calendar.rows.map((cells, weekday) => (
              <div key={weekday} role="row" className={styles.row}>
                <span role="rowheader" className={styles.weekday}>
                  <span className={SHOWN_WEEKDAYS.includes(weekday) ? undefined : 'sr-only'}>{weekdayText(weekday)}</span>
                </span>
                {cells.map(({ week, day }) => (
                  // 矢印キーの操作は、押された日を基準に onCellKeyDown がまとめて受ける（Tab の停止は、選んだ日の1つだけ）
                  <div
                    key={day.date}
                    ref={el => { if (el) cellRefs.current.set(day.date, el); else cellRefs.current.delete(day.date) }}
                    role="gridcell"
                    tabIndex={day.date === focusDate ? 0 : -1}
                    aria-selected={day.date === selected}
                    aria-label={t(day.count > 0 ? 'activityGrass.cellLabel' : 'activityGrass.cellLabelNone', { date: dayText(day.date), count: day.count })}
                    data-date={day.date}
                    data-level={day.level}
                    className={styles.cell}
                    style={{ gridColumn: week + 2 }}
                    onClick={() => choose(day.date)}
                    onKeyDown={event => onCellKeyDown(event, day.date)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>

      <div className={`${styles.legend} mt-3`} aria-hidden="true">
        <span>{t('activityGrass.legendTitle')}</span>
        {legend.map(step => (
          <span key={step.level} className={styles.legendItem}>
            <span className={styles.swatch} data-level={step.level} />
            {stepLabel(step)}
          </span>
        ))}
      </div>

      {hasRecords && (
        <p className={styles.hint}>
          <span className={styles.hintScroll}>{t('activityGrass.hintScroll')}</span>
          {t('activityGrass.hintSelect')}
        </p>
      )}

      {!hasRecords ? (
        <div className="mt-4">
          <p className={`text-sm mb-3 ${faint()}`}>{t('activityGrass.empty')}</p>
          <Link href="/map?post=1" className={`${btnPrimaryCls} inline-flex items-center justify-center px-5 py-3 min-h-11 font-bold`}>{t('activityGrass.emptyAction')}</Link>
        </div>
      ) : (
        <>
          <div ref={detailRef} role="status" aria-live="polite" className={`${styles.detail} mt-4`}>
            {selectedDay && (
              <>
                <p className={styles.detailTitle}>
                  <span className={styles.detailLabel}>{t(picked ? 'activityGrass.detailLabel' : 'activityGrass.detailLabelLatest')}</span>
                  {t(selectedDay.count > 0 ? 'activityGrass.detailDay' : 'activityGrass.detailNone', { date: dayText(selectedDay.date), count: selectedDay.count })}
                </p>
                {selectedDay.count > 0 && (
                  <>
                    <p>{t('activityGrass.detailBreakdown', { items: typeText(selectedDay.byType) })}</p>
                    {selectedDay.pending > 0 && <p>{t('activityGrass.detailPending', { count: selectedDay.pending })}</p>}
                  </>
                )}
              </>
            )}
          </div>
          <div className="mt-2">
            <button
              type="button"
              className={styles.listToggle}
              aria-expanded={listOpen}
              aria-controls={listId}
              onClick={() => { setListOpen(open => !open); setListShown(LIST_FIRST) }}
            >
              {t(listOpen ? 'activityGrass.listClose' : 'activityGrass.listOpen')}
              <ChevronDown aria-hidden="true" size={16} className={styles.chevron} />
            </button>
            {listOpen && (
              <>
                <ul id={listId} className={styles.list}>
                  {calendar.activeDays.slice(0, listShown).map(day => (
                    <li key={day.date}>
                      <button type="button" className={styles.listItem} aria-pressed={day.date === selected} onClick={() => pickFromList(day.date)}>
                        <span>{dayText(day.date)}</span>
                        <span>{t('activityGrass.listCount', { count: day.count })}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {calendar.activeDays.length > listShown && (
                  <button type="button" className={styles.listMore} onClick={() => setListShown(shown => shown + LIST_MORE)}>
                    {t('activityGrass.listMore', { count: calendar.activeDays.length - listShown })}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  )
}
