'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import L from 'leaflet'
import { useMap, useMapEvents } from 'react-leaflet'
import { Droplets } from 'lucide-react'
import type { FeatureCollection } from 'geojson'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { NEARBY_WATER_CONFIG } from '@/lib/constants'
import { supabase } from '@/lib/supabase/client'
import { requestFieldwork } from '@/features/fieldwork/lib/bridge'
import { candidatesBounds, createWaterCandidates, expandWaterBounds, isWaterPosition, parseWaterFeatures } from '../lib/candidates'
import type { WaterBounds, WaterCandidate, WaterFeature, WaterPosition } from '../types'

const NearbyWaterPanel = dynamic(() => import('./NearbyWaterPanel'), { ssr: false })
const WaterReportSheet = dynamic(() => import('../WaterReportSheet'), { ssr: false })
const AuthModal = dynamic(() => import('@/components/modals/AuthModal'), { ssr: false })

type Status = 'idle' | 'loading' | 'ready' | 'empty' | 'error'
type PendingAction = { kind: 'plan'; candidate: WaterCandidate } | { kind: 'report'; position: WaterPosition }

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** 取得・選択をMapViewのフィルタと分離。公開記録の失敗でも水域自体は残す。 */
export default function NearbyWaterLayer() {
  const map = useMap()
  const { t } = useTranslation()
  const { user } = useAuth()
  const layerRef = useRef<L.GeoJSON | null>(null)
  const rangeRef = useRef<L.Circle | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const secondaryAbortRef = useRef<AbortController | null>(null)
  const authUserRef = useRef<string | null>(null)
  const mountedRef = useRef(false)
  const closeAuthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const visibleRef = useRef(true)
  const controlRef = useRef<HTMLDivElement | null>(null)
  const listButtonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [visible, setVisible] = useState(true)
  const [candidates, setCandidates] = useState<WaterCandidate[]>([])
  const [selected, setSelected] = useState<WaterCandidate | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [pickReport, setPickReport] = useState(false)
  const [reportPosition, setReportPosition] = useState<WaterPosition | null>(null)
  const [reportFor, setReportFor] = useState<{ userId: string; position: WaterPosition } | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [publicReadFailed, setPublicReadFailed] = useState(false)
  const [communityReadFailed, setCommunityReadFailed] = useState(false)
  const [secondaryLoading, setSecondaryLoading] = useState(false)

  const setLayerVisible = (next: boolean) => { visibleRef.current = next; setVisible(next) }

  const removeExisting = () => {
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null }
    if (rangeRef.current) { map.removeLayer(rangeRef.current); rangeRef.current = null }
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      const request = abortRef.current
      abortRef.current = null
      request?.abort()
      secondaryAbortRef.current?.abort()
      if (closeAuthTimerRef.current) clearTimeout(closeAuthTimerRef.current)
      if (layerRef.current) map.removeLayer(layerRef.current)
      if (rangeRef.current) map.removeLayer(rangeRef.current)
    }
  }, [map])

  useEffect(() => {
    const control = controlRef.current
    if (!control) return
    // この列では mousedown / touchstart / dblclick / contextmenu / wheel が外へ伝わらない。
    // Next の React は根が document なので、列内では onMouseDown / onWheel でなく onClick / onChange を使う。
    L.DomEvent.disableScrollPropagation(control)
    L.DomEvent.disableClickPropagation(control)
  }, [])

  useEffect(() => {
    const container = map.getContainer()
    if (!panelOpen) {
      delete container.dataset.waterList
      return
    }
    container.dataset.waterList = 'open'
    return () => { delete container.dataset.waterList }
  }, [map, panelOpen])

  useEffect(() => {
    const previousUser = authUserRef.current
    authUserRef.current = user?.id ?? null
    if (previousUser && previousUser !== authUserRef.current) {
      setReportFor(null)
      setReportPosition(null)
      setPendingAction(null)
      setShowAuth(false)
      setPickReport(false)
      return
    }
    if (!user || !pendingAction) return
    setShowAuth(false)
    setPendingAction(null)
    if (pendingAction.kind === 'report') setReportFor({ userId: user.id, position: pendingAction.position })
    else {
      const candidate = pendingAction.candidate
      const userId = user.id
      // Auth切替で後ろの兄弟FieldworkLayerも作り直される。全effectの購読が揃ってから送る。
      queueMicrotask(() => {
        if (mountedRef.current && authUserRef.current === userId) requestFieldwork({ action: 'addStop', source: 'pin', ...candidate.position, name: (candidate.name ?? t('water.genericName')).slice(0, 60) })
      })
    }
  }, [user, pendingAction, t])

  useEffect(() => {
    if (!pickReport) return
    const container = map.getContainer()
    const previousCursor = container.style.cursor
    container.style.cursor = 'crosshair'
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPickReport(false)
    }
    document.addEventListener('keydown', onEscape)
    return () => { container.style.cursor = previousCursor; document.removeEventListener('keydown', onEscape) }
  }, [map, pickReport])

  const closePanel = () => {
    if (!panelOpen) return
    const hadFocus = panelRef.current?.contains(document.activeElement) ?? false
    setPanelOpen(false)
    if (hadFocus) listButtonRef.current?.focus()
  }

  const openReport = (position: WaterPosition) => {
    if (!isWaterPosition(position)) return
    setReportPosition(position)
    setPickReport(false)
    closePanel()
    if (user) setReportFor({ userId: user.id, position })
    else { setPendingAction({ kind: 'report', position }); setShowAuth(true) }
  }

  useMapEvents({
    click(event) {
      if (!pickReport || (event.originalEvent?.target as HTMLElement | null)?.closest('.leaflet-control, [data-water-panel]')) return
      openReport({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })

  const startReport = () => { closePanel(); setReportFor(null); setPickReport(true) }

  const showSearchRange = (center: WaterPosition) => {
    const range = L.circle(center, { radius: NEARBY_WATER_CONFIG.radiusM, color: '#64748b', weight: 1, dashArray: '5 5', fill: false, interactive: false })
    rangeRef.current = range
    range.addTo(map)
    map.fitBounds(range.getBounds(), { padding: [24, 24], maxZoom: 14 })
    setLayerVisible(true)
  }

  const makeLayer = (features: WaterFeature[]) => {
    const collection: FeatureCollection = { type: 'FeatureCollection', features }
    return L.geoJSON(collection, {
      style: () => ({ ...NEARBY_WATER_CONFIG.style }),
      pointToLayer: (_feature, latlng) => L.circleMarker(latlng, { ...NEARBY_WATER_CONFIG.style, radius: 7 }),
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.name
        // 名称は利用者／外部データ由来で、LeafletのbindPopupはHTML文字列を解釈するため必ずエスケープする。
        layer.bindPopup(`<div class="text-sm font-medium">💧 ${escapeHtml(typeof name === 'string' ? name : t('map.nearbyWater.genericName'))}</div>`)
      },
    })
  }

  const handleFind = async () => {
    abortRef.current?.abort()
    secondaryAbortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStatus('loading')
    const center = map.getCenter()
    const timeout = setTimeout(() => controller.abort(), 35_000)
    const accelerator = import('../lib/acceleratedCandidates')
    void accelerator.then(module => module.warmWaterGeometry()).catch(() => {})
    try {
      const res = await fetch(`/api/nearby-water?lat=${center.lat.toFixed(5)}&lng=${center.lng.toFixed(5)}&radius=${NEARBY_WATER_CONFIG.radiusM}`, { signal: controller.signal })
      if (abortRef.current !== controller) return
      if (!res.ok) throw new Error('nearby-water unavailable')
      const data = await res.json() as { features?: unknown; meta?: { degraded?: boolean } } | null
      if (abortRef.current !== controller) return
      if (controller.signal.aborted || !data || data.meta?.degraded || !Array.isArray(data.features)) throw new Error('nearby-water unavailable')
      const features = parseWaterFeatures(data.features)
      const nextCandidates = createWaterCandidates(features, [], center, [], false)
      const layer = features.length > 0 ? makeLayer(features) : null
      removeExisting()
      layerRef.current = layer
      layer?.addTo(map)
      showSearchRange(center)
      setCandidates(nextCandidates)
      setSelected(null)
      setPublicReadFailed(false)
      setCommunityReadFailed(false)
      setSecondaryLoading(true)
      setStatus(features.length > 0 ? 'ready' : 'empty')

      // OSMの成功を先に表示。別データの失敗で検索や前回結果を壊さない。
      const secondary = new AbortController()
      secondaryAbortRef.current = secondary
      const rangeBounds = rangeRef.current!.getBounds()
      const searchBounds: WaterBounds = { minLat: rangeBounds.getSouth(), maxLat: rangeBounds.getNorth(), minLng: rangeBounds.getWest(), maxLng: rangeBounds.getEast() }
      void (async () => {
        try {
          const { loadPublicWaterSurveyPoints, loadCommunityWaterBodies } = await import('../data/publicData')
          const communityResult = await Promise.allSettled([loadCommunityWaterBodies(supabase, expandWaterBounds(searchBounds), secondary.signal)])
          if (secondary.signal.aborted || secondaryAbortRef.current !== secondary) return
          const community = communityResult[0].status === 'fulfilled' ? communityResult[0].value : []
          setCommunityReadFailed(communityResult[0].status === 'rejected')
          const inRange = (candidate: WaterCandidate) => candidate.source === 'osm' || candidate.distanceM <= NEARBY_WATER_CONFIG.radiusM
          const combined = createWaterCandidates(features, community, center, [], false).filter(inRange)
          const bounds = candidatesBounds(combined.map(c => c.feature), searchBounds)
          const publicResult = await Promise.allSettled([loadPublicWaterSurveyPoints(supabase, bounds, secondary.signal)])
          if (secondary.signal.aborted || secondaryAbortRef.current !== secondary) return
          const publicData = publicResult[0].status === 'fulfilled' ? publicResult[0].value : { points: [], complete: false }
          const acceleratedModule = await accelerator.catch(() => null)
          const checked = (acceleratedModule
            ? await acceleratedModule.createWaterCandidatesAsync(features, community, center, publicData.points, publicData.complete, secondary.signal)
            : createWaterCandidates(features, community, center, publicData.points, publicData.complete)).filter(inRange)
          if (secondary.signal.aborted || secondaryAbortRef.current !== secondary) return
          setPublicReadFailed(!publicData.complete)
          if (community.length > 0) {
            const combinedLayer = makeLayer(checked.map(c => c.feature))
            if (layerRef.current) map.removeLayer(layerRef.current)
            layerRef.current = combinedLayer
            if (visibleRef.current) combinedLayer.addTo(map)
          }
          setCandidates(checked)
          setSelected(previous => previous ? checked.find(c => c.id === previous.id) ?? previous : null)
          if (checked.length > 0) setStatus('ready')
        } catch {
          if (!secondary.signal.aborted && secondaryAbortRef.current === secondary) {
            setPublicReadFailed(true)
            setCommunityReadFailed(true)
          }
        } finally {
          if (!secondary.signal.aborted && secondaryAbortRef.current === secondary) setSecondaryLoading(false)
        }
      })()
    } catch {
      if (abortRef.current === controller) setStatus('error')
    } finally {
      clearTimeout(timeout)
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const handleToggle = () => {
    if (!layerRef.current) return
    if (visible) { map.removeLayer(layerRef.current); if (rangeRef.current) map.removeLayer(rangeRef.current) }
    else { layerRef.current.addTo(map); rangeRef.current?.addTo(map) }
    setLayerVisible(!visible)
  }

  const selectCandidate = (candidate: WaterCandidate) => {
    setSelected(candidate)
    if (!visible) { layerRef.current?.addTo(map); rangeRef.current?.addTo(map); setLayerVisible(true) }
    const b = candidate.bounds
    const panelEl = panelRef.current
    const mapRect = map.getContainer().getBoundingClientRect()
    let paddingTopLeft: L.PointExpression = [24, 24]
    let paddingBottomRight: L.PointExpression = [24, 24]
    if (panelEl) {
      const panelRect = panelEl.getBoundingClientRect()
      if (mapRect.width < 640) {
        const controlsRight = Math.max(...Array.from(controlRef.current?.children ?? [])
          .filter(child => !child.hasAttribute('data-water-panel'))
          .map(child => child.getBoundingClientRect().right - mapRect.left))
        if (Number.isFinite(controlsRight)) {
          paddingTopLeft = [Math.min(Math.max(controlsRight + 12, 24), mapRect.width - 160), 24]
        }
        paddingBottomRight = [24, Math.min(Math.max(24, mapRect.bottom - panelRect.top + 12), Math.max(24, mapRect.height - 120))]
      } else {
        paddingTopLeft = [Math.max(24, panelRect.right - mapRect.left + 24), 24]
      }
    }
    map.fitBounds(L.latLngBounds([[b.minLat, b.minLng], [b.maxLat, b.maxLng]]), { paddingTopLeft, paddingBottomRight, maxZoom: 16 })
  }

  const addToPlan = (candidate: WaterCandidate) => {
    setSelected(candidate)
    closePanel()
    if (user) requestFieldwork({ action: 'addStop', source: 'pin', ...candidate.position, name: (candidate.name ?? t('water.genericName')).slice(0, 60) })
    else { setPendingAction({ kind: 'plan', candidate }); setShowAuth(true) }
  }

  // ズーム枠は地図上端10px＋枠2px＋44pxボタン×2＋枠2px＝下端102px。
  // marginTop 102pxなら雫ボタン上端は112pxで10px空く。ズームの高さを変えたらここも直す。
  return (
    <>
      <div className="leaflet-top leaflet-left" style={{ marginTop: '102px', marginLeft: '2px' }}>
        <div ref={controlRef} className="leaflet-control pointer-events-none! flex flex-col items-start gap-1">
          <div className="pointer-events-auto! flex items-start gap-1">
            <button onClick={handleFind} disabled={status === 'loading'} title={t('map.nearbyWater.button')} aria-label={t('map.nearbyWater.button')} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-white p-3 shadow-md hover:bg-gray-50 disabled:opacity-50"><Droplets size={18} className={`text-gray-700 ${status === 'loading' ? 'animate-pulse' : ''}`} /></button>
            <button type="button" onClick={startReport} className="min-h-11 max-w-[150px] rounded-xl bg-white px-2.5 py-1.5 text-xs font-medium text-pretty [word-break:auto-phrase] shadow-md">{t('water.reportButton')}</button>
          </div>
          {status !== 'idle' && <div role="status" className="pointer-events-auto! max-w-[180px] space-y-1 rounded-xl bg-white/95 px-2.5 py-1.5 text-xs text-gray-700 text-pretty [word-break:auto-phrase] shadow-md">
            <p className="text-gray-500">{t('map.nearbyWater.scope', { radius: NEARBY_WATER_CONFIG.radiusM / 1000 })}</p>
            {status === 'loading' && <p>{t('map.nearbyWater.loading')}</p>}
            {status === 'empty' && !secondaryLoading && !communityReadFailed && <p>{t('map.nearbyWater.empty')}</p>}
            {status === 'empty' && secondaryLoading && <p>{t('map.nearbyWater.loading')}</p>}
            {communityReadFailed && <p>{t('water.communityReadFailed')}</p>}
            {status === 'error' && <><p className="text-red-600">{t('map.nearbyWater.error')}</p><button onClick={handleFind} className="min-h-11 px-2 font-medium underline">{t('map.nearbyWater.retry')}</button></>}
            {candidates.length > 0 && <>
              {status !== 'ready' && <p>{t('map.nearbyWater.previous')}</p>}
              <div className="flex items-center gap-2">
                <button onClick={handleToggle} aria-pressed={visible} className="flex min-h-11 items-center gap-1.5 font-medium">
                  <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-xs" style={{ backgroundColor: NEARBY_WATER_CONFIG.style.fillColor, border: `1.5px solid ${NEARBY_WATER_CONFIG.style.color}` }} />
                  <span className="whitespace-nowrap">{visible ? t('map.nearbyWater.hide') : t('map.nearbyWater.show')} · {t('map.nearbyWater.count', { count: candidates.length })}</span>
                </button>
                <button ref={listButtonRef} onClick={() => panelOpen ? closePanel() : setPanelOpen(true)} aria-expanded={panelOpen} className="min-h-11 font-medium underline">{t('water.openList')}</button>
              </div>
            </>}
            {publicReadFailed && <p>{t('water.publicReadFailed')}</p>}
          </div>}
          {pickReport && <div role="status" className="pointer-events-auto! max-w-[180px] rounded-xl bg-white p-2.5 text-xs shadow-md"><p>{t('water.pickReportHint')}</p><button type="button" onClick={() => openReport(map.getCenter())} className="min-h-11 font-medium underline">{t('water.pickReportConfirm')}</button><button type="button" onClick={() => setPickReport(false)} className="min-h-11 px-2 underline">{t('water.pickReportCancel')}</button></div>}
          {panelOpen && <div ref={panelRef} data-water-panel className="pointer-events-auto!"><NearbyWaterPanel candidates={candidates} selectedId={selected?.id ?? null} onSelect={selectCandidate} onAddToPlan={addToPlan} onReport={startReport} onClose={closePanel} /></div>}
        </div>
      </div>
      {showAuth && createPortal(<AuthModal onClose={() => {
        setShowAuth(false)
        closeAuthTimerRef.current = setTimeout(() => { if (!authUserRef.current) setPendingAction(null) }, 0)
      }} defaultTab="login" />, document.body)}
      {reportFor && user?.id === reportFor.userId && createPortal(<WaterReportSheet key={reportFor.userId} userId={reportFor.userId} position={reportFor.position} onClose={() => setReportFor(null)} onSubmitted={() => { setReportFor(null); setReportPosition(null) }} />, document.body)}
      {!pickReport && !showAuth && !reportFor && !panelOpen && reportPosition && <div className="leaflet-bottom leaflet-left" style={{ marginBottom: '5rem', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}><div className="leaflet-control max-w-[200px] rounded-xl bg-white px-3 py-2 text-xs shadow-md"><p>{t('water.selectedPosition', { lat: reportPosition.lat.toFixed(5), lng: reportPosition.lng.toFixed(5) })}</p><button type="button" onClick={() => openReport(reportPosition)} className="min-h-11 font-medium underline">{t('water.pickReportConfirm')}</button></div></div>}
    </>
  )
}
