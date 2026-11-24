// REQ-330: 希少種の写真（非公開の置き場 rare-photos）の出し入れ。
//
// - 置けるのは自分のフォルダ（<user_id>/）だけ。読めるのと消せるのは自分のフォルダか管理者。上書きは無い。
// - 表示は期限付きの署名 URL（1 時間）だけ。**公開 URL は作らない**（getPublicUrl を呼ばない）。
// - 置く前に lib/imageProcessor.ts で EXIF（撮影位置）を消す。processImage は読めない画像を
//   「元のファイルのまま」返すので、その場合は送らない（非公開の置き場でも、管理者の端末に保存された
//   写真から位置が漏れうるため）。
// - post-photos は誰でも一覧できる置き場なので、希少種の写真は絶対にそこへ置かない。

import { processImage } from '@/lib/imageProcessor'

import {
  FIELDWORK_LIMITS,
  RARE_PHOTOS_BUCKET,
  RARE_PHOTO_SIGNED_URL_TTL_SECONDS,
} from '../constants'
import type { FieldworkClient } from './shared'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface RarePhotoUrl {
  path: string
  url: string
}

/**
 * EXIF を消して自分のフォルダに置き、置いたパスを返す（rare_sightings.photo_paths に入れる値）。
 * パスは `<user_id>/<uuid>.jpg` に固定し、利用者が付けたファイル名は使わない。
 * `options.process` はテスト用の差し替え口（既定は processImage）。
 */
export async function uploadRarePhoto(
  client: FieldworkClient,
  userId: string,
  file: File,
  options: { process?: (file: File) => Promise<File> } = {}
): Promise<string> {
  if (!UUID_PATTERN.test(userId)) throw new Error('利用者 ID の形式が正しくありません')
  const processed = await (options.process ?? processImage)(file)
  if (processed === file || processed.type !== 'image/jpeg') {
    throw new Error('写真の位置情報（EXIF）を消せなかったため、送りませんでした')
  }
  if (processed.size > FIELDWORK_LIMITS.rarePhotoMaxBytes) {
    throw new Error('写真が大きすぎます（5MB まで）')
  }
  const path = `${userId.toLowerCase()}/${crypto.randomUUID()}.jpg`
  const { error } = await client.storage
    .from(RARE_PHOTOS_BUCKET)
    .upload(path, processed, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false })
  if (error) throw error
  return path
}

/** 表示用の署名 URL（1 時間）。読めなかったパス（他人の写真・消えた写真）は結果に入らない。 */
export async function createRarePhotoUrls(
  client: FieldworkClient,
  paths: readonly string[]
): Promise<RarePhotoUrl[]> {
  if (paths.length === 0) return []
  const { data, error } = await client.storage
    .from(RARE_PHOTOS_BUCKET)
    .createSignedUrls([...paths], RARE_PHOTO_SIGNED_URL_TTL_SECONDS)
  if (error) throw error
  return (data ?? []).flatMap((item) =>
    !item.error && item.path && item.signedUrl ? [{ path: item.path, url: item.signedUrl }] : []
  )
}

/**
 * 写真を消し、消せたパスを返す。1 つも消せなければ投げる（RLS で拒否されても
 * エラーにならず空で返るため。表の UPDATE / DELETE の 0 行と同じ扱い）。
 */
export async function removeRarePhotos(
  client: FieldworkClient,
  paths: readonly string[]
): Promise<string[]> {
  if (paths.length === 0) return []
  const { data, error } = await client.storage.from(RARE_PHOTOS_BUCKET).remove([...paths])
  if (error) throw error
  const removed = (data ?? []).map((object) => object.name)
  if (removed.length === 0) {
    throw new Error('写真を消す権限がないか、写真が既にありません (RLS deny or not found)')
  }
  return removed
}

/** 一度に一覧して消す数と、繰り返しの上限（1 人 5000 件 × 3 枚まで＝15 回で足りる）。 */
const PURGE_PAGE = 1000
const PURGE_MAX_ROUNDS = 20

/**
 * 退会の前の写真の削除で、退会を止めるべき失敗。
 * - denied: 消す権限が無い（RLS で 0 件しか消えない）
 * - tooMany: 回数の上限まで繰り返しても消し切れない
 */
export class RarePhotoPurgeError extends Error {
  readonly kind: 'denied' | 'tooMany'

  constructor(kind: 'denied' | 'tooMany') {
    super(kind === 'denied' ? '写真を消す権限がありません (RLS deny)' : '写真が多すぎて一度に消し切れませんでした')
    this.name = 'RarePhotoPurgeError'
    this.kind = kind
  }
}

/** 写真の置き場そのものが無い（その環境に希少種の機能が入っていない）。消す写真も無いので、退会を進めてよい。 */
export function isMissingBucketError(err: unknown): boolean {
  const o = (err ?? {}) as { message?: unknown; error?: unknown; statusCode?: unknown }
  const text = `${typeof o.message === 'string' ? o.message : ''} ${typeof o.error === 'string' ? o.error : ''}`
  return /bucket not found/i.test(text)
}

/**
 * 退会の前に、自分のフォルダ（<user_id>/）の写真を全部消し、消した数を返す。
 * SQL で storage.objects の行を消しても置き場の実体は残るので、Storage API で一覧して消す。
 * 失敗の扱い（呼び手の AuthContext.deleteAccount と同じ約束）:
 * - 権限で 0 件しか消えない・回数の上限 → RarePhotoPurgeError を投げる。呼び手は退会を止める
 * - 通信の失敗・そのほかの失敗 → そのまま投げる。呼び手は退会を止める（やり直してもらう）
 * - 置き場が無い（isMissingBucketError）→ そのまま投げる。呼び手は記録して退会を進める
 */
export async function removeAllOwnRarePhotos(client: FieldworkClient, userId: string): Promise<number> {
  if (!UUID_PATTERN.test(userId)) throw new Error('利用者 ID の形式が正しくありません')
  const folder = userId.toLowerCase()
  const bucket = client.storage.from(RARE_PHOTOS_BUCKET)
  let removed = 0
  for (let round = 0; round < PURGE_MAX_ROUNDS; round++) {
    const { data, error } = await bucket.list(folder, { limit: PURGE_PAGE })
    if (error) throw error
    // 一覧にはフォルダの見出し（id が null）も混ざる。写真は <user_id>/ の直下にだけ置いている
    const paths = (data ?? []).filter((o) => o.id != null && o.name).map((o) => `${folder}/${o.name}`)
    if (paths.length === 0) return removed
    const { data: gone, error: removeError } = await bucket.remove(paths)
    if (removeError) throw removeError
    if (!gone || gone.length === 0) throw new RarePhotoPurgeError('denied')
    removed += gone.length
  }
  throw new RarePhotoPurgeError('tooMany')
}
