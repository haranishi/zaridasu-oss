import { openDB, type IDBPDatabase } from 'idb'
import { validatePost } from './postValidation'
import type { LocationSource } from '@/types'

const DB_NAME = 'zaridasu-offline'
// REQ-185 FR-185-03: v1 → v2 で録音音声・調査依頼紐付け・位置取得手段・調査手法を
// 退避できるようスキーマを拡張。upgrade で既存レコードを後方互換マイグレーションする。
const DB_VERSION = 2
const STORE_NAME = 'pending-posts'
const MAX_PENDING = 10

export interface PendingPost {
  id?: number
  createdAt: string
  // REQ-330（点検で見つかった穴）: 保存した利用者。表示と送信は今の利用者のものだけにする。
  // 同じ端末で別の人がログインしても、前の人の下書き（位置・写真）を見せたり、その人の名義で送ったりしない。
  // これより前の版の下書きには無い（＝持ち主が分からない）。送らず、マイページで件数だけ出して破棄できるようにする。
  userId?: string | null
  // REQ-330（2 周目の点検）: 調査計画の地点から作った下書きの印。送るときに、その位置の近く（とその地点）に
  // 自分の希少種の記録が無いかを DB で確かめ直し、近ければ位置を非公開にする。送れたら地点とつなぐ。
  fieldworkStopId?: string | null
  // PostFormData からは導かない: 端末に残った古い版（項目が無い・型が広い）も読むので、保存の形は DB_VERSION と組で手で固定する（入れる値は postFieldsFromForm、読むのは postFieldsFromPending）。
  formData: {
    lat: number
    lng: number
    species: string
    infoType: string
    municipality: string | null
    comment: string | null
    count: number | null
    observedAt: string | null
    weather: string | null
    temperature: number | null
    humidity: number | null
    surveyDurationMinutes: number | null
    // REQ-172: 位置精度（m）。手動選択時は null
    accuracy?: number | null
    // REQ-185 FR-185-01: オンライン投稿（submitPost）と等価に復元するための項目。
    // PostFormData の対応フィールドと型整合を取る。
    // REQ-086 Phase 2: 調査依頼への返答リンク。再送時に DB トリガーが responded 遷移させる。
    surveyRequestId?: string | null
    // REQ-172: 位置取得手段（'gps' | 'manual'）
    locationSource?: LocationSource | null
    // REQ-174: 調査手法と定点サイト
    surveyMethod?: 'structured' | 'opportunistic' | null
    surveySiteId?: string | null
    // REQ-083: 録音 duration（ms）
    audioDurationMs?: number | null
    // REQ-329: 位置を非公開にする（旧下書きには無い＝公開扱い。DB バージョンは上げない）
    locationPrivate?: boolean | null
  }
  /** 処理済み JPEG Blob の配列 */
  photos: Blob[]
  // REQ-185 FR-185-02: 録音音声を IndexedDB に直接退避（Base64 変換しない）。
  // 旧スキーマ（v1）の下書きには存在しないため optional。
  audioBlob?: Blob | null
  audioMimeType?: string | null
  status: 'pending' | 'sending' | 'error'
  sendingStartedAt?: number
  errorMessage?: string
}

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      // REQ-185 FR-185-03 / FR-185-08: oldVersion を見て段階的にマイグレーション。
      // 新規フィールドは null/既定値で補完し、既存下書きが読めなくならないようにする。
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
        }
        // v1 → v2: 音声・新カラムを持たない既存レコードに既定値を後方補完する。
        // 新規キーは optional のため未補完でも読み出しは可能だが、明示的に null を
        // 入れておくことで sendOne 側の分岐を単純化し、後続の差分検知も安定させる。
        if (oldVersion >= 1 && oldVersion < 2) {
          const store = tx.objectStore(STORE_NAME)
          let cursor = await store.openCursor()
          while (cursor) {
            const rec = cursor.value as PendingPost
            const migrated: PendingPost = {
              ...rec,
              formData: {
                ...rec.formData,
                surveyRequestId: rec.formData.surveyRequestId ?? null,
                locationSource: rec.formData.locationSource ?? null,
                surveyMethod: rec.formData.surveyMethod ?? null,
                surveySiteId: rec.formData.surveySiteId ?? null,
                audioDurationMs: rec.formData.audioDurationMs ?? null,
              },
              audioBlob: rec.audioBlob ?? null,
              audioMimeType: rec.audioMimeType ?? null,
            }
            await cursor.update(migrated)
            cursor = await cursor.continue()
          }
        }
      },
    })
  }
  return dbPromise
}

/** ストレージ残容量チェック（FR-028） */
async function checkStorageQuota(): Promise<void> {
  if (navigator.storage?.estimate) {
    const { quota, usage } = await navigator.storage.estimate()
    if (quota && usage) {
      const remaining = quota - usage
      if (remaining < 10 * 1024 * 1024) { // 10MB未満
        throw new Error('端末のストレージ容量が不足しています。不要な下書きを削除してください。')
      }
    }
  }
}

/**
 * 下書きに退避する音声（任意）。IndexedDB は Blob を直接格納できるため変換しない。
 * REQ-185 FR-185-02。
 */
export interface PendingAudio {
  blob: Blob
  mimeType: string
}

/**
 * 下書きを保存。上限 MAX_PENDING 件は利用者ごとに数える（同じ端末の別の人の下書きで、自分が保存できなくならない）。
 * 保存した利用者を必ず持たせる。
 */
export async function addPendingPost(
  formData: PendingPost['formData'],
  photos: Blob[],
  audio: PendingAudio | null | undefined,
  userId: string,
  extra: { fieldworkStopId?: string | null } = {},
): Promise<number> {
  if (!userId) throw new Error('下書きの保存にはログインが必要です')
  const db = await getDB()
  const count = (await getPendingPosts(userId)).length
  if (count >= MAX_PENDING) {
    throw new Error(`下書きの上限（${MAX_PENDING}件）に達しています。既存の下書きを送信または削除してください。`)
  }
  await checkStorageQuota()

  // FR-029: 保存前バリデーション
  const validation = validatePost({
    comment: formData.comment,
    count: formData.count,
    lat: formData.lat,
    lng: formData.lng,
    species: formData.species,
    info_type: formData.infoType,
  })
  if (!validation.valid) {
    throw new Error(validation.error ?? '入力データに問題があります')
  }

  const post: PendingPost = {
    createdAt: new Date().toISOString(),
    userId,
    fieldworkStopId: extra.fieldworkStopId ?? null,
    formData,
    photos,
    // REQ-185 FR-185-02: 録音音声を退避（無ければ null）
    audioBlob: audio?.blob ?? null,
    audioMimeType: audio?.mimeType ?? null,
    status: 'pending',
  }
  const id = await db.add(STORE_NAME, post)
  return id as number
}

/**
 * REQ-185 FR-185-07: オフライン下書きへ退避できない項目が残る場合に表示する警告の i18n キー。
 * t() の引数と完全一致させる（サイドカー docs/_i18n_pending/REQ-185.json に定義）。
 */
export const OFFLINE_AUDIO_DROP_WARNING_KEY = 'postForm.offlineAudioDropWarning'

/**
 * REQ-185 FR-185-07 / AC-05: オフライン下書きへ退避できない（＝再送で復元できない）
 * 項目が残る場合に、ユーザーへ出す警告の i18n キーを返す。完全対応済みの現状では
 * 退避不能項目は無いため常に null を返し、saveOffline は警告を出さない。
 *
 * 段階的実装で一部項目が未対応の期間（例: 音声未対応）は、`SUPPORTS_OFFLINE_AUDIO` を
 * false にするだけで、音声入力時に警告キーを返して「サイレント消失」を防げる。判定ロジック
 * をここに一元化することで保存経路（usePostForm.saveOffline）から呼ぶだけでよく、UI 層の
 * 改変なしにテスト可能にする。
 */
// 型を boolean に明示し、将来フラグを倒すだけで警告ロジックが有効化されるようにする
// （リテラル true へ型が狭まり分岐がデッドコード扱いされるのを防ぐ）。
const SUPPORTS_OFFLINE_AUDIO: boolean = true

export function getOfflineDropWarning(input: {
  hasAudio: boolean
  hasSurveyRequest: boolean
}): string | null {
  // 現状: 音声・調査依頼紐付けともに退避・復元に対応済み。脱落は発生しない。
  if (!SUPPORTS_OFFLINE_AUDIO && input.hasAudio) {
    return OFFLINE_AUDIO_DROP_WARNING_KEY
  }
  return null
}

/**
 * 下書きを取得。userId を渡すとその人の下書きだけ（画面と送信はこちらを使う）。
 * 渡さなければ端末の全件（持ち主の分からない古い版も含む。移行と片付け用）。
 */
export async function getPendingPosts(userId?: string): Promise<PendingPost[]> {
  const db = await getDB()
  const all: PendingPost[] = await db.getAll(STORE_NAME)
  return userId === undefined ? all : all.filter((p) => !!p.userId && p.userId === userId)
}

/** 下書き件数を取得（userId を渡すとその人の分だけ）。 */
export async function getPendingCount(userId?: string): Promise<number> {
  if (userId === undefined) {
    const db = await getDB()
    return db.count(STORE_NAME)
  }
  return (await getPendingPosts(userId)).length
}

/** 持ち主の分からない古い版の下書き（userId が無い）。送らない。 */
export async function getLegacyPendingPosts(): Promise<PendingPost[]> {
  return (await getPendingPosts()).filter((p) => !p.userId)
}

/** 持ち主の分からない古い版の下書きを全部消し、消した件数を返す。 */
export async function deleteLegacyPendingPosts(): Promise<number> {
  const legacy = await getLegacyPendingPosts()
  const db = await getDB()
  for (const p of legacy) if (p.id != null) await db.delete(STORE_NAME, p.id)
  return legacy.length
}

/** その人の下書きを全部消す（退会のとき）。 */
export async function deletePendingPostsOf(userId: string): Promise<void> {
  const mine = await getPendingPosts(userId)
  const db = await getDB()
  for (const p of mine) if (p.id != null) await db.delete(STORE_NAME, p.id)
}

/** 下書きを更新 */
export async function updatePendingPost(id: number, updates: Partial<PendingPost>): Promise<void> {
  const db = await getDB()
  const existing = await db.get(STORE_NAME, id)
  if (!existing) return
  await db.put(STORE_NAME, { ...existing, ...updates, id })
}

/** 下書きを削除 */
export async function deletePendingPost(id: number): Promise<void> {
  const db = await getDB()
  await db.delete(STORE_NAME, id)
}

/** 全下書きを削除 */
export async function clearAllPending(): Promise<void> {
  const db = await getDB()
  await db.clear(STORE_NAME)
}
