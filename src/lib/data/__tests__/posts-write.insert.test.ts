import { describe, it, expect, vi } from 'vitest'
import {
  buildPostInsertRow,
  insertPost,
  postFieldsFromForm,
  postFieldsFromPending,
  type PostSendValues,
  type PostsWriteClient,
} from '../posts-write'
import type { PendingPost } from '@/lib/offlineStore'
import type { PostFormData } from '@/types'

// REQ-331: 投稿の INSERT 行は 1 関数（buildPostInsertRow）で組み立てる。通常の送信（usePostForm）と
// 再送（useOfflineQueue）が**同じ列の組**を送ることを固定する（REQ-185 の「同じ列の集合で復元」）。

/** PostgREST に実際に届く列。JSON にしたとき残るキー（undefined の列は送られない）。 */
function sentColumns(row: object): string[] {
  return Object.keys(JSON.parse(JSON.stringify(row)) as object).sort()
}

// 送る列（location_disclosure は「非公開」を選んだときだけ足す）。列を足したらここにも足す。
const COLUMNS = [
  'accuracy',
  'audio_duration_ms',
  'audio_hash',
  'audio_url',
  'comment',
  'count',
  'experiment_assignments',
  'humidity',
  'image_hashes',
  'info_type',
  'is_anonymous',
  'lat',
  'lng',
  'location_source',
  'municipality',
  'observed_at',
  'photos',
  'species',
  'status',
  'survey_duration_minutes',
  'survey_method',
  'survey_request_id',
  'survey_site_id',
  'temperature',
  'user_id',
  'weather',
]

const fullForm: PostFormData = {
  position: { lat: 39.72, lng: 140.1 },
  species: 'american',
  infoType: 'capture',
  municipality: '秋田市',
  comment: '  池の北側  ',
  count: '3',
  observedAt: '2026-09-30',
  weather: 'sunny',
  temperature: 21.5,
  humidity: 60,
  surveyDurationMinutes: 30,
  surveyRequestId: 'req-1',
  accuracy: 12,
  locationSource: 'gps',
  surveyMethod: 'opportunistic',
  surveySiteId: 'site-1',
  locationPrivate: false,
}

// 任意項目を入れていないフォーム（空文字・未指定のまま送る）
const bareForm: PostFormData = {
  position: { lat: 39.7, lng: 140.05 },
  species: 'bullfrog',
  infoType: 'absence',
  municipality: '',
  comment: '',
  count: '',
  observedAt: '',
}

const sent: PostSendValues = {
  userId: 'user-1',
  photoUrls: ['https://cdn.example/post-photos/user-1/p1.jpg'],
  imageHashes: ['a'.repeat(64)],
  audioUrl: 'https://cdn.example/post-audio/user-1/a1.webm',
  audioHash: 'b'.repeat(64),
  experimentAssignments: { ai_feedback: 'treatment' },
}

const AUDIO_MS = 4200

/** 通常の送信（usePostForm.submitPost）が送る行 */
function normalRow(form: PostFormData) {
  return buildPostInsertRow({ ...postFieldsFromForm(form, form.position!, AUDIO_MS), ...sent })
}

/** 圏外の下書き保存（usePostForm.saveOffline）が端末に入れる中身。保存と読み戻しを JSON で模す。 */
function savedOffline(form: PostFormData): PendingPost['formData'] {
  return JSON.parse(JSON.stringify(postFieldsFromForm(form, form.position!, AUDIO_MS))) as PendingPost['formData']
}

/** 再送（useOfflineQueue.sendOne）が送る行 */
function resendRow(stored: PendingPost['formData']) {
  return buildPostInsertRow({ ...postFieldsFromPending(stored), ...sent })
}

describe('posts の INSERT 行：通常の送信と再送で送る列の組 (REQ-331)', () => {
  it('公開のとき、両方とも同じ 26 列を送る', () => {
    for (const form of [fullForm, bareForm]) {
      const normal = sentColumns(normalRow(form))
      expect(normal).toEqual(COLUMNS)
      expect(sentColumns(resendRow(savedOffline(form)))).toEqual(normal)
    }
  })

  it('非公開を選んだとき、両方とも location_disclosure を足して送る', () => {
    const form = { ...fullForm, locationPrivate: true }
    const normal = sentColumns(normalRow(form))
    expect(normal).toEqual([...COLUMNS, 'location_disclosure'].sort())
    expect(sentColumns(resendRow(savedOffline(form)))).toEqual(normal)
  })

  it('古い版の下書き（REQ-185 より前の項目しか無い）を再送しても、列の組は通常の送信と同じ', () => {
    const v1Draft = {
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
    } satisfies PendingPost['formData']
    expect(sentColumns(resendRow(v1Draft))).toEqual(COLUMNS)
  })

  it('圏外で保存して再送すると、値も通常の送信と同じになる', () => {
    for (const form of [fullForm, bareForm, { ...fullForm, locationPrivate: true }]) {
      expect(resendRow(savedOffline(form))).toEqual(normalRow(form))
    }
  })

  it('再送でも image_hashes と experiment_assignments を送る（以前は抜けていた 2 列）', () => {
    const row = resendRow(savedOffline(fullForm))
    expect(row.image_hashes).toEqual(sent.imageHashes)
    expect(row.experiment_assignments).toEqual(sent.experimentAssignments)
  })
})

describe('buildPostInsertRow の値の決め方', () => {
  it('フォームの文字列を数値・null に直し、決め方の規則（postFields）を通す', () => {
    const row = normalRow(fullForm)
    expect(row).toMatchObject({
      user_id: 'user-1',
      is_anonymous: false,
      comment: '池の北側',
      count: 3,
      status: 'pending',
      // 定点サイトがあれば structured（REQ-174）
      survey_method: 'structured',
      observed_at: new Date('2026-09-30T00:00:00').toISOString(),
      audio_duration_ms: AUDIO_MS,
    })
    expect(row).not.toHaveProperty('location_disclosure')
  })

  it('空のフォームは null で送り、不在確認は自動承認にする', () => {
    const row = buildPostInsertRow({
      ...postFieldsFromForm(bareForm, bareForm.position!, null),
      ...sent,
      photoUrls: [],
      imageHashes: [],
    })
    expect(row).toMatchObject({
      municipality: null,
      comment: null,
      count: null,
      observed_at: null,
      status: 'approved',
      survey_method: 'opportunistic',
      photos: null,
      image_hashes: null,
      audio_duration_ms: null,
    })
  })

  it('写真の hash が 1 枚でも取れていなければ image_hashes は null（REQ-079）', () => {
    const row = buildPostInsertRow({ ...postFieldsFromForm(fullForm, fullForm.position!, null), ...sent, imageHashes: ['a'.repeat(64), null] })
    expect(row.image_hashes).toBeNull()
  })
})

describe('insertPost', () => {
  function fakeClient(result: { data: unknown; error: unknown }) {
    const insert = vi.fn()
    const select = vi.fn()
    const builder = {
      insert: vi.fn((row: unknown) => { insert(row); return builder }),
      select: vi.fn((cols: unknown) => { select(cols); return builder }),
      single: vi.fn(() => Promise.resolve(result)),
    }
    const from = vi.fn(() => builder)
    return { client: { from } as unknown as PostsWriteClient, from, insert, select }
  }

  it('組み立てた行を posts に入れ、作られた行の id を返す', async () => {
    const { client, from, insert, select } = fakeClient({ data: { id: 'post-9' }, error: null })
    const post = { ...postFieldsFromForm(fullForm, fullForm.position!, AUDIO_MS), ...sent }
    await expect(insertPost(client, post)).resolves.toBe('post-9')
    expect(from).toHaveBeenCalledWith('posts')
    expect(insert).toHaveBeenCalledWith(buildPostInsertRow(post))
    expect(select).toHaveBeenCalledWith('id')
  })

  it('エラーはそのまま投げる', async () => {
    const { client } = fakeClient({ data: null, error: new Error('rate limit') })
    const post = { ...postFieldsFromForm(fullForm, fullForm.position!, null), ...sent }
    await expect(insertPost(client, post)).rejects.toThrow('rate limit')
  })

  it('id が返らなければ、作れたと扱わずに投げる', async () => {
    const { client } = fakeClient({ data: null, error: null })
    const post = { ...postFieldsFromForm(fullForm, fullForm.position!, null), ...sent }
    await expect(insertPost(client, post)).rejects.toThrow()
  })
})
