'use client'

// REQ-330: 調査の本体（地図レイヤー FieldworkLayer が、使うときにだけ読み込む）。
//
// 持つもの: 計画・希少種・送信待ちのフック／計画の地点の番号つきの丸（次の地点は太い輪）／自分の希少種の記録
// （「希少種を自分の地図に表示」を入れたときだけ。入れている間は地図の上端に紫の帯を出す）／「地図で選ぶ」の
// 地図クリック／パネル／シート（シートと投稿フォームは押したときに読む）。
// 入口のボタンと吹き出しからの依頼の受け口は FieldworkLayer にあり、パネルの開閉（mode）もそちらが持つ。
// 地図のチャンク（ホームを開いた全員が読む）に調査の部品を載せないための分け方。
//
// 「希少種あり」の印は、表示を入れたときだけ出す（地図の印・地点の札・地点シートの件数のどれも）。
// 投稿の位置を非公開にする判定は印と関係なく、場所（300 m 以内）で行い、作る直前に DB でも確かめる。
//
// 地図は横スワイプの transform の内側にあるため、固定配置のパネル・シートは body 直下へ出す（PersonalMapLayer と同じ）。

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Lock, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useMapTopSlot } from '@/components/features/map/MapTopSlot'
import { useToastContext } from '@/context/ToastContext'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { btnPrimaryCls } from '@/lib/formStyles'
import { todayLocalISODate } from '@/lib/localDate'
import { supabase } from '@/lib/supabase/client'

import { isKnownRareSpecies } from '../constants'
import { hasOwnRareNear } from '../data/rareSightings'
import type { StopStatus } from '../data/stops'
import { useFieldworkPlan, type StopView } from '../hooks/useFieldworkPlan'
import { useFieldworkQueue } from '../hooks/useFieldworkQueue'
import { useRareSightings, type RareInput } from '../hooks/useRareSightings'
import type { FieldworkRequest } from '../lib/bridge'
import { errorMessage } from '../lib/errors'
import { shortDate as shortPlanDate } from '../lib/planDate'
import { getCurrentFix, type LatLngLite, type RecordPosition } from '../lib/positionRule'
// パネルは本体と一緒に読む（本体を読むのは「調査」を押したときなので、2 段の待ちを作らない）
import FieldworkPanel from './FieldworkPanel'

const StopSheet = dynamic(() => import('./StopSheet'), { ssr: false })
const AbsenceConfirm = dynamic(() => import('./AbsenceConfirm'), { ssr: false })
const RareSightingSheet = dynamic(() => import('./RareSightingSheet'), { ssr: false })
const PostForm = dynamic(() => import('@/components/features/posts/PostForm'), { ssr: false })

/** PC の右パネルの幅（px）。地図の右側の操作子をこの分だけ左へずらす。 */
const PANEL_WIDTH = 400

export type PanelMode = 'closed' | 'open' | 'collapsed'
type PanelTab = 'plan' | 'rare'

type Sheet =
  | { kind: 'stop'; stopId: string }
  | { kind: 'absence'; stopId: string; position: RecordPosition }
  | { kind: 'rare'; stopId: string | null; anchor: LatLngLite | null; position: RecordPosition | null }
  | { kind: 'post'; stopId: string; position: RecordPosition; locked: boolean }

// 計画の地点の丸。番号＋状態（済み=緑の丸とチェック／飛ばし=灰の破線／未調査=白）。
// 次の地点は赤の太い輪（パネルの「この地点を開く」と同じ赤）。
// 希少種ありの紫の錠前は、「希少種を自分の地図に表示」を入れているときだけ付ける。
const stopIconCache = new Map<string, L.DivIcon>()
function stopIcon(n: number, status: StopStatus, rare: boolean, next: boolean): L.DivIcon {
  const key = `${n}|${status}|${rare ? 'r' : ''}|${next ? 'n' : ''}`
  const cached = stopIconCache.get(key)
  if (cached) return cached
  const fill = status === 'done' ? '#047857' : status === 'skipped' ? '#E5E7EB' : '#FFFFFF'
  const stroke = status === 'done' ? '#047857' : status === 'skipped' ? '#4B5563' : '#111827'
  const text = status === 'done' ? '#FFFFFF' : status === 'skipped' ? '#374151' : '#111827'
  const dash = status === 'skipped' ? ' stroke-dasharray="4 3"' : ''
  const size = n >= 10 ? 12 : 14
  const ring = next ? '<circle cx="21" cy="21" r="19" fill="white" stroke="#DC2626" stroke-width="4"/>' : ''
  const check =
    status === 'done'
      ? '<circle cx="32" cy="10" r="7" fill="white" stroke="#047857" stroke-width="1.5"/><path d="M28.6 10.2l2.3 2.3 4.4-4.6" fill="none" stroke="#047857" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
      : status === 'skipped'
        ? '<circle cx="32" cy="10" r="7" fill="white" stroke="#4B5563" stroke-width="1.5"/><path d="M29 7l3 3-3 3M32.5 7l3 3-3 3" fill="none" stroke="#374151" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
        : ''
  const lock = rare
    ? '<circle cx="32" cy="32" r="7.5" fill="#7C3AED" stroke="white" stroke-width="1.5"/><rect x="29" y="31.2" width="6" height="4.6" rx="0.8" fill="white"/><path d="M30.3 31.2v-1.4a1.7 1.7 0 0 1 3.4 0v1.4" fill="none" stroke="white" stroke-width="1.3"/>'
    : ''
  const icon = L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42">
      ${ring}
      <circle cx="21" cy="21" r="16" fill="white"/>
      <circle cx="21" cy="21" r="13" fill="${fill}" stroke="${stroke}" stroke-width="3"${dash}/>
      <text x="21" y="21.5" text-anchor="middle" dominant-baseline="central" font-size="${size}" font-weight="800" fill="${text}"
        font-family="'Hiragino Sans','Noto Sans JP',sans-serif">${n}</text>
      ${check}${lock}
    </svg>`,
    className: '',
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -20],
  })
  stopIconCache.set(key, icon)
  return icon
}

// 希少種の記録: 非公開スポット（紫の丸に錠前）と同じ紫と錠前で、外形をひし形にして見分ける（凡例に 2 つ並べる）。
const RARE_ICON = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
    <path d="M17 1.5 L32.5 17 L17 32.5 L1.5 17 Z" fill="#7C3AED" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="12" y="16" width="10" height="8" rx="1.5" fill="white"/>
    <path d="M14 16v-2.5a3 3 0 0 1 6 0V16" fill="none" stroke="white" stroke-width="2"/>
  </svg>`,
  className: '',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -18],
})

const popupBtn = `inline-flex items-center justify-center min-h-11 px-3 text-xs font-semibold ${btnPrimaryCls}`

/** 「地図で選ぶ」の間だけ、地図を押した位置を地点にする。操作子の上のクリックは拾わない。 */
function PickHandler({ enabled, onPick }: { enabled: boolean; onPick: (p: LatLngLite) => void }) {
  const map = useMapEvents({
    click(e) {
      if (!enabled) return
      const target = e.originalEvent?.target as HTMLElement | null
      if (target?.closest('.leaflet-control')) return
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  useEffect(() => {
    if (!enabled) return
    const el = map.getContainer()
    el.style.cursor = 'crosshair'
    return () => {
      el.style.cursor = ''
    }
  }, [map, enabled])
  return null
}

/** PC の幅（1024px 以上）か。帯の出し方（地図の上に差し込む／地図に重ねる）と「地図で選ぶ」の帯に使う。 */
function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setDesktop(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])
  return desktop
}

/**
 * 「希少種を自分の地図に表示」を入れている間の紫の帯。パネルを畳んでも残し、［隠す］で切る。
 * 画面写真を撮る前に気づけるようにするため。
 * - スマホ: 地図のすぐ上（検索バーの下）に差し込み、地図をその分下げる（地図の上の印を 1 つも隠さない）
 * - PC: 地図に重ね、「地図／写真」の切り替えと同じ中心にそろえる（地図が広いので印を隠しにくい）
 */
function RareBandContent({ onHide, inline }: { onHide: () => void; inline: boolean }) {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      data-testid="fieldwork-rare-band"
      className={`flex items-center gap-2 bg-violet-700 text-[13px] font-bold text-white [word-break:auto-phrase] ${
        inline ? 'min-h-12 w-full justify-center px-3 py-0.5' : 'leaflet-control m-0! rounded-full py-0.5 pr-0.5 pl-3 shadow-lg'
      }`}
    >
      <Lock size={15} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0">{t('fieldwork.rareBand.text')}</span>
      <button
        type="button"
        onClick={onHide}
        className="h-11 min-w-11 shrink-0 rounded-full bg-white px-3.5 text-[13px] font-bold text-violet-800 hover:bg-violet-50"
      >
        {t('fieldwork.rareBand.hide')}
      </button>
    </div>
  )
}

function RareBand({ onHide, desktop }: { onHide: () => void; desktop: boolean }) {
  const map = useMap()
  const slot = useMapTopSlot()
  const inline = !desktop && !!slot
  // 地図のすぐ上に差し込んだ（外した）ら、地図の大きさが変わるので測り直させる（印の位置は動かさない）
  useEffect(() => {
    if (!inline) return
    const id = requestAnimationFrame(() => map.invalidateSize({ pan: false }))
    return () => {
      cancelAnimationFrame(id)
      requestAnimationFrame(() => map.invalidateSize({ pan: false }))
    }
  }, [inline, map])
  if (inline && slot) return createPortal(<RareBandContent onHide={onHide} inline />, slot)
  return (
    <div className="leaflet-top" style={{ left: 0, right: 0, marginTop: '58px', display: 'flex', justifyContent: 'center' }}>
      <RareBandContent onHide={onHide} inline={false} />
    </div>
  )
}

/**
 * PC で「地図で選ぶ」を押している間の帯（地図の下端の中央）。スマホはパネルそのものが同じ帯になる。
 * パネルを上へ戻していても、選んでいる最中だと分かり、［終わる］で終われるようにする（Esc でも終わる）。
 */
function DesktopPickBar({ count, onDone, rightInset }: { count: number; onDone: () => void; rightInset: number }) {
  const { t } = useTranslation()
  return (
    <div className="leaflet-bottom" style={{ left: 0, right: `${rightInset}px`, marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
      <div
        role="status"
        data-testid="fieldwork-pick-bar"
        className="leaflet-control m-0! flex items-center gap-3 rounded-2xl border border-gray-200 bg-white py-2 pr-2 pl-4 text-sm font-semibold text-gray-900 shadow-xl"
      >
        <MapPin size={18} aria-hidden="true" className="shrink-0 text-emerald-700" />
        <span>{t('fieldwork.add.pickBar', { count })}</span>
        <button
          type="button"
          onClick={onDone}
          className="h-11 min-w-11 shrink-0 rounded-xl border-2 border-gray-900 bg-white px-3.5 text-sm font-bold text-gray-900 hover:bg-gray-50"
        >
          {t('fieldwork.add.pickDone')}
        </button>
      </div>
    </div>
  )
}

export interface FieldworkSessionProps {
  userId: string
  mode: PanelMode
  onModeChange: (mode: PanelMode) => void
  /** 吹き出しからの依頼（処理したら onRequestHandled で消してもらう）。 */
  request: FieldworkRequest | null
  onRequestHandled: () => void
  /** 「調査」ボタンに出す進み具合（済み・飛ばし / 全地点）。 */
  onProgress: (progress: { finished: number; total: number }) => void
  onNeedLogin: () => void
}

function FieldworkSession({ userId, mode, onModeChange: setMode, request, onRequestHandled, onProgress, onNeedLogin }: FieldworkSessionProps) {
  const { t } = useTranslation()
  const toast = useToastContext()
  const map = useMap()
  const online = useOnlineStatus()
  const [tab, setTab] = useState<PanelTab>('plan')
  const [pickMode, setPickMode] = useState(false)
  const [showRare, setShowRare] = useState(false)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [mapTop, setMapTop] = useState(0)
  const [desktopPanel, setDesktopPanel] = useState(false)
  const isDesktop = useIsDesktop()
  // いま開いているシート（非同期の確認のあとで、閉じられていないかを見るため）
  const sheetRef = useRef<Sheet | null>(null)
  useEffect(() => {
    sheetRef.current = sheet
  }, [sheet])

  // 送信待ちが送れたら、画面の内容を DB に合わせ直す（sentTick を上げて下の effect で読み直す）
  const [sentTick, setSentTick] = useState(0)
  const onSent = useCallback(() => setSentTick((n) => n + 1), [])
  const queue = useFieldworkQueue(userId, { onSent })
  const plan = useFieldworkPlan(userId, { active: mode !== 'closed', queued: queue.items, enqueue: queue.enqueue })
  const rare = useRareSightings(userId, { active: showRare || (mode === 'open' && tab === 'rare'), enqueue: queue.enqueue })
  const { load: reloadPlan } = plan
  const { refresh: refreshRare } = rare
  useEffect(() => {
    if (sentTick === 0) return
    void reloadPlan()
    void refreshRare()
  }, [sentTick, reloadPlan, refreshRare])
  const { flush } = queue

  // 吹き出しの依頼（非同期の処理）から最新の操作を呼ぶための参照
  const planRef = useRef(plan)
  useEffect(() => {
    planRef.current = plan
  })

  const errorText = useCallback((err: unknown) => errorMessage(err, t), [t])
  const newPlanTitle = useCallback(
    (plannedOn?: string) => t('fieldwork.plan.defaultTitle', { date: shortPlanDate(plannedOn ?? todayLocalISODate()) }),
    [t]
  )

  // パネルを開いたら送信待ちを送る（online イベントと並ぶ、もう 1 つの送るきっかけ）
  useEffect(() => {
    if (mode === 'open') void flush()
  }, [mode, flush])
  const closePanel = useCallback(() => {
    setMode('closed')
    setPickMode(false)
  }, [setMode])
  const collapsePanel = useCallback(() => {
    setMode('collapsed')
    setPickMode(false)
  }, [setMode])

  // PC では右パネルが地図の右側の操作子（右下のボタン列・凡例・帰属表示）に重なるので、その分だけ左へずらす
  useEffect(() => {
    if (mode !== 'open') {
      setDesktopPanel(false)
      return
    }
    const container = map.getContainer()
    const measure = () => setMapTop(Math.max(0, container.getBoundingClientRect().top))
    const mq = window.matchMedia('(min-width: 1024px)')
    const corners = Array.from(container.querySelectorAll<HTMLElement>('.leaflet-right'))
    const shift = () => {
      for (const el of corners) el.style.right = mq.matches ? `${PANEL_WIDTH + 12}px` : ''
      setDesktopPanel(mq.matches)
      measure()
    }
    shift()
    window.addEventListener('resize', shift)
    mq.addEventListener?.('change', shift)
    return () => {
      window.removeEventListener('resize', shift)
      mq.removeEventListener?.('change', shift)
      for (const el of corners) el.style.right = ''
    }
  }, [map, mode])

  // 計画を開いたとき（計画が替わったとき）に、地点が全部見えるよう地図を合わせる。
  // パネルに隠れる側（スマホは下の半分・PC は右）は余白で避ける。地点を足している最中は動かさない。
  const fittedPlanRef = useRef<string | null>(null)
  const { loadedPlanId } = plan
  useEffect(() => {
    if (mode !== 'open' || !loadedPlanId || fittedPlanRef.current === loadedPlanId) return
    fittedPlanRef.current = loadedPlanId
    if (plan.stops.length === 0) return
    const bounds = L.latLngBounds(plan.stops.map((s) => [Number(s.lat), Number(s.lng)] as L.LatLngTuple))
    const desktop = window.matchMedia('(min-width: 1024px)').matches
    map.fitBounds(bounds, {
      paddingTopLeft: L.point(40, 72),
      paddingBottomRight: desktop ? L.point(PANEL_WIDTH + 48, 40) : L.point(40, Math.round(window.innerHeight * 0.52) + 24),
      maxZoom: 15,
      animate: false,
    })
  }, [map, mode, loadedPlanId, plan.stops])

  const addStopAt = useCallback(
    async (p: LatLngLite, source: 'pin' | 'current_location') => {
      try {
        const { total } = await plan.addStops([{ lat: p.lat, lng: p.lng, source }], { newPlanTitle: newPlanTitle() })
        toast.success(t('fieldwork.add.added', { n: total }))
      } catch (err) {
        toast.error(errorText(err))
      }
    },
    [plan, newPlanTitle, toast, t, errorText]
  )

  const addCurrentLocation = useCallback(async () => {
    const fix = await getCurrentFix()
    if (!fix) {
      toast.error(t('fieldwork.add.locateFailed'))
      return
    }
    await addStopAt(fix, 'current_location')
  }, [addStopAt, toast, t])

  // ピン・非公開スポットの吹き出しからの依頼（lib/bridge.ts → FieldworkLayer → ここ）
  useEffect(() => {
    if (!request) return
    onRequestHandled()
    map.closePopup()
    if (request.action === 'recordRare') {
      setSheet({ kind: 'rare', stopId: null, anchor: { lat: request.lat, lng: request.lng }, position: null })
      return
    }
    setMode('open')
    setTab('plan')
    void (async () => {
      try {
        await planRef.current.ensureLoaded()
        const { plan: target, total } = await planRef.current.addStops(
          [
            {
              lat: request.lat,
              lng: request.lng,
              source: request.source,
              sourceId: request.source === 'private_spot' ? (request.sourceId ?? null) : null,
              name: request.name ?? null,
            },
          ],
          { newPlanTitle: newPlanTitle(), onlyActive: true }
        )
        toast.success(t('fieldwork.bridge.added', { title: target?.title ?? '', n: total }))
      } catch (err) {
        toast.error(errorText(err))
      }
    })()
  }, [request, onRequestHandled, map, setMode, newPlanTitle, toast, t, errorText])

  const stopById = useCallback((id: string) => plan.stops.find((s) => s.id === id) ?? null, [plan.stops])

  const openStop = useCallback(
    (stopId: string) => {
      map.closePopup()
      setPickMode(false)
      setSheet({ kind: 'stop', stopId })
    },
    [map]
  )

  /**
   * 「いた」: 投稿フォームを開く直前に、その位置の近く（とその地点）に自分の希少種の記録が無いかを DB でも確かめる。
   * 画面の判定（場所で 300 m）に加えて二重に守る。確かめられなかったときは伏せる側に倒す。
   */
  const openPostForm = useCallback(
    async (stop: StopView, position: RecordPosition) => {
      let locked = stop.rare
      if (!locked && online) {
        try {
          locked = await hasOwnRareNear(supabase, userId, { lat: position.lat, lng: position.lng }, stop.id)
        } catch {
          locked = true
        }
      }
      // 確かめている間に地点シートが閉じられたら、フォームは開かない
      const current = sheetRef.current
      if (!current || current.kind !== 'stop' || current.stopId !== stop.id) return
      setSheet({ kind: 'post', stopId: stop.id, position, locked })
    },
    [online, userId]
  )

  const saveRare = useCallback(
    async (input: RareInput) => {
      const result = await rare.create(input)
      if (result.status === 'saved') {
        // 地点に付かない記録（計画なし・ピンから）も、近くの地点の保護に効かせる
        await plan.markRare(input.stopId, {
          id: result.sighting.id,
          stop_id: result.sighting.stop_id,
          lat: Number(result.sighting.lat),
          lng: Number(result.sighting.lng),
        })
      }
      return result
    },
    [rare, plan]
  )

  // 「地図で選ぶ」は Esc でも終われる（PC。スマホは帯の［終わる］）
  useEffect(() => {
    if (!pickMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickMode(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickMode])

  const showStops = mode !== 'closed' && plan.stops.length > 0
  const progressTotal = plan.stops.length
  const progressFinished = useMemo(() => plan.stops.filter((s) => s.shownStatus !== 'pending').length, [plan.stops])
  useEffect(() => {
    onProgress({ finished: progressFinished, total: progressTotal })
  }, [progressFinished, progressTotal, onProgress])

  // 次の地点（今日の計画で、未調査の最初の地点）。パネルのカードと地図の太い輪に使う
  const isTodayPlan = plan.currentPlan?.planned_on === todayLocalISODate()
  const nextStop = isTodayPlan ? (plan.stops.find((s) => s.shownStatus === 'pending') ?? null) : null

  const activeSheet = sheet
  const sheetStop: StopView | null = activeSheet && 'stopId' in activeSheet && activeSheet.stopId ? stopById(activeSheet.stopId) : null

  return (
    <>
      <PickHandler enabled={pickMode && mode === 'open'} onPick={(p) => void addStopAt(p, 'pin')} />

      {showStops &&
        plan.stops.map((stop) => (
          <Marker
            key={`fw-${stop.id}`}
            position={[Number(stop.lat), Number(stop.lng)]}
            // 「希少種あり」の錠前は表示を入れたときだけ地図に出す（画面写真から生息地が分からないように）
            icon={stopIcon(stop.number, stop.shownStatus, showRare && stop.rare, stop.id === nextStop?.id)}
            title={`${stop.number}. ${stop.name?.trim() || t('fieldwork.stops.defaultName', { n: stop.number })}`}
            zIndexOffset={stop.id === nextStop?.id ? 600 : 500}
          >
            <Popup>
              <div className="text-sm" style={{ minWidth: '200px' }}>
                <div className="font-bold mb-0.5 wrap-break-word">
                  {stop.number}. {stop.name?.trim() || t('fieldwork.stops.defaultName', { n: stop.number })}
                </div>
                <div className="text-sm text-gray-700 mb-2">
                  {stop.shownStatus === 'done' ? '✓ ' : stop.shownStatus === 'skipped' ? '⏭ ' : '○ '}
                  {t(`fieldwork.stops.status.${stop.shownStatus}`)}
                  {showRare && stop.rare && ` · 🔒 ${t('fieldwork.stops.rare')}`}
                </div>
                <button type="button" onClick={() => openStop(stop.id)} className={popupBtn}>
                  {t('fieldwork.marker.openStop')}
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

      {showRare &&
        rare.list.map((r) => (
          <Marker
            key={`fw-rare-${r.id}`}
            position={[Number(r.lat), Number(r.lng)]}
            icon={RARE_ICON}
            title={t('fieldwork.marker.rareTitle')}
          >
            <Popup>
              <div className="text-sm" style={{ minWidth: '200px' }}>
                <div className="font-bold mb-0.5 wrap-break-word">
                  🔒{' '}
                  {r.species_key === 'other'
                    ? r.species_label || t('fieldwork.rareSpecies.other')
                    : isKnownRareSpecies(r.species_key)
                      ? t(`fieldwork.rareSpecies.${r.species_key}`)
                      : r.species_key}
                </div>
                <div className="text-xs text-gray-600">
                  {new Date(r.observed_at).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}
                  {r.count != null && ` · ${t('fieldwork.rareTab.count', { count: r.count })}`}
                </div>
                <div className="text-[11px] text-violet-800 mt-1">{t('fieldwork.rareTab.privateNote')}</div>
              </div>
            </Popup>
          </Marker>
        ))}

      {showRare && <RareBand onHide={() => setShowRare(false)} desktop={isDesktop} />}

      {pickMode && mode === 'open' && isDesktop && (
        <DesktopPickBar count={plan.stops.length} onDone={() => setPickMode(false)} rightInset={desktopPanel ? PANEL_WIDTH + 24 : 0} />
      )}

      {mode === 'open' &&
        typeof document !== 'undefined' &&
        createPortal(
          <FieldworkPanel
            userId={userId}
            plan={plan}
            rare={rare}
            queueItems={queue.items}
            queueFlushing={queue.flushing}
            onFlush={() => void flush()}
            onDiscardQueued={queue.discard}
            online={online}
            tab={tab}
            onTabChange={setTab}
            pickMode={pickMode}
            onPickModeChange={setPickMode}
            showRare={showRare}
            onShowRareChange={setShowRare}
            nextStop={nextStop}
            onOpenStop={openStop}
            onAddCurrentLocation={addCurrentLocation}
            onRecordRare={() => setSheet({ kind: 'rare', stopId: null, anchor: null, position: null })}
            newPlanTitle={newPlanTitle}
            onCollapse={collapsePanel}
            onClose={closePanel}
            mapTop={mapTop}
            panelWidth={PANEL_WIDTH}
          />,
          document.body
        )}

      {activeSheet?.kind === 'stop' &&
        sheetStop &&
        typeof document !== 'undefined' &&
        createPortal(
          <StopSheet
            stop={sheetStop}
            showRare={showRare}
            online={online}
            onClose={() => setSheet(null)}
            onFound={(position) => openPostForm(sheetStop, position)}
            onAbsent={(position) => setSheet({ kind: 'absence', stopId: sheetStop.id, position })}
            onRare={(position) =>
              setSheet({
                kind: 'rare',
                stopId: sheetStop.id,
                anchor: { lat: Number(sheetStop.lat), lng: Number(sheetStop.lng) },
                position,
              })
            }
            onSetStatus={(status, note) => plan.recordStatus(sheetStop.id, status, note === undefined ? {} : { note })}
            errorText={errorText}
          />,
          document.body
        )}

      {activeSheet?.kind === 'absence' &&
        sheetStop &&
        typeof document !== 'undefined' &&
        createPortal(
          <AbsenceConfirm
            stop={sheetStop}
            showRare={showRare}
            position={activeSheet.position}
            onClose={() => setSheet(null)}
            onConfirm={(input) =>
              plan.recordAbsenceAt({
                stopId: sheetStop.id,
                species: input.species,
                surveyDurationMinutes: input.surveyDurationMinutes,
                lat: activeSheet.position.lat,
                lng: activeSheet.position.lng,
                accuracy: activeSheet.position.accuracy,
                locationSource: activeSheet.position.source === 'gps' ? 'gps' : 'manual',
                locationPrivate: sheetStop.rare,
                observedOn: input.observedOn,
              })
            }
            errorText={errorText}
          />,
          document.body
        )}

      {activeSheet?.kind === 'rare' &&
        typeof document !== 'undefined' &&
        createPortal(
          <RareSightingSheet
            stop={activeSheet.stopId ? stopById(activeSheet.stopId) : null}
            showRare={showRare}
            anchor={activeSheet.anchor}
            initialPosition={activeSheet.position}
            mapCenter={(() => {
              const c = map.getCenter()
              return { lat: c.lat, lng: c.lng }
            })()}
            online={online}
            onSave={saveRare}
            onClose={() => setSheet(null)}
            errorText={errorText}
          />,
          document.body
        )}

      {activeSheet?.kind === 'post' &&
        typeof document !== 'undefined' &&
        createPortal(
          <PostForm
            initialPosition={{
              lat: activeSheet.position.lat,
              lng: activeSheet.position.lng,
              accuracy: activeSheet.position.accuracy,
              source: activeSheet.position.source === 'gps' ? 'gps' : 'map',
            }}
            surveyMethod="structured"
            lockedPrivateReason={activeSheet.locked ? t('fieldwork.stop.privateLockReason') : undefined}
            // 圏外で下書きに入ったときの「地点から作った」印。送るときに近くの希少種を DB で確かめ、地点とつなぐ
            fieldworkStopId={activeSheet.stopId}
            onCreated={(postId) => {
              void plan
                .linkPostAt(activeSheet.stopId, postId, 'sighting')
                .then((r) => toast.success(t(r === 'queued' ? 'fieldwork.stop.linkQueued' : 'fieldwork.stop.linked')))
                .catch((err: unknown) => toast.error(errorText(err)))
            }}
            onClose={() => setSheet(null)}
            // 新しい投稿は審査待ちで公開地図には出ないため、ここでは一覧を取り直さない
            onSuccess={() => {}}
            onLoginClick={() => {
              setSheet(null)
              onNeedLogin()
            }}
          />,
          document.body
        )}
    </>
  )
}

export default memo(FieldworkSession)
