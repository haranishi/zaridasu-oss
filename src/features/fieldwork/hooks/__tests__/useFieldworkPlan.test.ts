import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { todayLocalISODate } from '@/lib/localDate'

const m = vi.hoisted(() => ({
  selectOwnPlans: vi.fn(),
  insertPlan: vi.fn(),
  updatePlan: vi.fn(),
  duplicatePlan: vi.fn(),
  selectStops: vi.fn(),
  insertStops: vi.fn(),
  reorderStops: vi.fn(),
  setStopStatus: vi.fn(),
  updateStop: vi.fn(),
  deleteStop: vi.fn(),
  selectStopPosts: vi.fn(),
  linkStopPost: vi.fn(),
  selectRareSightingsForStops: vi.fn(),
  selectOwnRarePointsInBox: vi.fn(),
  recordAbsence: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))
vi.mock('@/lib/errorHandler', () => ({ logError: vi.fn() }))
vi.mock('../../data/plans', () => ({
  selectOwnPlans: m.selectOwnPlans,
  insertPlan: m.insertPlan,
  updatePlan: m.updatePlan,
  duplicatePlan: m.duplicatePlan,
}))
vi.mock('../../data/stops', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/stops')>()),
  selectStops: m.selectStops,
  insertStops: m.insertStops,
  reorderStops: m.reorderStops,
  setStopStatus: m.setStopStatus,
  updateStop: m.updateStop,
  deleteStop: m.deleteStop,
}))
vi.mock('../../data/stopPosts', () => ({ selectStopPosts: m.selectStopPosts, linkStopPost: m.linkStopPost }))
vi.mock('../../data/rareSightings', () => ({
  RARE_POINTS_LIMIT: 1000,
  selectRareSightingsForStops: m.selectRareSightingsForStops,
  selectOwnRarePointsInBox: m.selectOwnRarePointsInBox,
}))
vi.mock('../../data/absence', () => ({ recordAbsence: m.recordAbsence }))

import { buildStopViews, pickDefaultPlan, useFieldworkPlan } from '../useFieldworkPlan'
import { writePlanCache } from '../../lib/planCache'
import type { QueueItem } from '../../lib/queue'

// REQ-330: 計画のフック。パネルを開いたときだけ読み込む・今日の計画を開く・圏外では控え・
// 状態の変更と「いなかった」は圏外でも送信待ちに積む・アカウントごとに控えを分ける。

const A = '00000000-0000-0000-0000-00000000aaaa'
const B = '00000000-0000-0000-0000-00000000bbbb'
const today = todayLocalISODate()

function plan(id: string, plannedOn: string, status: 'active' | 'done' = 'active', createdAt = '2026-09-30T12:00:00Z') {
  return { id, title: `計画 ${id}`, planned_on: plannedOn, status, note: null, created_at: createdAt, updated_at: createdAt }
}
function stop(id: string, order: number, status: 'pending' | 'done' | 'skipped' = 'pending') {
  return {
    id,
    plan_id: 'p-today',
    sort_order: order,
    name: null,
    note: null,
    lat: 39.7 + order / 100,
    lng: 140.1,
    source: 'pin' as const,
    source_id: null,
    status,
    visited_at: null,
    created_at: '2026-09-30T12:00:00Z',
  }
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true })
}

const queued: QueueItem[] = []
const enqueue = vi.fn(() => true)

function render(userId: string | null, active = true, items: QueueItem[] = queued) {
  return renderHook((props: { active: boolean; items: QueueItem[] }) => useFieldworkPlan(userId, { active: props.active, queued: props.items, enqueue }), {
    initialProps: { active, items },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setOnline(true)
  m.selectOwnPlans.mockResolvedValue({ data: [plan('p-old', '2026-09-01', 'done'), plan('p-today', today)], error: null })
  m.selectStops.mockResolvedValue({ data: [stop('s1', 0), stop('s2', 1), stop('s3', 2)], error: null })
  m.selectStopPosts.mockResolvedValue({ data: [], error: null })
  m.selectRareSightingsForStops.mockResolvedValue({ data: [], error: null })
  m.selectOwnRarePointsInBox.mockResolvedValue({ data: [], error: null })
})

afterEach(() => setOnline(true))

describe('pickDefaultPlan / buildStopViews', () => {
  it('今日の進行中 → 今日より後で一番近い進行中 → なし', () => {
    expect(pickDefaultPlan([plan('a', '2026-09-01'), plan('b', '2026-10-01')], '2026-10-01')?.id).toBe('b')
    expect(pickDefaultPlan([plan('c', '2026-10-05'), plan('d', '2026-10-03')], '2026-10-01')?.id).toBe('d')
    expect(pickDefaultPlan([plan('e', '2026-10-01', 'done')], '2026-10-01')).toBeNull()
  })

  it('送信待ちを重ねる（後に積んだものが勝つ）。不在・希少種・つながりは件数に足す', () => {
    const views = buildStopViews(
      [stop('s1', 0), stop('s2', 1, 'done')],
      [{ stop_id: 's2', post_id: 'p1', kind: 'sighting', created_at: '' }],
      [{ id: 'r1', stop_id: 's2', lat: 39.71, lng: 140.1 }],
      [
        { type: 'status', clientId: 'c1', userId: A, at: '', stopId: 's1', status: 'skipped' },
        { type: 'absence', clientId: 'c2', userId: A, at: '', stopId: 's1', species: ['american', 'bullfrog'], surveyDurationMinutes: null, lat: 0, lng: 0, accuracy: null, locationSource: 'manual', locationPrivate: false, observedOn: today },
      ]
    )
    expect(views[0]).toMatchObject({ number: 1, shownStatus: 'done', unsent: true, counts: { absence: 2, sighting: 0, rare: 0 } })
    expect(views[1]).toMatchObject({ number: 2, shownStatus: 'done', unsent: false, rare: true, counts: { sighting: 1 } })
  })

  it('B1: 希少種は地点の id でなく場所で決める（別の地点 id の記録でも 300 m 以内なら保護、遠ければ保護しない）', () => {
    // s1 は (39.70, 140.1)、s2 は (39.71, 140.1)。記録は前の計画の地点 old-1 に付いていて、s1 から約 56 m
    const views = buildStopViews([stop('s1', 0), stop('s2', 1)], [], [{ id: 'r1', stop_id: 'old-1', lat: 39.7005, lng: 140.1 }], [])
    expect(views[0]).toMatchObject({ rare: true, counts: { rare: 1 } })
    // s2 からは約 1.1 km 離れている
    expect(views[1]).toMatchObject({ rare: false, counts: { rare: 0 } })
  })

  it('B1: まだ送っていない希少種（送信待ち・計画の外で記録）も、近くの地点を保護する', () => {
    const views = buildStopViews(
      [stop('s1', 0)],
      [],
      [],
      [
        {
          type: 'rare',
          clientId: 'c9',
          userId: A,
          at: '',
          stopId: null,
          speciesKey: 'medaka',
          speciesLabel: null,
          count: null,
          note: null,
          lat: 39.7008,
          lng: 140.1005,
          accuracy: null,
          locationSource: 'gps',
          observedAt: '2026-10-01T00:00:00Z',
        },
      ]
    )
    expect(views[0]).toMatchObject({ rare: true })
  })

  it('座標を持たない古い控えの記録は、地点の id だけで判定する', () => {
    const views = buildStopViews([stop('s1', 0), stop('s2', 1)], [], [{ id: 'r1', stop_id: 's2' }], [])
    expect(views.map((v) => v.rare)).toEqual([false, true])
  })
})

describe('useFieldworkPlan', () => {
  it('パネルを開くまでは問い合わせない。開いたら今日の計画と地点を読む', async () => {
    const { result, rerender } = render(A, false)
    expect(m.selectOwnPlans).not.toHaveBeenCalled()
    rerender({ active: true, items: queued })
    await waitFor(() => expect(result.current.loadState).toBe('ready'))
    expect(m.selectOwnPlans).toHaveBeenCalledWith({}, A)
    expect(result.current.currentPlan?.id).toBe('p-today')
    expect(result.current.stops.map((s) => s.number)).toEqual([1, 2, 3])
    expect(result.current.canEdit).toBe(true)
  })

  it('圏外では控えを「最後に同期した内容」として出し、計画の編集は止める', async () => {
    writePlanCache(A, { plans: [plan('p-today', today)], currentPlanId: 'p-today', stops: [stop('s1', 0)], links: [], rare: [] }, new Date('2026-10-01T01:02:03Z'))
    setOnline(false)
    const { result } = render(A)
    await waitFor(() => expect(result.current.loadState).toBe('ready'))
    expect(m.selectOwnPlans).not.toHaveBeenCalled()
    expect(result.current.cachedAt).toBe('2026-10-01T01:02:03.000Z')
    expect(result.current.canEdit).toBe(false)
    await expect(result.current.addStops([{ lat: 39, lng: 140, source: 'pin' }], { newPlanTitle: 't' })).rejects.toMatchObject({ reason: 'offline' })
  })

  it('別の人の控えは使わない（アカウントが替わったら前の人の計画を出さない）', async () => {
    writePlanCache(A, { plans: [plan('p-today', today)], currentPlanId: 'p-today', stops: [stop('s1', 0)], links: [], rare: [] })
    setOnline(false)
    const { result } = render(B)
    await waitFor(() => expect(result.current.loadState).toBe('error'))
    expect(result.current.plans).toEqual([])
    expect(result.current.stops).toEqual([])
  })

  it('計画が無いときに地点を足すと、今日の計画を作ってから先頭の順番で足す', async () => {
    m.selectOwnPlans.mockResolvedValue({ data: [], error: null })
    m.insertPlan.mockResolvedValue(plan('p-new', today))
    m.insertStops.mockResolvedValue([{ ...stop('n1', 0), plan_id: 'p-new' }])
    const { result } = render(A)
    await waitFor(() => expect(result.current.loadState).toBe('ready'))
    let added: Awaited<ReturnType<typeof result.current.addStops>> | undefined
    await act(async () => {
      added = await result.current.addStops([{ lat: 39.7, lng: 140.1, source: 'pin' }], { newPlanTitle: '10/1 の調査' })
    })
    expect(m.insertPlan).toHaveBeenCalledWith({}, { userId: A, title: '10/1 の調査', plannedOn: undefined })
    expect(m.insertStops).toHaveBeenCalledWith({}, A, 'p-new', [{ lat: 39.7, lng: 140.1, source: 'pin' }], 0)
    expect(added?.total).toBe(1)
    expect(result.current.currentPlan?.id).toBe('p-new')
  })

  it('↑↓ は計画の地点を全部並べ直して送り、失敗したら元に戻して投げる', async () => {
    const { result } = render(A)
    await waitFor(() => expect(result.current.stops).toHaveLength(3))
    m.reorderStops.mockResolvedValueOnce(undefined)
    await act(() => result.current.moveStop('s3', -1))
    expect(m.reorderStops).toHaveBeenLastCalledWith({}, 'p-today', ['s1', 's3', 's2'])
    expect(result.current.stops.map((s) => s.id)).toEqual(['s1', 's3', 's2'])

    m.reorderStops.mockRejectedValueOnce({ code: '42501', message: 'denied' })
    await act(async () => {
      await expect(result.current.moveStop('s1', 1)).rejects.toMatchObject({ code: '42501' })
    })
    expect(result.current.stops.map((s) => s.id)).toEqual(['s1', 's3', 's2'])
  })

  it('吹き出しから頼まれたとき: 読み込みを待ってから今日の計画に足す（パネルを開いた読み込みと重なっても計画を作り直さない）', async () => {
    m.insertStops.mockResolvedValue([stop('s4', 3)])
    const { result, rerender } = render(A, false)
    let pending!: Promise<void>
    act(() => {
      pending = result.current.ensureLoaded()
    })
    // 読み込み中にパネルが開いた（吹き出しの依頼はパネルも開く）
    rerender({ active: true, items: queued })
    await act(async () => {
      await pending
    })
    let added: Awaited<ReturnType<typeof result.current.addStops>> | undefined
    await act(async () => {
      added = await result.current.addStops([{ lat: 39.8, lng: 140.2, source: 'pin' }], { newPlanTitle: 't', onlyActive: true })
    })
    expect(m.selectOwnPlans).toHaveBeenCalledTimes(1)
    expect(m.insertPlan).not.toHaveBeenCalled()
    expect(m.insertStops).toHaveBeenCalledWith({}, A, 'p-today', [{ lat: 39.8, lng: 140.2, source: 'pin' }], 3)
    expect(added?.plan?.id).toBe('p-today')
  })

  it('圏外で「飛ばす」を押すと送信待ちに積み、画面には先に反映する', async () => {
    const { result, rerender } = render(A)
    await waitFor(() => expect(result.current.loadState).toBe('ready'))
    setOnline(false)
    let outcome = ''
    await act(async () => {
      outcome = await result.current.recordStatus('s2', 'skipped', { note: '増水' })
    })
    expect(outcome).toBe('queued')
    expect(m.setStopStatus).not.toHaveBeenCalled()
    const item = (enqueue.mock.calls as unknown as [QueueItem][])[0]![0]
    expect(item).toMatchObject({ type: 'status', userId: A, stopId: 's2', status: 'skipped', note: '増水' })
    rerender({ active: true, items: [item] })
    expect(result.current.stops[1]).toMatchObject({ shownStatus: 'skipped', unsent: true })
  })

  it('電波があれば状態はすぐ送り、0 行（権限なし）の失敗は画面に返す', async () => {
    const { result } = render(A)
    await waitFor(() => expect(result.current.loadState).toBe('ready'))
    m.setStopStatus.mockResolvedValueOnce(undefined)
    await act(() => result.current.recordStatus('s1', 'done'))
    expect(m.setStopStatus).toHaveBeenCalledWith({}, 's1', 'done', expect.any(String))
    expect(result.current.stops[0]!.shownStatus).toBe('done')

    m.setStopStatus.mockRejectedValueOnce(new Error('地点の状態の変更権限がないか、対象が既に存在しません (RLS deny or not found)'))
    await act(async () => {
      await expect(result.current.recordStatus('s2', 'skipped')).rejects.toThrow(/RLS deny/)
    })
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('「いた」で作れた投稿を地点とつなぎ（sighting）、地点を「済み」にする（AC-06）', async () => {
    const { result } = render(A)
    await waitFor(() => expect(result.current.loadState).toBe('ready'))
    m.linkStopPost.mockResolvedValueOnce('created')
    m.setStopStatus.mockResolvedValueOnce(undefined)
    let outcome = ''
    await act(async () => {
      outcome = await result.current.linkPostAt('s2', 'post-9', 'sighting')
    })
    expect(outcome).toBe('saved')
    expect(m.linkStopPost).toHaveBeenCalledWith({}, { userId: A, stopId: 's2', postId: 'post-9', kind: 'sighting' })
    expect(m.setStopStatus).toHaveBeenCalledWith({}, 's2', 'done', expect.any(String))
    expect(result.current.stops[1]).toMatchObject({ shownStatus: 'done', counts: { sighting: 1 } })
  })

  it('「いた」の投稿はできたが、つなぐ前に通信が切れたら、つながりを送信待ちに積む', async () => {
    const { result } = render(A)
    await waitFor(() => expect(result.current.loadState).toBe('ready'))
    m.linkStopPost.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    let outcome = ''
    await act(async () => {
      outcome = await result.current.linkPostAt('s2', 'post-9', 'sighting')
    })
    expect(outcome).toBe('queued')
    expect((enqueue.mock.calls as unknown as [QueueItem][])[0]![0]).toMatchObject({ type: 'link', userId: A, stopId: 's2', postId: 'post-9', kind: 'sighting' })
  })

  it('「いなかった」の途中で通信が切れたら、作れた投稿の id ごと送信待ちに積む', async () => {
    const { result } = render(A)
    await waitFor(() => expect(result.current.loadState).toBe('ready'))
    m.recordAbsence.mockImplementationOnce(async (_c: unknown, _input: unknown, opts: { onPosted: (s: string, id: string) => void }) => {
      opts.onPosted('american', 'post-a')
      throw new TypeError('Failed to fetch')
    })
    let outcome = ''
    await act(async () => {
      outcome = await result.current.recordAbsenceAt({
        stopId: 's1',
        species: ['american', 'bullfrog'],
        surveyDurationMinutes: null,
        lat: 39.7,
        lng: 140.1,
        accuracy: null,
        locationSource: 'manual',
        locationPrivate: true,
        observedOn: today,
      })
    })
    expect(outcome).toBe('queued')
    expect((enqueue.mock.calls as unknown as [QueueItem][])[0]![0]).toMatchObject({
      type: 'absence',
      userId: A,
      stopId: 's1',
      locationPrivate: true,
      postIds: { american: 'post-a' },
    })
  })

  it('B6: 2 種のうち 1 件目の後に上限で落ちたら、作れた投稿の id ごと送信待ちに残して理由を返す（押し直しで作り直さない）', async () => {
    const { result } = render(A)
    await waitFor(() => expect(result.current.loadState).toBe('ready'))
    m.recordAbsence.mockImplementationOnce(async (_c: unknown, _input: unknown, opts: { onPosted: (s: string, id: string) => void }) => {
      opts.onPosted('american', 'post-a')
      throw { code: 'P0001', message: '24時間以内の投稿上限（5件）に達しました。' }
    })
    await act(async () => {
      await expect(
        result.current.recordAbsenceAt({
          stopId: 's1',
          species: ['american', 'bullfrog'],
          surveyDurationMinutes: null,
          lat: 39.7,
          lng: 140.1,
          accuracy: null,
          locationSource: 'manual',
          locationPrivate: false,
          observedOn: today,
        })
      ).rejects.toMatchObject({ reason: 'partialQueued', detail: 'postLimit' })
    })
    expect((enqueue.mock.calls as unknown as [QueueItem][])[0]![0]).toMatchObject({ type: 'absence', postIds: { american: 'post-a' } })
  })

  it('B1:「この計画をもう一度使う」で地点の id が新しくなっても、前の記録の場所で「希少種あり」になる（控えにも座標が入る）', async () => {
    // 新しい計画の地点 s1〜s3 には、どの記録も付いていない（id で引くと 0 件）
    m.selectRareSightingsForStops.mockResolvedValue({ data: [], error: null })
    // 前の計画の地点 old-2 に付いた記録が、新しい s2（39.71, 140.1）のすぐそばにある
    m.selectOwnRarePointsInBox.mockResolvedValue({ data: [{ id: 'r-old', stop_id: 'old-2', lat: 39.7101, lng: 140.1002 }], error: null })
    const { result } = render(A)
    await waitFor(() => expect(result.current.loadState).toBe('ready'))
    expect(m.selectOwnRarePointsInBox).toHaveBeenCalledWith({}, A, expect.objectContaining({ minLat: expect.any(Number), maxLat: expect.any(Number) }))
    expect(result.current.stops.map((s) => s.rare)).toEqual([false, true, false])
    // 圏外で開き直しても（控え）保護は外れない
    const { readPlanCache } = await import('../../lib/planCache')
    expect(readPlanCache(A)?.rare).toEqual([expect.objectContaining({ id: 'r-old', lat: 39.7101, lng: 140.1002 })])
  })

  it('B1: 記録できたら（計画の外・地点なしでも）近くの地点を保護する', async () => {
    const { result } = render(A)
    await waitFor(() => expect(result.current.loadState).toBe('ready'))
    expect(result.current.stops[2]!.rare).toBe(false)
    await act(async () => {
      await result.current.markRare(null, { id: 'r-new', stop_id: null, lat: 39.7201, lng: 140.1 })
    })
    expect(result.current.stops[2]!.rare).toBe(true)
  })

  it('C1🔴: 計画を作って地点を足した直後から、足した地点の周りの記録で「希少種あり」になり、控えにも入る（圏外の「いた」の判定）', async () => {
    m.selectOwnPlans.mockResolvedValue({ data: [], error: null })
    m.insertPlan.mockResolvedValue(plan('p-new', today))
    m.insertStops.mockResolvedValue([{ ...stop('n1', 0), plan_id: 'p-new', lat: 39.72, lng: 140.1 }])
    // 計画の外で前に記録した希少種（池X）。足す地点のすぐそば
    m.selectOwnRarePointsInBox.mockResolvedValue({ data: [{ id: 'r-x', stop_id: null, lat: 39.7202, lng: 140.1 }], error: null })
    const { result } = render(A)
    await waitFor(() => expect(result.current.loadState).toBe('ready'))
    await act(async () => {
      await result.current.addStops([{ lat: 39.72, lng: 140.1, source: 'pin' }], { newPlanTitle: 't' })
    })
    expect(m.selectOwnRarePointsInBox).toHaveBeenCalledWith({}, A, expect.objectContaining({ minLat: expect.any(Number) }))
    expect(result.current.stops[0]).toMatchObject({ id: 'n1', rare: true })
    // そのまま圏外へ行っても、控えに入っている
    const { readPlanCache } = await import('../../lib/planCache')
    await waitFor(() => expect(readPlanCache(A)?.rare).toEqual([expect.objectContaining({ id: 'r-x' })]))
  })

  it('C1🔴: 足した地点の周りを確かめられなかったら、その地点を仮の印で守る（記録の数には入れない）', async () => {
    m.insertStops.mockResolvedValue([{ ...stop('n1', 3), lat: 39.9, lng: 140.5 }])
    const { result } = render(A)
    await waitFor(() => expect(result.current.loadState).toBe('ready'))
    m.selectOwnRarePointsInBox.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'denied' } })
    await act(async () => {
      await result.current.addStops([{ lat: 39.9, lng: 140.5, source: 'pin' }], { newPlanTitle: 't' })
    })
    expect(result.current.stops[3]).toMatchObject({ id: 'n1', rare: true, counts: { rare: 0 } })
    // ほかの地点は巻き込まない
    expect(result.current.stops[0]!.rare).toBe(false)
  })

  it('C1🔴: 地点を外しても、付いていた記録は落とさず、300 m 以内の別の地点を守り続ける', async () => {
    m.selectStops.mockResolvedValue({ data: [{ ...stop('s1', 0), lat: 39.7, lng: 140.1 }, { ...stop('s2', 1), lat: 39.701, lng: 140.1 }], error: null })
    m.selectRareSightingsForStops.mockResolvedValue({ data: [{ id: 'r1', stop_id: 's1', lat: 39.7, lng: 140.1 }], error: null })
    m.deleteStop.mockResolvedValue(undefined)
    const { result } = render(A)
    await waitFor(() => expect(result.current.stops).toHaveLength(2))
    expect(result.current.stops.map((v) => v.rare)).toEqual([true, true])
    await act(async () => {
      await result.current.removeStop('s1')
    })
    expect(result.current.stops).toHaveLength(1)
    expect(result.current.stops[0]).toMatchObject({ id: 's2', rare: true })
  })

  it('C8: 範囲検索が上限まで返ったら（取りこぼしがありうる）、計画の地点を全部守る', async () => {
    const far = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}`, stop_id: null, lat: 38 + i / 100000, lng: 139 }))
    m.selectOwnRarePointsInBox.mockResolvedValue({ data: far, error: null })
    const { result } = render(A)
    await waitFor(() => expect(result.current.stops).toHaveLength(3))
    expect(result.current.stops.map((v) => v.rare)).toEqual([true, true, true])
    expect(result.current.stops.map((v) => v.counts.rare)).toEqual([0, 0, 0])
  })
})
