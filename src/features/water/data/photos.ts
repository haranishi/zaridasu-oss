import { processImage } from '@/lib/imageProcessor'

import { WATER_PHOTO_SIGNED_URL_TTL_SECONDS, WATER_REPORT_LIMITS, WATER_REPORT_PHOTOS_BUCKET } from '../constants'
import type { WaterClient } from './reports'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const WATER_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const
const prepared = new WeakSet<File>()
const preparing = new WeakMap<File, Promise<File>>()
// A lost upload response must not give the same immutable photo another object name.
const uploads = new WeakMap<File, Map<string, { path: string; attempted: boolean; uploaded: boolean }>>()

function isUploadConflict(error: { status?: unknown; statusCode?: unknown; code?: unknown }): boolean {
  // Current Storage SDKs keep the HTTP status separately from the named service error code.
  const exists = (code: unknown) => code === 'ResourceAlreadyExists' || code === 'KeyAlreadyExists' || code === 'already_exists'
  return String(error.status) === '409' || String(error.statusCode) === '409'
    || exists(error.statusCode) || exists(error.code)
}

export class WaterPhotoError extends Error {
  constructor(readonly kind: 'fileType' | 'fileSize' | 'conversion') {
    super(`Water photo ${kind}`)
    this.name = 'WaterPhotoError'
  }
}

/** Native decoding, JPEG re-encoding and 1280px reduction remove EXIF before preview or upload. */
export async function prepareWaterPhoto(
  file: File,
  options: { process?: (file: File) => Promise<File> } = {}
): Promise<File> {
  if (prepared.has(file)) return file
  if (!(WATER_PHOTO_TYPES as readonly string[]).includes(file.type)) throw new WaterPhotoError('fileType')
  if (file.size === 0 || file.size > WATER_REPORT_LIMITS.inputPhotoMaxBytes) throw new WaterPhotoError('fileSize')
  const pending = preparing.get(file)
  if (pending) return pending
  const task = (async () => {
    let jpeg: File
    try {
      jpeg = await (options.process ?? processImage)(file)
    } catch {
      throw new WaterPhotoError('conversion')
    }
    // The processor returns its original on native decode failure, including unsupported HEIC.
    if (jpeg === file || jpeg.type !== 'image/jpeg' || jpeg.size === 0 || jpeg.size > WATER_REPORT_LIMITS.photoMaxBytes) {
      throw new WaterPhotoError('conversion')
    }
    prepared.add(jpeg)
    return jpeg
  })()
  preparing.set(file, task)
  try {
    return await task
  } catch (error) {
    preparing.delete(file)
    throw error
  }
}

/** Only the processor's sanitized File can skip conversion; a JPEG MIME label cannot. */
export async function uploadWaterPhoto(
  client: WaterClient,
  userId: string,
  file: File,
  options: { process?: (file: File) => Promise<File> } = {}
): Promise<string> {
  if (!UUID.test(userId)) throw new Error('Invalid water photo owner')
  const jpeg = await prepareWaterPhoto(file, options)
  const owner = userId.toLowerCase()
  const attempts = uploads.get(jpeg) ?? new Map()
  uploads.set(jpeg, attempts)
  const attempt = attempts.get(owner) ?? { path: `${owner}/${crypto.randomUUID()}.jpg`, attempted: false, uploaded: false }
  attempts.set(owner, attempt)
  if (attempt.uploaded) return attempt.path
  const retry = attempt.attempted
  attempt.attempted = true
  const { error } = await client.storage.from(WATER_REPORT_PHOTOS_BUCKET).upload(attempt.path, jpeg, {
    contentType: 'image/jpeg', cacheControl: '3600', upsert: false,
  })
  // This path was generated for this File and never overwritten. A retry conflict confirms acceptance.
  if (error && !(retry && isUploadConflict(error))) throw error
  attempt.uploaded = true
  return attempt.path
}

export async function createWaterPhotoUrls(client: WaterClient, paths: readonly string[]): Promise<{ path: string; url: string }[]> {
  if (paths.length === 0) return []
  const { data, error } = await client.storage.from(WATER_REPORT_PHOTOS_BUCKET)
    .createSignedUrls([...paths], WATER_PHOTO_SIGNED_URL_TTL_SECONDS)
  if (error) throw error
  return (data ?? []).flatMap((item) =>
    !item.error && item.path && item.signedUrl ? [{ path: item.path, url: item.signedUrl }] : []
  )
}

/** Fail closed on partial deletion, including Storage's silent RLS rejection. */
export async function removeWaterPhotos(client: WaterClient, paths: readonly string[]): Promise<string[]> {
  if (paths.length === 0) return []
  const wanted = [...new Set(paths)]
  const { data, error } = await client.storage.from(WATER_REPORT_PHOTOS_BUCKET).remove(wanted)
  if (error) throw error
  const removed = new Set((data ?? []).map((object) => object.name))
  if (wanted.some((path) => !removed.has(path))) throw new WaterPhotoPurgeError('denied')
  return wanted
}

export class WaterPhotoPurgeError extends Error {
  constructor(readonly kind: 'denied' | 'tooMany') {
    super(kind === 'denied' ? 'Water photo deletion denied' : 'Water photo purge limit reached')
    this.name = 'WaterPhotoPurgeError'
  }
}

/** Storage objects must be purged before deleting the owner, rather than by a SQL cascade. */
export async function removeAllOwnWaterPhotos(client: WaterClient, userId: string): Promise<number> {
  if (!UUID.test(userId)) throw new Error('Invalid water photo owner')
  const owner = userId.toLowerCase()
  const bucket = client.storage.from(WATER_REPORT_PHOTOS_BUCKET)
  let count = 0
  // 1000 reports × 3 photos fit in three pages; a bounded loop also catches a stalled purge.
  for (let round = 0; round < 20; round++) {
    const { data, error } = await bucket.list(owner, { limit: 1000 })
    if (error) throw error
    const paths = (data ?? []).filter((item) => item.id != null && item.name)
      .map((item) => `${owner}/${item.name}`)
    if (paths.length === 0) return count
    const removed = await removeWaterPhotos(client, paths)
    count += removed.length
  }
  throw new WaterPhotoPurgeError('tooMany')
}
