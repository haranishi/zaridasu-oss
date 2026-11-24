'use client'

// REQ-330: 調査計画の状態（一覧・今日の計画・地点・結果の印・控え）と操作。
//
// - 読み込むのはパネルを開いたときだけ（ホームを開いただけでは問い合わせない）
// - 計画の編集（作る・題名・地点の追加/並べ替え/削除）は電波のある場所でだけ。圏外では控えを見せる
// - 地点の状態（済み・飛ばし・未）と「いなかった」は圏外でも押せる。送信待ちに積み、画面には先に反映する
// - アカウントが替わったら FieldworkLayer ごと作り直される（MapView の key）。状態を持ち越さない
//
// 非同期の操作（読み込みを待ってから地点を足す等）が古い状態を読まないよう、計画・地点の一覧は
// ref を正本にし、state はその写しとして同時に更新する。
//
// 「希少種あり」（その地点から作る投稿の位置を非公開にする）は、地点の id でなく場所で決める。
// 計画を読むときに、地点の周りにある自分の希少種の記録の位置も取り、地点から 300 m 以内に記録があれば保護する
// （lib/rareProximity.ts）。「もう一度使う」で地点の id が変わっても、別の端末で記録しても外れない。
// 地点を足したときも、足した地点の周りの記録を取りに行く（圏外の「いた」はこの判定だけで決まるため。2 周目の点検）。
// 取れなかった・範囲検索が上限まで返ったときは、その地点を仮の印（unverified）で守る（伏せる側に倒す）。
// 地点を外しても、付いていた記録は落とさない（DB でも stop_id が空になって残り、300 m 以内の別の地点を守る）。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { logError } from '@/lib/errorHandler'
import { todayLocalISODate } from '@/lib/localDate'
import { isNetworkError } from '@/lib/privateSpots'
import { supabase } from '@/lib/supabase/client'
import type { Species } from '@/types'

import { recordAbsence, type AbsenceInput } from '../data/absence'
import { duplicatePlan, insertPlan, selectOwnPlans, updatePlan, type SurveyPlan } from '../data/plans'
import { RARE_POINTS_LIMIT, selectOwnRarePointsInBox, selectRareSightingsForStops } from '../data/rareSightings'
import { linkStopPost, selectStopPosts, type StopPostKind, type SurveyStopPost } from '../data/stopPosts'
import {
  deleteStop,
  insertStops,
  nextSortOrder,
  reorderStops,
  selectStops,
  setStopStatus,
  updateStop,
  type NewSurveyPlanStop,
  type StopStatus,
  type SurveyPlanStop,
} from '../data/stops'
import { errorReason, FieldworkError } from '../lib/errors'
import { readPlanCache, writePlanCache, type StopRareMark } from '../lib/planCache'
import { distanceM } from '../lib/positionRule'
import { boxAround, RARE_PROTECT_RADIUS_M } from '../lib/rareProximity'
import { newClientId, type QueueItem } from '../lib/queue'

export interface StopView extends SurveyPlanStop {
  /** 回る順の番号（1 始まり） */
  number: number
  /** 送信待ちを重ねた、画面に出す状態 */
  shownStatus: StopStatus
  /** まだ送っていない記録・状態がある */
  unsent: boolean
  /** 希少種の記録が付いているか、300 m 以内にある（送信待ちを含む）。投稿の位置を非公開にする判定に使う */
  rare: boolean
  counts: { sighting: number; absence: number; rare: number }
}

export type PlanLoadState = 'idle' | 'loading' | 'ready' | 'error'

/** 既定で開く計画: 今日の進行中 → 今日より後で一番近い進行中 → なし（純粋関数）。 */
export function pickDefaultPlan(plans: readonly SurveyPlan[], today: string): SurveyPlan | null {
  const active = plans.filter((p) => p.status === 'active')
  const todays = active
    .filter((p) => p.planned_on === today)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  if (todays[0]) return todays[0]
  const upcoming = active
    .filter((p) => p.planned_on > today)
    .sort((a, b) => a.planned_on.localeCompare(b.planned_on))
  return upcoming[0] ?? null
}

/** 記録 r が地点 stop を保護するか: その地点に付いているか、地点から 300 m 以内にある。 */
function protects(stop: Pick<SurveyPlanStop, 'id' | 'lat' | 'lng'>, r: { stop_id: string | null; lat?: number; lng?: number }): boolean {
  if (r.stop_id === stop.id) return true
  if (r.lat == null || r.lng == null) return false
  return distanceM({ lat: Number(stop.lat), lng: Number(stop.lng) }, { lat: Number(r.lat), lng: Number(r.lng) }) <= RARE_PROTECT_RADIUS_M
}

/** 状態（済み・飛ばし・未）を変える送信待ち。非公開化（protect）は状態を変えない。 */
const STATUS_TYPES = new Set<QueueItem['type']>(['status', 'absence', 'rare', 'link'])

/**
 * 地点に、結果の数と送信待ちを重ねる（純粋関数）。送信待ちは積んだ順に後のものが勝つ。
 * 希少種は場所で判定する（その地点に付いた記録か、300 m 以内の記録。送信待ちの記録も含む）。
 */
export function buildStopViews(
  stops: readonly SurveyPlanStop[],
  links: readonly SurveyStopPost[],
  rare: readonly StopRareMark[],
  queued: readonly QueueItem[]
): StopView[] {
  const queuedRare = queued.flatMap((q) => (q.type === 'rare' ? [{ stop_id: q.stopId, lat: q.lat, lng: q.lng }] : []))
  return stops.map((stop, i) => {
    const mine = queued.filter((q) => STATUS_TYPES.has(q.type) && 'stopId' in q && q.stopId === stop.id)
    let shownStatus: StopStatus = stop.status
    for (const q of mine) shownStatus = q.type === 'status' ? q.status : 'done'
    const linked = links.filter((l) => l.stop_id === stop.id)
    const protecting = rare.filter((r) => protects(stop, r))
    // 仮の印（確かめ切れなかった分）は守るが、記録の数には入れない
    const rareNear = protecting.filter((r) => !r.unverified).length + queuedRare.filter((r) => protects(stop, r)).length
    const counts = {
      sighting:
        linked.filter((l) => l.kind === 'sighting').length +
        mine.filter((q) => q.type === 'link' && q.kind === 'sighting').length,
      absence:
        linked.filter((l) => l.kind === 'absence').length +
        mine.reduce((n, q) => n + (q.type === 'absence' ? q.species.length : 0), 0),
      rare: rareNear,
    }
    return { ...stop, number: i + 1, shownStatus, unsent: mine.length > 0, rare: rareNear > 0 || protecting.length > 0, counts }
  })
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

interface PlanDetail {
  stops: SurveyPlanStop[]
  links: SurveyStopPost[]
  rare: StopRareMark[]
}

const EMPTY_DETAIL: PlanDetail = { stops: [], links: [], rare: [] }

/** 2 つの記録の一覧を id で重複なくまとめる。 */
function mergeRare(a: readonly StopRareMark[], b: readonly StopRareMark[]): StopRareMark[] {
  const seen = new Set(a.map((r) => r.id))
  return [...a, ...b.filter((r) => !seen.has(r.id))]
}

/** 確かめ切れなかった地点を守る仮の印（その地点の座標・数には入れない）。 */
function unverifiedMarks(stops: readonly Pick<SurveyPlanStop, 'id' | 'lat' | 'lng'>[]): StopRareMark[] {
  return stops.map((s) => ({ id: `unverified:${s.id}`, stop_id: s.id, lat: Number(s.lat), lng: Number(s.lng), unverified: true }))
}

/**
 * 地点の周りにある自分の記録の位置。範囲検索が上限まで返ったら取りこぼしがありうるので、
 * 取れた分に加えて、その地点すべてを仮の印で守る。
 */
async function fetchRareNearStops(userId: string, stops: readonly SurveyPlanStop[]): Promise<StopRareMark[]> {
  const box = boxAround(stops, RARE_PROTECT_RADIUS_M)
  if (!box) return []
  const { data, error } = await selectOwnRarePointsInBox(supabase, userId, box)
  if (error) throw error
  const found = data ?? []
  return found.length >= RARE_POINTS_LIMIT ? mergeRare(found, unverifiedMarks(stops)) : found
}

async function fetchPlanDetail(userId: string, planId: string): Promise<PlanDetail> {
  const { data: stops, error } = await selectStops(supabase, planId)
  if (error) throw error
  const ids = (stops ?? []).map((s) => s.id)
  if (ids.length === 0) return EMPTY_DETAIL
  const [linksRes, byStopRes, near] = await Promise.all([
    selectStopPosts(supabase, ids),
    selectRareSightingsForStops(supabase, ids),
    fetchRareNearStops(userId, stops ?? []),
  ])
  if (linksRes.error) throw linksRes.error
  if (byStopRes.error) throw byStopRes.error
  return {
    stops: stops ?? [],
    links: linksRes.data ?? [],
    rare: mergeRare(byStopRes.data ?? [], near),
  }
}

export interface UseFieldworkPlanOptions {
  /** パネルを開いている（畳んでいる間も含む）。true になるたびに読み込む。 */
  active: boolean
  queued: readonly QueueItem[]
  enqueue: (item: QueueItem) => boolean
}

export function useFieldworkPlan(userId: string | null, options: UseFieldworkPlanOptions) {
  const { active, queued, enqueue } = options
  const [plans, setPlansState] = useState<SurveyPlan[]>([])
  const [currentPlanId, setCurrentState] = useState<string | null>(null)
  const [stops, setStopsState] = useState<SurveyPlanStop[]>([])
  const [links, setLinks] = useState<SurveyStopPost[]>([])
  const [rare, setRare] = useState<StopRareMark[]>([])
  const [loadState, setLoadState] = useState<PlanLoadState>('idle')
  /** 圏外で控えを見せているときの「最後に同期した時刻」。電波のある状態で読めたら null。 */
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  /** 地点まで読み込み終えた計画（地図をその計画の地点に合わせる合図。利用者が足した地点では動かさない）。 */
  const [loadedPlanId, setLoadedPlanId] = useState<string | null>(null)

  const plansRef = useRef<SurveyPlan[]>([])
  const currentRef = useRef<string | null>(null)
  const stopsRef = useRef<SurveyPlanStop[]>([])
  const cachedRef = useRef<string | null>(null)
  const seqRef = useRef(0)
  const loadingRef = useRef<Promise<void> | null>(null)
  const loadedRef = useRef(false)

  const setPlans = useCallback((next: SurveyPlan[]) => {
    plansRef.current = next
    setPlansState(next)
  }, [])
  const setCurrent = useCallback((id: string | null) => {
    currentRef.current = id
    setCurrentState(id)
  }, [])
  const setStops = useCallback((next: SurveyPlanStop[]) => {
    stopsRef.current = next
    setStopsState(next)
  }, [])
  const setCached = useCallback((at: string | null) => {
    cachedRef.current = at
    setCachedAt(at)
  }, [])

  const applyDetail = useCallback(
    (detail: PlanDetail) => {
      setStops(detail.stops)
      setLinks(detail.links)
      setRare(detail.rare)
    },
    [setStops]
  )

  /** 控えを出す。planId を渡すとその計画を開く（控えにあるのは最後に開いていた計画の地点だけ）。 */
  const applyCache = useCallback(
    (planId?: string | null): boolean => {
      if (!userId) return false
      const cache = readPlanCache(userId)
      if (!cache) return false
      const wanted = planId === undefined || planId === null ? cache.currentPlanId : planId
      setPlans(cache.plans)
      setCurrent(wanted)
      applyDetail(wanted === cache.currentPlanId ? cache : EMPTY_DETAIL)
      setLoadedPlanId(wanted)
      setCached(cache.savedAt)
      loadedRef.current = true
      setLoadState('ready')
      return true
    },
    [userId, setPlans, setCurrent, applyDetail, setCached]
  )

  const load = useCallback(
    (preferPlanId?: string | null): Promise<void> => {
      if (!userId) return Promise.resolve()
      const seq = ++seqRef.current
      setLoadState((s) => (s === 'ready' ? s : 'loading'))
      const run = (async () => {
        if (!isOnline()) {
          if (seq === seqRef.current && !applyCache(preferPlanId)) setLoadState('error')
          return
        }
        try {
          const { data, error } = await selectOwnPlans(supabase, userId)
          if (error) throw error
          const list = data ?? []
          const keep = preferPlanId ?? currentRef.current
          const current =
            (keep ? list.find((p) => p.id === keep) : undefined) ?? pickDefaultPlan(list, todayLocalISODate())
          const detail = current ? await fetchPlanDetail(userId, current.id) : EMPTY_DETAIL
          if (seq !== seqRef.current) return
          setPlans(list)
          setCurrent(current?.id ?? null)
          applyDetail(detail)
          setLoadedPlanId(current?.id ?? null)
          setCached(null)
          loadedRef.current = true
          setLoadState('ready')
        } catch (err) {
          if (seq !== seqRef.current) return
          if (isNetworkError(err) && applyCache(preferPlanId)) return
          logError(err, 'useFieldworkPlan:load')
          setLoadState('error')
        }
      })()
      loadingRef.current = run
      // 読み込み中かどうかは loadingRef で見る（いちばん新しい読み込みが終わったら空にする）
      void run.finally(() => {
        if (loadingRef.current === run) loadingRef.current = null
      })
      return run
    },
    [userId, applyCache, setPlans, setCurrent, applyDetail, setCached]
  )

  // パネルを開いたら読み込む（閉じて開き直したら読み直す）。吹き出しの依頼で読み込み中なら重ねない
  useEffect(() => {
    if (active && userId && !loadingRef.current) void load()
  }, [active, userId, load])

  // 電波のある状態で読めた内容を控えに残す
  useEffect(() => {
    if (!userId || loadState !== 'ready' || cachedAt) return
    writePlanCache(userId, { plans, currentPlanId, stops, links, rare })
  }, [userId, loadState, cachedAt, plans, currentPlanId, stops, links, rare])

  /**
   * 読み込みが済むまで待つ（地図の吹き出しから「計画に入れる」を押したときなど）。
   * 待っている間に新しい読み込みが始まったら、それも待つ（古い読み込みの結果は捨てられるため、
   * 待たずに進むと「計画が無い」と判断して今日の計画を二重に作ってしまう）。
   */
  const ensureLoaded = useCallback(async () => {
    if (loadedRef.current) return
    if (!loadingRef.current) void load()
    while (loadingRef.current && !loadedRef.current) await loadingRef.current
  }, [load])

  const requireEditable = useCallback((): string => {
    if (!userId) throw new FieldworkError('denied')
    if (!isOnline() || cachedRef.current) throw new FieldworkError('offline')
    return userId
  }, [userId])

  const selectPlan = useCallback(
    async (planId: string) => {
      if (cachedRef.current || !isOnline()) {
        applyCache(planId)
        return
      }
      setCurrent(planId)
      applyDetail(EMPTY_DETAIL)
      setLoadedPlanId(null)
      await load(planId)
    },
    [applyCache, setCurrent, applyDetail, load]
  )

  const createPlan = useCallback(
    async (input: { title: string; plannedOn?: string }) => {
      const uid = requireEditable()
      const plan = await insertPlan(supabase, { userId: uid, title: input.title, plannedOn: input.plannedOn })
      setPlans([plan, ...plansRef.current])
      setCurrent(plan.id)
      applyDetail(EMPTY_DETAIL)
      setLoadedPlanId(plan.id)
      return plan
    },
    [requireEditable, setPlans, setCurrent, applyDetail]
  )

  const updateCurrentPlan = useCallback(
    async (fields: { title?: string; plannedOn?: string; status?: SurveyPlan['status'] }) => {
      requireEditable()
      const planId = currentRef.current
      if (!planId) throw new FieldworkError('failed')
      await updatePlan(supabase, planId, fields)
      setPlans(
        plansRef.current.map((p) =>
          p.id === planId
            ? {
                ...p,
                ...(fields.title !== undefined ? { title: fields.title } : {}),
                ...(fields.plannedOn !== undefined ? { planned_on: fields.plannedOn } : {}),
                ...(fields.status !== undefined ? { status: fields.status } : {}),
              }
            : p
        )
      )
    },
    [requireEditable, setPlans]
  )

  /** 「この計画をもう一度使う」: 同じ地点（状態は未）で、今日の新しい計画を作って開く。 */
  const reusePlan = useCallback(
    async (title: string) => {
      const uid = requireEditable()
      const sourcePlanId = currentRef.current
      if (!sourcePlanId) throw new FieldworkError('failed')
      const plan = await duplicatePlan(supabase, { userId: uid, sourcePlanId, title, plannedOn: todayLocalISODate() })
      setPlans([plan, ...plansRef.current])
      setCurrent(plan.id)
      applyDetail(await fetchPlanDetail(uid, plan.id))
      setLoadedPlanId(plan.id)
      return plan
    },
    [requireEditable, setPlans, setCurrent, applyDetail]
  )

  /**
   * 地点を足す。計画が無ければ newPlanTitle で今日の計画を作ってから足す。
   * `onlyActive` なら、終えた計画を開いているときも新しい計画を作る（吹き出しの「計画に入れる」用）。
   */
  const addStops = useCallback(
    async (newStops: NewSurveyPlanStop[], opts: { newPlanTitle: string; onlyActive?: boolean }) => {
      const uid = requireEditable()
      let planId = currentRef.current
      const current = plansRef.current.find((p) => p.id === planId)
      if (!planId || !current || (opts.onlyActive && current.status !== 'active')) {
        planId = (await createPlan({ title: opts.newPlanTitle })).id
      }
      const rows = await insertStops(supabase, uid, planId, newStops, nextSortOrder(stopsRef.current))
      setStops([...stopsRef.current, ...rows])
      // 足した地点の周りの自分の記録も取る（計画を作り直したときや、記録のある場所を後から地点にしたとき）。
      // 取れなければ足した地点を仮の印で守る。控えにも入るので、そのまま圏外へ行っても保護は外れない
      try {
        const near = await fetchRareNearStops(uid, rows)
        if (near.length > 0) setRare((prev) => mergeRare(prev, near))
      } catch (err) {
        if (!isNetworkError(err)) logError(err, 'useFieldworkPlan:addStops:rare')
        setRare((prev) => mergeRare(prev, unverifiedMarks(rows)))
      }
      const plan = plansRef.current.find((p) => p.id === planId) ?? null
      return { plan, rows, total: stopsRef.current.length }
    },
    [requireEditable, createPlan, setStops]
  )

  /** ↑↓ で 1 つ動かす。先に画面を動かし、失敗したら戻して投げる。 */
  const moveStop = useCallback(
    async (stopId: string, delta: -1 | 1) => {
      requireEditable()
      const planId = currentRef.current
      const before = stopsRef.current
      const i = before.findIndex((s) => s.id === stopId)
      const j = i + delta
      if (!planId || i < 0 || j < 0 || j >= before.length) return
      const next = [...before]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      const renumbered = next.map((s, k) => ({ ...s, sort_order: k }))
      setStops(renumbered)
      try {
        await reorderStops(supabase, planId, renumbered.map((s) => s.id))
      } catch (err) {
        setStops(before)
        // ほかの端末で地点が変わっていた（DB が全地点の一致を確かめる）。読み直してから投げる
        if (errorReason(err) === 'reorderStale') await load()
        throw err
      }
    },
    [requireEditable, setStops, load]
  )

  const removeStop = useCallback(
    async (stopId: string) => {
      requireEditable()
      await deleteStop(supabase, stopId)
      setStops(stopsRef.current.filter((s) => s.id !== stopId))
      setLinks((prev) => prev.filter((l) => l.stop_id !== stopId))
      // 外した地点に付いていた記録は落とさない（DB でも stop_id が空になって残り、300 m 以内の別の地点を守る）。
      // 仮の印は外した地点のためのものなので消す
      setRare((prev) =>
        prev.flatMap((r) => (r.stop_id !== stopId ? [r] : r.unverified ? [] : [{ ...r, stop_id: null }]))
      )
    },
    [requireEditable, setStops]
  )

  const editStop = useCallback(
    async (stopId: string, fields: { name?: string | null; note?: string | null }) => {
      requireEditable()
      await updateStop(supabase, stopId, fields)
      setStops(stopsRef.current.map((s) => (s.id === stopId ? { ...s, ...fields } : s)))
    },
    [requireEditable, setStops]
  )

  const queueOrThrow = useCallback(
    (item: QueueItem): 'queued' => {
      if (!enqueue(item)) throw new FieldworkError('queueFull')
      return 'queued'
    },
    [enqueue]
  )

  const markDoneLocally = useCallback(
    (stopId: string, status: StopStatus, at: string, note?: string | null) => {
      setStops(
        stopsRef.current.map((s) =>
          s.id === stopId
            ? { ...s, status, visited_at: status === 'pending' ? null : at, ...(note !== undefined ? { note } : {}) }
            : s
        )
      )
    },
    [setStops]
  )

  /** 済み・飛ばし・未（元に戻す）。圏外なら送信待ちに積む。`note` を渡すとメモも書き換える。 */
  const recordStatus = useCallback(
    async (stopId: string, status: StopStatus, opts: { note?: string | null } = {}): Promise<'saved' | 'queued'> => {
      if (!userId) throw new FieldworkError('denied')
      const at = new Date().toISOString()
      const queue = () =>
        queueOrThrow({
          type: 'status',
          clientId: newClientId(),
          userId,
          at,
          stopId,
          status,
          ...(opts.note !== undefined ? { note: opts.note } : {}),
        })
      if (!isOnline()) return queue()
      try {
        if (opts.note !== undefined) await updateStop(supabase, stopId, { note: opts.note })
        await setStopStatus(supabase, stopId, status, at)
      } catch (err) {
        if (isNetworkError(err)) return queue()
        throw err
      }
      markDoneLocally(stopId, status, at, opts.note)
      return 'saved'
    },
    [userId, queueOrThrow, markDoneLocally]
  )

  /** 「いなかった」を記録する。圏外・通信の途中切れでは、作れた投稿を書き残して送信待ちに積む。 */
  const recordAbsenceAt = useCallback(
    async (input: Omit<AbsenceInput, 'userId' | 'at'>): Promise<'saved' | 'queued'> => {
      if (!userId) throw new FieldworkError('denied')
      const full: AbsenceInput = { ...input, userId, at: new Date().toISOString() }
      const postIds: Partial<Record<Species, string>> = {}
      const queue = () => queueOrThrow({ type: 'absence', clientId: newClientId(), ...full, postIds: { ...postIds } })
      if (!isOnline()) return queue()
      let created: string[]
      try {
        created = await recordAbsence(supabase, full, {
          onPosted: (species, postId) => {
            postIds[species] = postId
          },
        })
      } catch (err) {
        if (isNetworkError(err)) return queue()
        // 1 件目は作れて 2 件目が上限などで落ちたとき: 作れた投稿の id ごと送信待ちに残し、
        // 押し直しで作り直さない（残りはあとで送る）。何も作れていなければそのまま投げる
        if (Object.keys(postIds).length > 0) {
          queue()
          throw new FieldworkError('partialQueued', errorReason(err))
        }
        throw err
      }
      setLinks((prev) => [
        ...prev,
        ...created.map((postId) => ({ stop_id: input.stopId, post_id: postId, kind: 'absence' as const, created_at: full.at })),
      ])
      markDoneLocally(input.stopId, 'done', full.at)
      return 'saved'
    },
    [userId, queueOrThrow, markDoneLocally]
  )

  /** 「いた」で作れた投稿を地点とつなぎ、地点を「済み」にする。送れなければ送信待ちに積む。 */
  const linkPostAt = useCallback(
    async (stopId: string, postId: string, kind: StopPostKind): Promise<'saved' | 'queued'> => {
      if (!userId) throw new FieldworkError('denied')
      const at = new Date().toISOString()
      const queue = () => queueOrThrow({ type: 'link', clientId: newClientId(), userId, at, stopId, postId, kind })
      if (!isOnline()) return queue()
      try {
        await linkStopPost(supabase, { userId, stopId, postId, kind })
        await setStopStatus(supabase, stopId, 'done', at)
      } catch (err) {
        if (isNetworkError(err)) return queue()
        throw err
      }
      setLinks((prev) => [...prev, { stop_id: stopId, post_id: postId, kind, created_at: at }])
      markDoneLocally(stopId, 'done', at)
      return 'saved'
    },
    [userId, queueOrThrow, markDoneLocally]
  )

  /**
   * 希少種の記録を保存できたら、その位置を保護の判定に足す（地点に付かない記録も、300 m 以内の地点を守る）。
   * 地点から記録したときは、その地点を「済み」にする。
   */
  const markRare = useCallback(
    async (stopId: string | null, mark: StopRareMark): Promise<'saved' | 'queued' | 'none'> => {
      setRare((prev) => mergeRare(prev, [mark]))
      return stopId ? recordStatus(stopId, 'done') : 'none'
    },
    [recordStatus]
  )

  const currentPlan = useMemo(() => plans.find((p) => p.id === currentPlanId) ?? null, [plans, currentPlanId])
  const stopViews = useMemo(() => buildStopViews(stops, links, rare, queued), [stops, links, rare, queued])

  return {
    loadState,
    plans,
    currentPlan,
    stops: stopViews,
    loadedPlanId,
    cachedAt,
    canEdit: !cachedAt && isOnline(),
    load,
    ensureLoaded,
    selectPlan,
    createPlan,
    updateCurrentPlan,
    reusePlan,
    addStops,
    moveStop,
    removeStop,
    editStop,
    recordStatus,
    recordAbsenceAt,
    linkPostAt,
    markRare,
  }
}

export type FieldworkPlanApi = ReturnType<typeof useFieldworkPlan>
