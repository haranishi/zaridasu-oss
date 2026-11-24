'use client'

// REQ-330: 自分の希少種の記録（一覧・作成・削除・写真）。
//
// - 読み込むのは「希少種の記録」タブを開いたときか「希少種を表示」を入れたときだけ
// - 圏外では写真なしの記録だけを送信待ちに積む（client_id で DB が二重登録を弾く）。写真は電波のある場所だけ
// - 記録できたら、近くの地点につながる自分の投稿の位置を非公開にする（data/protect.ts）。
//   通信が切れて非公開にできなかった分は送信待ち（protect）に積んで、あとで続ける
// - 付けた地点が消えた・自分の地点でないと拒否されたら、地点を外して記録し直す（記録は失わない）
// - 消したら写真の実体も消す（deleteRareSighting が返すパスを removeRarePhotos に渡す）。一部しか消せなければ知らせる
// - 写真の部品（rarePhotos.ts・EXIF 消し）は使うときに読み込む。地図の読み込みを重くしない

import { useCallback, useEffect, useRef, useState } from 'react'

import { logError } from '@/lib/errorHandler'
import { isNetworkError } from '@/lib/privateSpots'
import { supabase } from '@/lib/supabase/client'

import { hideLinkedPostsNear } from '../data/protect'
import {
  deleteRareSighting,
  insertRareKeepingRecord,
  selectOwnRareSightings,
  type RareSighting,
} from '../data/rareSightings'
import { FieldworkError } from '../lib/errors'
import type { RecordPosition } from '../lib/positionRule'
import { newClientId, type QueueItem } from '../lib/queue'

export interface RareInput {
  /** シートを開いたときに作った uuid。送り直しでも同じ値を使う。 */
  clientId: string
  stopId: string | null
  speciesKey: string
  speciesLabel: string | null
  count: number | null
  note: string | null
  position: Pick<RecordPosition, 'lat' | 'lng' | 'accuracy' | 'source'>
  /** 観察日時（ISO）。 */
  observedAt: string
  photos: File[]
  /**
   * 前回の保存で置けた写真のパス（通信が途中で切れたときの再保存用）。
   * 渡すとアップロードし直さない。置けたらその都度 onUploaded で知らせる。
   */
  uploadedPaths?: string[]
  onUploaded?: (paths: string[]) => void
}

export type RareSaveResult =
  /** protectFailed: 近くの投稿を非公開にする続きを、送信待ちが満杯で端末に残せなかった（画面で知らせる） */
  | { status: 'saved'; sighting: RareSighting; duplicate: boolean; protectFailed?: boolean }
  | { status: 'queued' }

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export function useRareSightings(
  userId: string | null,
  options: { active: boolean; enqueue: (item: QueueItem) => boolean }
) {
  const { active, enqueue } = options
  const [list, setList] = useState<RareSighting[]>([])
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    if (!userId) return
    setLoadState((s) => (s === 'ready' ? s : 'loading'))
    try {
      const { data, error } = await selectOwnRareSightings(supabase, userId)
      if (error) throw error
      setList(data ?? [])
      loadedRef.current = true
      setLoadState('ready')
    } catch (err) {
      if (!isNetworkError(err)) logError(err, 'useRareSightings:load')
      setLoadState('error')
    }
  }, [userId])

  useEffect(() => {
    if (active && userId && loadState === 'idle') void load()
  }, [active, userId, loadState, load])

  /** 読み込んだことがあるときだけ読み直す（送信待ちが送れたあと）。 */
  const refresh = useCallback(async () => {
    if (loadedRef.current) await load()
  }, [load])

  /**
   * 記録の近くの地点につながる自分の投稿を非公開にする。通信が切れたら送信待ちに積む。
   * 送信待ちが満杯で積めなかったときは false（呼び手が画面で知らせる。黙って捨てない）。
   */
  const protectNear = useCallback(
    async (uid: string, sighting: Pick<RareSighting, 'lat' | 'lng' | 'stop_id'>): Promise<boolean> => {
      const point = { lat: Number(sighting.lat), lng: Number(sighting.lng) }
      try {
        await hideLinkedPostsNear(supabase, uid, point, sighting.stop_id)
        return true
      } catch (err) {
        if (isNetworkError(err)) {
          return enqueue({
            type: 'protect',
            clientId: newClientId(),
            userId: uid,
            at: new Date().toISOString(),
            lat: point.lat,
            lng: point.lng,
            rareStopId: sighting.stop_id,
          })
        }
        logError(err, 'useRareSightings:protect')
        return true
      }
    },
    [enqueue]
  )

  const create = useCallback(
    async (input: RareInput): Promise<RareSaveResult> => {
      if (!userId) throw new FieldworkError('denied')
      const queue = (): RareSaveResult => {
        if (input.photos.length > 0) throw new FieldworkError('photosOffline')
        const ok = enqueue({
          type: 'rare',
          clientId: input.clientId,
          userId,
          at: new Date().toISOString(),
          stopId: input.stopId,
          speciesKey: input.speciesKey,
          speciesLabel: input.speciesLabel,
          count: input.count,
          note: input.note,
          lat: input.position.lat,
          lng: input.position.lng,
          accuracy: input.position.accuracy,
          locationSource: input.position.source,
          observedAt: input.observedAt,
        })
        if (!ok) throw new FieldworkError('queueFull')
        return { status: 'queued' }
      }
      if (!isOnline()) return queue()

      let paths = input.uploadedPaths ?? []
      const fresh: string[] = []
      try {
        if (input.photos.length > 0 && paths.length !== input.photos.length) {
          const { uploadRarePhoto } = await import('../data/rarePhotos')
          paths = []
          for (const file of input.photos) {
            const path = await uploadRarePhoto(supabase, userId, file)
            paths.push(path)
            fresh.push(path)
            input.onUploaded?.([...paths])
          }
        }
        const { sighting, duplicate } = await insertRareKeepingRecord(supabase, {
          userId,
          clientId: input.clientId,
          stopId: input.stopId,
          speciesKey: input.speciesKey,
          speciesLabel: input.speciesLabel,
          count: input.count,
          note: input.note,
          lat: input.position.lat,
          lng: input.position.lng,
          accuracy: input.position.accuracy,
          locationSource: input.position.source,
          observedAt: input.observedAt,
          photoPaths: paths,
        })
        setList((prev) => [sighting, ...prev.filter((s) => s.id !== sighting.id)])
        const protectedOk = await protectNear(userId, sighting)
        return { status: 'saved', sighting, duplicate, ...(protectedOk ? {} : { protectFailed: true }) }
      } catch (err) {
        if (isNetworkError(err)) {
          // 記録が届いていたかもしれないので、置けた写真は消さずに残す（同じ client_id で再保存すれば重ならない）
          if (input.photos.length === 0) return queue()
          throw err
        }
        // 届かなかったことが確かな失敗。今回置いた写真を片付ける
        if (fresh.length > 0) {
          input.onUploaded?.([])
          try {
            const { removeRarePhotos } = await import('../data/rarePhotos')
            await removeRarePhotos(supabase, fresh)
          } catch (cleanupError) {
            logError(cleanupError, 'useRareSightings:cleanup')
          }
        }
        throw err
      }
    },
    [userId, enqueue, protectNear]
  )

  /**
   * 消す。写真の実体も消す。消せなかった写真の数を photosLeft で返す（記録は消えている）。
   * 一部だけ消せたとき（RLS は消せなかった分を黙って外して返す）も数で分かる。
   */
  const remove = useCallback(async (id: string): Promise<{ photosLeft: number; photoCount: number }> => {
    const { photoPaths } = await deleteRareSighting(supabase, id)
    setList((prev) => prev.filter((s) => s.id !== id))
    if (photoPaths.length === 0) return { photosLeft: 0, photoCount: 0 }
    try {
      const { removeRarePhotos } = await import('../data/rarePhotos')
      const removed = await removeRarePhotos(supabase, photoPaths)
      return { photosLeft: Math.max(0, photoPaths.length - removed.length), photoCount: photoPaths.length }
    } catch (err) {
      logError(err, 'useRareSightings:removePhotos')
      return { photosLeft: photoPaths.length, photoCount: photoPaths.length }
    }
  }, [])

  return { list, loadState, load, refresh, create, remove }
}

export type RareSightingsApi = ReturnType<typeof useRareSightings>
