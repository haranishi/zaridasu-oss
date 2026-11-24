import { describe, it, expect } from 'vitest'
import 'fake-indexeddb/auto'
import { openDB } from 'idb'

// 別ファイルにすることで vitest がモジュールレジストリと fake-indexeddb をこのファイル専用に
// 隔離する（offlineStore の dbPromise シングルトンが未初期化のまま、まず v1 を素の idb で作れる）。
import { getPendingPosts, type PendingPost } from '../offlineStore'

const DB_NAME = 'zaridasu-offline'
const STORE = 'pending-posts'

describe('offlineStore — v1 → v2 マイグレーション（FR-185-03/08）', () => {
  it('音声・新カラムを持たない v1 レコードを開くと、欠落フィールドが null で後方補完される', async () => {
    // 1) 旧 v1 スキーマの DB を素の idb で作成し、レガシー下書き（v2 追加フィールド無し）を投入。
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      },
    })
    const legacy = {
      createdAt: '2024-01-01T00:00:00.000Z',
      formData: {
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
        // v2 の追加フィールド（surveyRequestId / locationSource / surveyMethod /
        // surveySiteId / audioDurationMs）は意図的に持たせない。
      },
      photos: [] as Blob[],
      status: 'pending' as const,
      // audioBlob / audioMimeType も持たせない。
    }
    await v1.add(STORE, legacy)
    // upgrade を v2 で再実行できるよう接続を閉じる（開いたままだと blocked になる）。
    v1.close()

    // 2) offlineStore 経由でアクセス → getDB が v2 で開き upgrade(oldVersion=1) が migration を走らせる。
    const posts = await getPendingPosts()
    expect(posts).toHaveLength(1)

    const rec = posts[0] as PendingPost
    // v2 追加フィールドが null で補完されている（sendOne 側の分岐単純化のため明示 null 化）。
    expect(rec.formData.surveyRequestId).toBeNull()
    expect(rec.formData.locationSource).toBeNull()
    expect(rec.formData.surveyMethod).toBeNull()
    expect(rec.formData.surveySiteId).toBeNull()
    expect(rec.formData.audioDurationMs).toBeNull()
    expect(rec.audioBlob).toBeNull()
    expect(rec.audioMimeType).toBeNull()
    // 既存フィールドは保持される。
    expect(rec.formData.species).toBe('american')
    expect(rec.status).toBe('pending')
  })
})
