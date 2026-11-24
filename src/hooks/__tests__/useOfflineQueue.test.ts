import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'

// Supabase モック
const uploadMock = vi.fn()
const getPublicUrlMock = vi.fn((path: string) => ({
  // REQ-185: 音声/写真でバケットが異なっても識別できるよう path をそのまま URL に埋める
  data: { publicUrl: `https://cdn/${path}` },
}))
// REQ-185: insert に渡された row を捕捉して列集合・値を検証できるようにする。
// .single() の解決値(= { data, error })を mockResolvedValue で差し込めるよう Promise 返却で型付け。
const insertMock = vi.fn<(row?: unknown) => Promise<{ data: unknown; error: unknown }>>()
const removeMock = vi.fn().mockResolvedValue({ data: [], error: null })
const invokeMock = vi.fn().mockResolvedValue({ data: null, error: null })

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (path: string, blob: Blob, opts: unknown) => uploadMock(path, blob, opts),
        getPublicUrl: (path: string) => getPublicUrlMock(path),
        // REQ-185 FR-185-05: 音声孤立ファイルのロールバック（deleteAudio）用
        remove: (paths: string[]) => removeMock(paths),
      }),
    },
    from: () => ({
      // REQ-185: row を捕捉。既存テストの呼び出し回数アサーションには影響しない
      insert: (row?: unknown) => ({
        select: () => ({
          single: () => insertMock(row),
        }),
      }),
    }),
    functions: {
      invoke: (name: string, opts: unknown) => invokeMock(name, opts),
    },
  },
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

// REQ-330（2 周目 C1）: 調査の地点から作った下書きの保護とつなぎ（中身は offlinePost.test で確かめる）
const op = vi.hoisted(() => ({ mustHide: vi.fn(), link: vi.fn() }))
vi.mock('@/features/fieldwork/data/offlinePost', () => ({ mustHideOfflinePost: op.mustHide, linkOfflinePost: op.link }))

vi.mock('@/lib/errorHandler', () => ({
  logError: vi.fn(),
}))

// REQ-331: 再送でも実験の割付と写真の hash を送る。fake-indexeddb は Blob を読み戻せない
// （下の注記）ため、写真の hash は「端末の写真 1 枚につき 1 つ」を返す関数に差し替えて配線だけを見る。
vi.mock('@/lib/experiments', () => ({
  getMyExperimentVariants: () => Promise.resolve({ ai_feedback: 'treatment' }),
}))
vi.mock('@/lib/hash/sha256', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hash/sha256')>()
  return {
    ...actual,
    sha256HexEach: (blobs: readonly unknown[]) => Promise.resolve(blobs.map((_, i) => `photo-hash-${i}`)),
  }
})

// crypto.randomUUID は jsdom で未定義の場合にフォールバック
if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
  ;(globalThis as unknown as { crypto: { randomUUID: () => string } }).crypto = {
    randomUUID: () => Math.random().toString(36).slice(2),
  }
}

import {
  SENDING_STALE_AFTER_MS,
  isStaleSending,
  useOfflineQueue,
} from '../useOfflineQueue'
import {
  addPendingPost,
  getPendingPosts,
  updatePendingPost,
  deletePendingPost,
  getOfflineDropWarning,
  type PendingPost,
} from '@/lib/offlineStore'

async function clearPending() {
  const all = await getPendingPosts()
  for (const p of all) {
    if (p.id != null) await deletePendingPost(p.id)
  }
}

function makeBlob(): Blob {
  return new Blob(['x'], { type: 'image/jpeg' })
}

function makeAudioBlob(): Blob {
  return new Blob(['audio-bytes'], { type: 'audio/webm' })
}

/** insertMock に渡された posts 行（最後の呼び出し）を取得 */
function lastInsertRow(): Record<string, unknown> {
  const call = insertMock.mock.calls.at(-1)
  return (call?.[0] ?? {}) as Record<string, unknown>
}

beforeEach(() => {
  uploadMock.mockReset()
  insertMock.mockReset()
  removeMock.mockClear()
  invokeMock.mockClear()
})

afterEach(async () => {
  await clearPending()
})

const validPayload = {
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

function pendingPost(overrides: Partial<PendingPost> = {}): PendingPost {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    formData: validPayload,
    photos: [],
    status: 'pending',
    ...overrides,
  }
}

describe('isStaleSending — REQ-293', () => {
  const now = 1_800_000_000_000

  it('sendingStartedAt が無い旧 sending レコードは stale と判定する', () => {
    expect(isStaleSending(pendingPost({ status: 'sending' }), now)).toBe(true)
  })

  it('送信開始から5分未満は stale にせず、5分経過時点で stale にする', () => {
    expect(
      isStaleSending(
        pendingPost({
          status: 'sending',
          sendingStartedAt: now - SENDING_STALE_AFTER_MS + 1,
        }),
        now,
      ),
    ).toBe(false)
    expect(
      isStaleSending(
        pendingPost({
          status: 'sending',
          sendingStartedAt: now - SENDING_STALE_AFTER_MS,
        }),
        now,
      ),
    ).toBe(true)
  })

  it('sending 以外のレコードは時刻にかかわらず stale にしない', () => {
    expect(
      isStaleSending(
        pendingPost({
          status: 'pending',
          sendingStartedAt: now - SENDING_STALE_AFTER_MS,
        }),
        now,
      ),
    ).toBe(false)
  })
})

describe('useOfflineQueue stale sending 復帰 — REQ-293', () => {
  it('初期ロードで時刻の無い旧 sending レコードを pending に戻す', async () => {
    const id = await addPendingPost(validPayload, [], null, 'user-1')
    await updatePendingPost(id, { status: 'sending' })

    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await waitFor(() => expect(result.current.posts[0]?.status).toBe('pending'))

    const [persisted] = await getPendingPosts()
    expect(persisted?.status).toBe('pending')
    expect(persisted?.sendingStartedAt).toBeUndefined()
  })

  it('refresh で5分を過ぎた sending レコードを pending に戻す', async () => {
    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const id = await addPendingPost(validPayload, [], null, 'user-1')
    await updatePendingPost(id, {
      status: 'sending',
      sendingStartedAt: Date.now() - SENDING_STALE_AFTER_MS,
    })

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.posts[0]?.status).toBe('pending')
    const [persisted] = await getPendingPosts()
    expect(persisted?.status).toBe('pending')
    expect(persisted?.sendingStartedAt).toBeUndefined()
  })
})

describe('useOfflineQueue.sendAll', () => {
  it('全アップロード成功時、insert 実行・pending から削除される', async () => {
    uploadMock.mockResolvedValue({ data: { path: 'user-1/abc.jpg' }, error: null })
    insertMock.mockResolvedValue({ data: { id: 'p1', photos: ['u'], species: 'american' }, error: null })

    await addPendingPost(validPayload, [makeBlob()], null, 'user-1')

    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.sendAll()
    })

    expect(insertMock).toHaveBeenCalledTimes(1)
    const remaining = await getPendingPosts()
    expect(remaining).toHaveLength(0)
  })

  it('photo upload 失敗時、post の status が "error" になる（pending は残る）', async () => {
    uploadMock.mockResolvedValue({ data: null, error: { message: 'upload failed' } })

    await addPendingPost(validPayload, [makeBlob(), makeBlob()], null, 'user-1')

    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.sendAll()
    })

    const remaining = await getPendingPosts()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.status).toBe('error')
    expect(remaining[0]?.sendingStartedAt).toBeUndefined()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('成功後に IndexedDB から削除され、refresh 後は再送対象が 0 件になる', async () => {
    uploadMock.mockResolvedValue({ data: { path: 'x.jpg' }, error: null })
    insertMock.mockResolvedValue({ data: { id: 'p1', photos: ['u'], species: 'american' }, error: null })

    await addPendingPost(validPayload, [makeBlob()], null, 'user-1')

    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.sendAll()
    })

    // IDB レベルで削除されていれば、再送時の対象は 0 件
    const persisted = await getPendingPosts()
    expect(persisted).toHaveLength(0)
    expect(insertMock).toHaveBeenCalledTimes(1)
    // AI 判定は DB トリガー経由になったためクライアントからの invoke は呼ばれない
    expect(invokeMock).not.toHaveBeenCalled()
  })
})

// REQ-330 点検 B10: 圏外で保存した投稿の下書きは利用者ごとに分ける。同じ端末で別の人がログインしても、
// 前の人の下書き（位置・写真）を見せず、その人の名義で送らない。持ち主の分からない古い版は送らず、破棄だけできる。
describe('useOfflineQueue — 利用者ごとの下書き（REQ-330 B10）', () => {
  async function seed() {
    const mine = await addPendingPost(validPayload, [], null, 'user-1')
    const others = await addPendingPost({ ...validPayload, species: 'bullfrog' }, [], null, 'user-2')
    // 利用者で分ける前の版（userId なし）
    const legacy = await addPendingPost({ ...validPayload, comment: 'legacy' }, [], null, 'user-1')
    await updatePendingPost(legacy, { userId: undefined })
    return { mine, others, legacy }
  }

  it('今の利用者の下書きだけを出す。別の人の下書きは出さず、古い版は件数だけ返す', async () => {
    const { mine } = await seed()
    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.posts.map((p) => p.id)).toEqual([mine])
    expect(result.current.pendingCount).toBe(1)
    expect(result.current.legacyCount).toBe(1)
  })

  it('まとめて送るのは今の利用者の下書きだけ（別の人・古い版は送らずに残す）', async () => {
    insertMock.mockResolvedValue({ data: { id: 'p1', photos: null, species: 'american' }, error: null })
    const { others, legacy } = await seed()
    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.sendAll()
    })
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(lastInsertRow()).toMatchObject({ user_id: 'user-1', species: 'american' })
    expect((await getPendingPosts()).map((p) => p.id).sort()).toEqual([others, legacy].sort())
  })

  it('C7: 古い版は中身を返し、確認のあと「自分のものとして送る」と自分の名義で送れる', async () => {
    insertMock.mockResolvedValue({ data: { id: 'p-legacy' }, error: null })
    const { legacy } = await seed()
    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.legacy.map((p) => p.id)).toEqual([legacy])
    expect(result.current.legacy[0]!.formData).toMatchObject({ comment: 'legacy' })
    let sent = false
    await act(async () => {
      sent = await result.current.claimLegacy(legacy)
    })
    expect(sent).toBe(true)
    expect(lastInsertRow()).toMatchObject({ user_id: 'user-1', comment: 'legacy' })
    expect(result.current.legacyCount).toBe(0)
  })

  it('C7: 古い版は 1 件ずつ破棄できる（別の人の下書きは残る）', async () => {
    const { others, legacy } = await seed()
    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.discardLegacyOne(legacy)
    })
    expect(result.current.legacyCount).toBe(0)
    expect((await getPendingPosts()).map((p) => p.id)).toContain(others)
  })

  it('C7: 保存の上限（10 件）は利用者ごとに数える（別の人の 10 件で自分が保存できなくならない）', async () => {
    for (let i = 0; i < 10; i++) await addPendingPost(validPayload, [], null, 'user-2')
    await expect(addPendingPost(validPayload, [], null, 'user-2')).rejects.toThrow(/上限/)
    await expect(addPendingPost(validPayload, [], null, 'user-1')).resolves.toEqual(expect.any(Number))
  })

  it('古い版は「破棄」で消せる（別の人の下書きは残る）', async () => {
    const { others } = await seed()
    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.discardLegacy()
    })
    expect(result.current.legacyCount).toBe(0)
    expect((await getPendingPosts()).map((p) => p.id).filter((id) => id !== others)).toHaveLength(1)
  })

  it('保存した利用者を必ず持たせる（名義の無い下書きは作れない）', async () => {
    await expect(addPendingPost(validPayload, [], null, '')).rejects.toThrow()
    const id = await addPendingPost(validPayload, [], null, 'user-1')
    expect((await getPendingPosts('user-1')).find((p) => p.id === id)?.userId).toBe('user-1')
    expect(await getPendingPosts('user-2')).toEqual([])
  })
})

// REQ-330（2 周目の点検 🔴1）: 圏外の「いた」は画面の判定だけで決まるので、送るときに DB で確かめ直す
describe('useOfflineQueue — 調査の地点から作った下書き（REQ-330 C1）', () => {
  beforeEach(() => {
    op.mustHide.mockReset()
    op.link.mockReset().mockResolvedValue('linked')
    insertMock.mockResolvedValue({ data: { id: 'post-9' }, error: null })
  })

  it('送る前に近くの希少種を確かめ、近ければ位置を非公開にして送り、送れたら地点とつなぐ', async () => {
    op.mustHide.mockResolvedValue(true)
    await addPendingPost(validPayload, [], null, 'user-1', { fieldworkStopId: 'stop-9' })
    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.sendAll()
    })
    expect(op.mustHide).toHaveBeenCalledWith(expect.anything(), 'user-1', { lat: validPayload.lat, lng: validPayload.lng }, 'stop-9')
    expect(lastInsertRow()).toMatchObject({ user_id: 'user-1', location_disclosure: 'hidden' })
    expect(op.link).toHaveBeenCalledWith(expect.anything(), 'user-1', 'stop-9', 'post-9')
    expect(await getPendingPosts('user-1')).toEqual([])
  })

  it('近くに無ければ公開のまま送る（下書きで非公開を選んでいれば非公開のまま）', async () => {
    op.mustHide.mockResolvedValue(false)
    await addPendingPost(validPayload, [], null, 'user-1', { fieldworkStopId: 'stop-9' })
    await addPendingPost({ ...validPayload, locationPrivate: true }, [], null, 'user-1', { fieldworkStopId: 'stop-9' })
    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.sendAll()
    })
    const rows = insertMock.mock.calls.map(([row]) => row as Record<string, unknown>)
    expect(rows[0]).not.toHaveProperty('location_disclosure')
    expect(rows[1]).toMatchObject({ location_disclosure: 'hidden' })
  })

  it('確かめる途中で通信が切れたら、送らずに残す（あとで送り直す）', async () => {
    op.mustHide.mockRejectedValue(new TypeError('Failed to fetch'))
    await addPendingPost(validPayload, [], null, 'user-1', { fieldworkStopId: 'stop-9' })
    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.sendAll()
    })
    expect(insertMock).not.toHaveBeenCalled()
    expect(op.link).not.toHaveBeenCalled()
    const [left] = await getPendingPosts('user-1')
    expect(left).toMatchObject({ status: 'error', fieldworkStopId: 'stop-9' })
  })

  it('地点から作っていない下書きは確かめずに送る（地点ともつながない）', async () => {
    await addPendingPost(validPayload, [], null, 'user-1')
    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.sendAll()
    })
    expect(op.mustHide).not.toHaveBeenCalled()
    expect(op.link).not.toHaveBeenCalled()
    expect(insertMock).toHaveBeenCalledTimes(1)
  })
})

// REQ-185: 音声・調査依頼紐付け・位置取得手段・調査手法の退避と完全復元
describe('useOfflineQueue.sendOne — REQ-185 完全復元', () => {
  // 全項目を含む下書き payload（formData）
  const richPayload = {
    ...validPayload,
    surveyRequestId: 'req-123',
    locationSource: 'gps' as const,
    surveyMethod: 'opportunistic' as const,
    surveySiteId: null,
    audioDurationMs: 4200,
  }

  it('AC-04(a)/AC-01/AC-03: 音声つき・調査依頼紐付き下書きを再送すると、音声がアップロードされ posts 行に全カラムが揃う', async () => {
    uploadMock.mockResolvedValue({ data: { path: 'user-1/audio-or-photo' }, error: null })
    insertMock.mockResolvedValue({ data: { id: 'p1', photos: ['u'], audio_url: 'a', species: 'american' }, error: null })

    // 音声 Blob を含めて退避（FR-185-02/FR-185-04）
    await addPendingPost(
      richPayload,
      [makeBlob()],
      {
        blob: makeAudioBlob(),
        mimeType: 'audio/webm',
      },
      'user-1',
    )

    // 退避時点で IndexedDB に音声が保持されていること（取得 = AC-04(a)）。
    // NOTE: fake-indexeddb は jsdom 環境で Blob を構造化クローンできず、読み戻すと
    // プレーンオブジェクトになるため instanceof Blob は使えない。音声メタ（mimeType・
    // duration）と非 null の音声フィールドが永続化されていることで「退避」を検証する。
    const stored = await getPendingPosts()
    expect(stored).toHaveLength(1)
    expect(stored[0]?.audioBlob).not.toBeNull()
    expect(stored[0]?.audioBlob).toBeDefined()
    expect(stored[0]?.audioMimeType).toBe('audio/webm')
    expect(stored[0]?.formData.audioDurationMs).toBe(4200)
    expect(stored[0]?.formData.surveyRequestId).toBe('req-123')

    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.sendAll()
    })

    // 写真 + 音声で upload は 2 回呼ばれる（FR-185-05）
    expect(uploadMock).toHaveBeenCalledTimes(2)

    // posts 行が submitPost と同一カラム集合・値で復元される（FR-185-06 / AC-01 / AC-03）
    const row = lastInsertRow()
    expect(row.audio_url).toEqual(expect.any(String)) // 再生可能 URL
    expect(row.audio_duration_ms).toBe(4200)
    expect(row.survey_request_id).toBe('req-123')
    expect(row.location_source).toBe('gps')
    expect(row.survey_method).toBe('opportunistic')
    expect(row.survey_site_id).toBeNull()
    expect('audio_hash' in row).toBe(true)

    // 成功 → IndexedDB から削除
    const remaining = await getPendingPosts()
    expect(remaining).toHaveLength(0)
  })

  it('REQ-331: 再送でも image_hashes（端末の写真から）と experiment_assignments（再送時の割付）を送る', async () => {
    uploadMock.mockResolvedValue({ data: { path: 'user-1/x.jpg' }, error: null })
    insertMock.mockResolvedValue({ data: { id: 'p1' }, error: null })

    await addPendingPost(validPayload, [makeBlob(), makeBlob()], null, 'user-1')

    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.sendAll()
    })

    const row = lastInsertRow()
    expect(row.image_hashes).toEqual(['photo-hash-0', 'photo-hash-1'])
    expect(row.experiment_assignments).toEqual({ ai_feedback: 'treatment' })
    expect(await getPendingPosts()).toHaveLength(0)
  })

  it('FR-185-06: surveySiteId 指定時は survey_method=structured で復元される（submitPost と同一規則）', async () => {
    uploadMock.mockResolvedValue({ data: { path: 'user-1/x' }, error: null })
    insertMock.mockResolvedValue({ data: { id: 'p1', photos: null, audio_url: null, species: 'american' }, error: null })

    await addPendingPost(
      { ...richPayload, surveyMethod: 'opportunistic', surveySiteId: 'site-9' },
      [],
      null,
      'user-1',
    )

    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.sendAll()
    })

    const row = lastInsertRow()
    expect(row.survey_method).toBe('structured')
    expect(row.survey_site_id).toBe('site-9')
  })

  it('FR-185-05: 音声アップロード失敗時は status=error で pending が残り、insert は呼ばれない', async () => {
    // uploadAudio は error 時に throw する → 写真が無ければ最初の upload が音声
    uploadMock.mockResolvedValue({ data: null, error: { message: 'audio upload failed' } })

    await addPendingPost(richPayload, [], { blob: makeAudioBlob(), mimeType: 'audio/webm' }, 'user-1')

    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.sendAll()
    })

    const remaining = await getPendingPosts()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.status).toBe('error')
    // 音声メタが保持されたまま = 次回再送可能（FR-185-05）。
    // （fake-indexeddb は Blob を構造化クローンできないため非 null と mimeType で検証）
    expect(remaining[0]?.audioBlob).not.toBeNull()
    expect(remaining[0]?.audioMimeType).toBe('audio/webm')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('FR-185-05: insert 失敗時はアップロード済み音声の孤立ファイルを削除する', async () => {
    uploadMock.mockResolvedValue({ data: { path: 'user-1/audio.webm' }, error: null })
    // insert はエラーを返す
    insertMock.mockResolvedValue({ data: null, error: { message: 'insert failed' } })

    await addPendingPost(richPayload, [], { blob: makeAudioBlob(), mimeType: 'audio/webm' }, 'user-1')

    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.sendAll()
    })

    // deleteAudio（storage.remove）が呼ばれ、孤立ファイルを残さない
    expect(removeMock).toHaveBeenCalledTimes(1)
    const remaining = await getPendingPosts()
    expect(remaining[0]?.status).toBe('error')
  })

  it('AC-04(b)/FR-185-08: 旧スキーマ相当（音声・新カラム無し）の下書きも例外なく再送できる', async () => {
    uploadMock.mockResolvedValue({ data: { path: 'user-1/x.jpg' }, error: null })
    insertMock.mockResolvedValue({ data: { id: 'p1', photos: ['u'], audio_url: null, species: 'american' }, error: null })

    // validPayload は旧 saveOffline の formData 形（新フィールドを一切持たない）。
    // 音声 Blob も渡さない = 旧 v1 下書きの再現。
    await addPendingPost(validPayload, [makeBlob()], null, 'user-1')

    // 退避レコードは新フィールドを持たない（後方互換読み出し）
    const stored = await getPendingPosts()
    const fd = (stored[0] as PendingPost).formData
    expect(fd.surveyRequestId ?? null).toBeNull()
    expect(stored[0]?.audioBlob ?? null).toBeNull()

    const { result } = renderHook(() => useOfflineQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.sendAll()
    })

    // 例外で停止せず insert され、null/既定値で安全に復元される
    expect(insertMock).toHaveBeenCalledTimes(1)
    const row = lastInsertRow()
    expect(row.audio_url).toBeNull()
    expect(row.audio_duration_ms).toBeNull()
    expect(row.survey_request_id).toBeNull()
    expect(row.location_source).toBeNull()
    // 旧下書きは surveySiteId 無し → 既定 opportunistic
    expect(row.survey_method).toBe('opportunistic')
    expect(row.survey_site_id).toBeNull()
    // 音声アップロードは発生しない（写真 1 枚のみ）
    expect(uploadMock).toHaveBeenCalledTimes(1)
    const remaining = await getPendingPosts()
    expect(remaining).toHaveLength(0)
  })
})

// REQ-185 FR-185-07 / AC-05: 脱落警告メカニズム
describe('getOfflineDropWarning — REQ-185 脱落警告', () => {
  it('AC-05: 完全対応済みの現状では、音声・調査依頼があっても警告は出ない（null）', () => {
    expect(getOfflineDropWarning({ hasAudio: true, hasSurveyRequest: true })).toBeNull()
    expect(getOfflineDropWarning({ hasAudio: false, hasSurveyRequest: false })).toBeNull()
  })
})
