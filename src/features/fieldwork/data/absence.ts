// REQ-330: 地点の「いなかった」を、種ごとの不在の投稿にして地点とつなぐ。
//
// 投稿の INSERT は src/lib/data/posts-write.ts の insertPost だけを通す（REQ-331。3 本目の INSERT を書かない）。
// 不在の投稿は調査方法 structured。承認は DB が決める（管理者以外は protect_post_insert_columns が pending に戻すので
// 運営の確認が要る。管理者の分だけそのまま approved）。
// 希少種の記録の近く（300 m 以内・地点の id ではなく場所で判定）から作る投稿は、位置を非公開（hidden）にする。
// 外来種の公開投稿の位置から希少種の池を推測されるのを防ぐため。画面の判定に加えて、作る直前にも DB で確かめる
// （「もう一度使う」で地点の id が変わった・別の端末で記録した、などで画面の判定が外れても守る）。
// posts には送信を見分ける鍵が無いので、作れた投稿の id を呼び出し側（送信待ち）に知らせ、送り直しでは作らない。

import { insertPost, type NewPost } from '@/lib/data/posts-write'
import { getMyExperimentVariants } from '@/lib/experiments'
import { isNetworkError } from '@/lib/privateSpots'
import { lookupMunicipality } from '@/lib/reverseGeocodeMunicipality'
import type { Species } from '@/types'

import { hasOwnRareNear } from './rareSightings'
import { linkStopPost } from './stopPosts'
import { setStopStatus } from './stops'
import type { FieldworkClient } from './shared'

export interface AbsenceInput {
  userId: string
  stopId: string
  /** 選んだ種（1 つ以上）。種ごとに 1 件の投稿になる。 */
  species: Species[]
  /** 調査にかけた分数（任意・1〜480）。 */
  surveyDurationMinutes: number | null
  lat: number
  lng: number
  /** 現在地を使ったときの誤差（m）。地点の座標を使ったときは null。 */
  accuracy: number | null
  locationSource: 'gps' | 'manual'
  /** 希少種の記録の近くの地点なら true（位置を hidden で送る）。false でも作る直前に DB で確かめる。 */
  locationPrivate: boolean
  /** 市区町村。undefined なら作る直前に逆ジオコーディングで引く（取れなければ空）。 */
  municipality?: string | null
  /** 観察日（端末の日付 YYYY-MM-DD）。 */
  observedOn: string
  /** 押した時刻（ISO）。地点の visited_at になる。 */
  at: string
}

/** 位置を非公開にする投稿で、逆ジオコーディングに渡す座標の丸め（小数 2 桁＝約 1 km）。 */
export function roundForLookup(value: number): number {
  return Math.round(value * 100) / 100
}

/** 不在の投稿 1 件の中身（純粋関数）。 */
export function absencePost(
  input: AbsenceInput,
  species: Species,
  experimentAssignments: Record<string, string>
): NewPost {
  return {
    lat: input.lat,
    lng: input.lng,
    species,
    infoType: 'absence',
    municipality: input.municipality ?? null,
    comment: null,
    count: null,
    observedAt: input.observedOn,
    weather: null,
    temperature: null,
    humidity: null,
    surveyDurationMinutes: input.surveyDurationMinutes,
    accuracy: input.locationSource === 'gps' ? input.accuracy : null,
    locationSource: input.locationSource,
    surveyMethod: 'structured',
    surveySiteId: null,
    surveyRequestId: null,
    audioDurationMs: null,
    locationPrivate: input.locationPrivate,
    userId: input.userId,
    photoUrls: [],
    imageHashes: [],
    audioUrl: null,
    audioHash: null,
    experimentAssignments,
  }
}

/**
 * 選んだ種ごとに不在の投稿を作り、地点とつないで「済み」にする。作った（または前に作れていた）投稿の id を返す。
 * `postIds` に入っている種は作り直さない。投稿が 1 件できるたびに onPosted で知らせる。
 * 途中で失敗したら投げる（それまでに作れた投稿は onPosted で受け取り済み）。
 */
export async function recordAbsence(
  client: FieldworkClient,
  input: AbsenceInput,
  options: {
    postIds?: Partial<Record<Species, string>>
    onPosted?: (species: Species, postId: string) => void
  } = {}
): Promise<string[]> {
  if (input.species.length === 0) throw new Error('種を 1 つ以上選んでください')
  // 作る直前に、その位置の近く（とその地点）に自分の希少種の記録が無いかを DB で確かめる。
  // 確かめられなかったとき（通信以外の失敗）は伏せる側に倒す。通信の失敗は投げる（送信待ちへ）。
  let locationPrivate = input.locationPrivate
  if (!locationPrivate) {
    try {
      locationPrivate = await hasOwnRareNear(client, input.userId, { lat: input.lat, lng: input.lng }, input.stopId)
    } catch (err) {
      if (isNetworkError(err)) throw err
      locationPrivate = true
    }
  }
  // 市区町村は逆ジオコーディングで引く。位置を非公開にする投稿では、外のサービスに正確な座標を送らないよう
  // 小数 2 桁（約 1 km）に丸めて引く（市区町村は公開の列なので、粗い位置で引けば足りる）
  const municipality =
    input.municipality !== undefined
      ? input.municipality
      : locationPrivate
        ? await lookupMunicipality(roundForLookup(input.lat), roundForLookup(input.lng))
        : await lookupMunicipality(input.lat, input.lng)
  const post: AbsenceInput = { ...input, locationPrivate, municipality }
  // 割付が取れなくても記録は止めない（posts-write と同じ扱い）
  const experimentAssignments = await getMyExperimentVariants().catch(() => ({}))
  const created: string[] = []
  for (const species of input.species) {
    let postId = options.postIds?.[species]
    if (!postId) {
      postId = await insertPost(client, absencePost(post, species, experimentAssignments))
      options.onPosted?.(species, postId)
    }
    await linkStopPost(client, { userId: input.userId, stopId: input.stopId, postId, kind: 'absence' })
    created.push(postId)
  }
  await setStopStatus(client, input.stopId, 'done', input.at)
  return created
}
