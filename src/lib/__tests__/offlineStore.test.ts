import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

import {
  addPendingPost,
  getPendingPosts,
  getPendingCount,
  updatePendingPost,
  deletePendingPost,
  clearAllPending,
  getOfflineDropWarning,
  type PendingPost,
} from '../offlineStore'

// 有効な formData（validatePost を通過する最小構成）。
const validFormData: PendingPost['formData'] = {
  lat: 39.7,
  lng: 140.1,
  species: 'american',
  infoType: 'sighting',
  municipality: '秋田市',
  comment: null,
  count: null,
  observedAt: null,
  weather: null,
  temperature: null,
  humidity: null,
  surveyDurationMinutes: null,
}

function makePhoto(): Blob {
  return new Blob(['photo-bytes'], { type: 'image/jpeg' })
}
function makeAudio(): Blob {
  return new Blob(['audio-bytes'], { type: 'audio/webm' })
}

beforeEach(async () => {
  await clearAllPending()
})

afterEach(async () => {
  await clearAllPending()
  vi.restoreAllMocks()
})

describe('offlineStore — enqueue / list / count', () => {
  it('addPendingPost は id を返し、getPendingPosts / getPendingCount に反映される', async () => {
    const id = await addPendingPost(validFormData, [makePhoto()], null, 'user-1')
    expect(typeof id).toBe('number')

    const all = await getPendingPosts()
    expect(all).toHaveLength(1)
    expect(await getPendingCount()).toBe(1)

    const rec = all[0]!
    expect(rec.id).toBe(id)
    expect(rec.status).toBe('pending')
    expect(rec.formData.species).toBe('american')
    expect(rec.photos).toHaveLength(1)
    expect(typeof rec.createdAt).toBe('string')
  })

  it('複数投入しても順序・件数が保たれる', async () => {
    await addPendingPost(validFormData, [makePhoto()], null, 'user-1')
    await addPendingPost({ ...validFormData, species: 'bullfrog' }, [], null, 'user-1')
    const all = await getPendingPosts()
    expect(all).toHaveLength(2)
    expect(await getPendingCount()).toBe(2)
    expect(all.map((p) => p.formData.species)).toEqual(['american', 'bullfrog'])
  })
})

describe('offlineStore — v2 audio / survey フィールドの退避', () => {
  it('音声 Blob と v2 追加フィールドを保存し、読み戻せる', async () => {
    const rich: PendingPost['formData'] = {
      ...validFormData,
      surveyRequestId: 'req-123',
      locationSource: 'gps',
      surveyMethod: 'structured',
      surveySiteId: 'site-9',
      audioDurationMs: 4200,
      accuracy: 12,
    }
    await addPendingPost(rich, [makePhoto()], { blob: makeAudio(), mimeType: 'audio/webm' }, 'user-1')

    const [rec] = await getPendingPosts()
    // NOTE: fake-indexeddb は Blob を構造化クローンできず読み戻すとプレーン化するため
    // instanceof Blob は使わず、非 null・メタ値で退避を検証する（useOfflineQueue.test と同方針）。
    expect(rec!.audioBlob).not.toBeNull()
    expect(rec!.audioBlob).toBeDefined()
    expect(rec!.audioMimeType).toBe('audio/webm')
    expect(rec!.formData.audioDurationMs).toBe(4200)
    expect(rec!.formData.surveyRequestId).toBe('req-123')
    expect(rec!.formData.locationSource).toBe('gps')
    expect(rec!.formData.surveyMethod).toBe('structured')
    expect(rec!.formData.surveySiteId).toBe('site-9')
    expect(rec!.formData.accuracy).toBe(12)
  })

  it('音声を渡さなければ audioBlob / audioMimeType は null で保存される', async () => {
    await addPendingPost(validFormData, [makePhoto()], null, 'user-1')
    const [rec] = await getPendingPosts()
    expect(rec!.audioBlob).toBeNull()
    expect(rec!.audioMimeType).toBeNull()
  })
})

describe('offlineStore — 上限とバリデーション', () => {
  it('MAX_PENDING(10) を超える 11 件目は例外を投げ、件数は 10 のまま', async () => {
    for (let i = 0; i < 10; i++) {
      await addPendingPost(validFormData, [], null, 'user-1')
    }
    expect(await getPendingCount()).toBe(10)
    await expect(addPendingPost(validFormData, [], null, 'user-1')).rejects.toThrow(/上限/)
    expect(await getPendingCount()).toBe(10)
  })

  it('不正な formData（範囲外の緯度）は保存前に弾かれ、キューに入らない', async () => {
    await expect(
      addPendingPost({ ...validFormData, lat: 999 }, [makePhoto()], null, 'user-1'),
    ).rejects.toThrow()
    expect(await getPendingCount()).toBe(0)
  })

  it('不正な species も弾かれる', async () => {
    await expect(
      addPendingPost({ ...validFormData, species: 'not-a-species' }, [], null, 'user-1'),
    ).rejects.toThrow()
    expect(await getPendingCount()).toBe(0)
  })

  it('ストレージ残量が閾値未満なら例外を投げる（FR-028）', async () => {
    // jsdom には navigator.storage が無いので estimate を差し込む。
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: async () => ({ quota: 100 * 1024 * 1024, usage: 99 * 1024 * 1024 }) },
    })
    await expect(addPendingPost(validFormData, [makePhoto()], null, 'user-1')).rejects.toThrow(/ストレージ/)
    expect(await getPendingCount()).toBe(0)
    // 後片付け（他テストに estimate を漏らさない）
    Reflect.deleteProperty(navigator, 'storage')
  })
})

describe('offlineStore — update / delete / clear', () => {
  it('updatePendingPost は既存レコードにマージし、id を保持する', async () => {
    const id = await addPendingPost(validFormData, [makePhoto()], null, 'user-1')
    await updatePendingPost(id, { status: 'error', errorMessage: 'boom' })

    const [rec] = await getPendingPosts()
    expect(rec!.id).toBe(id)
    expect(rec!.status).toBe('error')
    expect(rec!.errorMessage).toBe('boom')
    // マージなので既存フィールドは残る
    expect(rec!.formData.species).toBe('american')
  })

  it('存在しない id への update は no-op（例外を投げず件数も変えない）', async () => {
    await addPendingPost(validFormData, [], null, 'user-1')
    await expect(updatePendingPost(999999, { status: 'error' })).resolves.toBeUndefined()
    expect(await getPendingCount()).toBe(1)
  })

  it('deletePendingPost は 1 件だけ削除する', async () => {
    const id1 = await addPendingPost(validFormData, [], null, 'user-1')
    await addPendingPost({ ...validFormData, species: 'bullfrog' }, [], null, 'user-1')
    await deletePendingPost(id1)
    const all = await getPendingPosts()
    expect(all).toHaveLength(1)
    expect(all[0]!.formData.species).toBe('bullfrog')
  })

  it('clearAllPending は全件削除する', async () => {
    await addPendingPost(validFormData, [], null, 'user-1')
    await addPendingPost(validFormData, [], null, 'user-1')
    await clearAllPending()
    expect(await getPendingCount()).toBe(0)
  })
})

describe('offlineStore — getOfflineDropWarning', () => {
  it('現状は音声・調査依頼があっても脱落警告は出ない（null）', () => {
    expect(getOfflineDropWarning({ hasAudio: true, hasSurveyRequest: true })).toBeNull()
    expect(getOfflineDropWarning({ hasAudio: true, hasSurveyRequest: false })).toBeNull()
    expect(getOfflineDropWarning({ hasAudio: false, hasSurveyRequest: false })).toBeNull()
  })
})
