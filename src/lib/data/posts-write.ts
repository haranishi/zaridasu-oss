// 投稿（posts）を書く経路。新規投稿の INSERT と、利用者が自分の投稿を書き換える UPDATE / DELETE。
// 管理画面の審査は posts-admin.ts。
//
// **新規投稿の行は buildPostInsertRow だけが組み立てる（REQ-331）。** 通常の送信（usePostForm）・
// 電波が戻ってからの再送（useOfflineQueue）・REQ-330 の不在記録は、どれも insertPost を通す。
// 2 か所で行を手書きしていた頃は、再送の側だけ image_hashes と experiment_assignments が抜けていた。
// 入力の項目（NewPost）はすべて必須にしてあるので、列を足すと呼び出し元が全部型エラーで止まる。
// 送る列の組が通常と再送で同じことは __tests__/posts-write.insert.test.ts が固定している。
//
// UPDATE / DELETE を集める理由は影響行の確認ひとつ。UPDATE / DELETE が RLS で拒否されても
// **エラーにはならず 0 行で成功として返る**ため、`.select('id')` を付けて行数を見ないと
// 他人の投稿を消そうとした時にも「削除しました」と出る。移行前の `useEditPost` /
// `useDeletePost` はどちらも行数を見ていなかった（posts-admin.ts で塞いだのと同じ穴）。

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database.types'
import type {
  InfoType,
  LatLng,
  LocationSource,
  PostFormData,
  PostInsert,
  PostUpdate,
  Species,
  WeatherCategory,
} from '@/types'
import type { PendingPost } from '@/lib/offlineStore'
import {
  observedAtToIso,
  resolveImageHashes,
  resolvePostStatus,
  resolveSurveyMethod,
} from '@/lib/post/postFields'

export type PostsWriteClient = SupabaseClient<Database>

/** 送る直前に決まる値。写真と音声を上げ終えたあとで、通常の送信と再送が同じ形でそろえる。 */
export interface PostSendValues {
  userId: string
  photoUrls: string[]
  /** 写真ごとの SHA-256（sha256HexEach）。1 枚でも null なら列は null で送る。 */
  imageHashes: (string | null)[]
  audioUrl: string | null
  audioHash: string | null
  /** 送る時点の実験の割付（getMyExperimentVariants。取れなければ {}）。 */
  experimentAssignments: Record<string, string>
}

/**
 * 投稿の中身。フォームの値を数値・null に直したもので、端末の下書き（PendingPost.formData）にも
 * この形のまま保存する。
 */
export interface NewPostFields {
  lat: number
  lng: number
  species: Species
  infoType: InfoType
  municipality: string | null
  comment: string | null
  count: number | null
  /** 観察日（YYYY-MM-DD）。未指定は null。 */
  observedAt: string | null
  weather: WeatherCategory | null
  temperature: number | null
  humidity: number | null
  surveyDurationMinutes: number | null
  /** 位置精度（m）。手動で選んだ位置は null（REQ-172）。 */
  accuracy: number | null
  locationSource: LocationSource | null
  surveyMethod: 'structured' | 'opportunistic' | null
  surveySiteId: string | null
  surveyRequestId: string | null
  audioDurationMs: number | null
  /** true なら位置を非公開（hidden）で送る。false は送らず、DB が種の既定を入れる（REQ-329）。 */
  locationPrivate: boolean
}

export interface NewPost extends NewPostFields, PostSendValues {}

/** 通常の送信・圏外での下書き保存（usePostForm）。フォームの文字列をここで数値・null に直す。 */
export function postFieldsFromForm(
  form: PostFormData,
  position: LatLng,
  audioDurationMs: number | null
): NewPostFields {
  return {
    lat: position.lat,
    lng: position.lng,
    species: form.species,
    infoType: form.infoType,
    municipality: form.municipality || null,
    comment: form.comment.trim() || null,
    count: form.count ? Number(form.count) : null,
    observedAt: form.observedAt || null,
    weather: form.weather ?? null,
    temperature: form.temperature ?? null,
    humidity: form.humidity ?? null,
    surveyDurationMinutes: form.surveyDurationMinutes ?? null,
    accuracy: form.accuracy ?? null,
    locationSource: form.locationSource ?? null,
    surveyMethod: form.surveyMethod ?? null,
    surveySiteId: form.surveySiteId ?? null,
    surveyRequestId: form.surveyRequestId ?? null,
    audioDurationMs,
    locationPrivate: !!form.locationPrivate,
  }
}

/**
 * 再送（useOfflineQueue）。端末の下書きには古い版も改竄された値もありうるので、
 * **呼び出し側が postInputSchema で検査してから渡す**（種・情報の種類・天気の型はその検査を前提に狭める）。
 * 古い版に無い項目は null にし、通常の送信で未指定だったときと同じ列の組で送る。
 */
export function postFieldsFromPending(fd: PendingPost['formData']): NewPostFields {
  return {
    lat: fd.lat,
    lng: fd.lng,
    species: fd.species as Species,
    infoType: fd.infoType as InfoType,
    municipality: fd.municipality ?? null,
    comment: fd.comment ?? null,
    count: fd.count ?? null,
    observedAt: fd.observedAt ?? null,
    weather: (fd.weather ?? null) as WeatherCategory | null,
    temperature: fd.temperature ?? null,
    humidity: fd.humidity ?? null,
    surveyDurationMinutes: fd.surveyDurationMinutes ?? null,
    accuracy: fd.accuracy ?? null,
    locationSource: fd.locationSource ?? null,
    surveyMethod: fd.surveyMethod ?? null,
    surveySiteId: fd.surveySiteId ?? null,
    surveyRequestId: fd.surveyRequestId ?? null,
    audioDurationMs: fd.audioDurationMs ?? null,
    locationPrivate: !!fd.locationPrivate,
  }
}

/** posts の INSERT 行を組み立てる（純粋関数）。送る列の組はここで決まる。 */
export function buildPostInsertRow(post: NewPost): PostInsert {
  return {
    user_id: post.userId,
    is_anonymous: false,
    lat: post.lat,
    lng: post.lng,
    species: post.species,
    info_type: post.infoType,
    // 不在確認は審査不要・自動承認
    status: resolvePostStatus(post.infoType),
    municipality: post.municipality,
    comment: post.comment,
    count: post.count,
    observed_at: observedAtToIso(post.observedAt),
    weather: post.weather,
    temperature: post.temperature,
    humidity: post.humidity,
    survey_duration_minutes: post.surveyDurationMinutes,
    photos: post.photoUrls.length > 0 ? post.photoUrls : null,
    // REQ-079: dedup 用 hash。全部そろったときだけ配列で送る（NULL 混入は DB CHECK で弾かれる）
    image_hashes: resolveImageHashes(post.imageHashes),
    audio_url: post.audioUrl,
    audio_hash: post.audioHash,
    // REQ-083: 録音 duration を ms で永続化
    audio_duration_ms: post.audioDurationMs,
    // REQ-172: 位置精度（m）と取得手段
    accuracy: post.accuracy,
    location_source: post.locationSource,
    // REQ-175: 送った時点の群割付
    experiment_assignments: post.experimentAssignments,
    // REQ-174: 調査手法（定点サイト指定時は structured）と定点サイト
    survey_method: resolveSurveyMethod(post.surveySiteId, post.surveyMethod),
    survey_site_id: post.surveySiteId,
    // REQ-086 Phase 2: 紐付き投稿は DB トリガーが survey_requests を responded に遷移させる
    survey_request_id: post.surveyRequestId,
    // REQ-329: 投稿者が選べるのは「非公開（hidden）」だけ。それ以外は送らず、DB が種の既定を入れる。
    ...(post.locationPrivate ? { location_disclosure: 'hidden' as const } : {}),
  }
}

/**
 * 新しい投稿を 1 件作り、作られた行の id を返す。失敗は投げる。
 * 写真・音声の実体は呼び出し側が先に上げ、ここが投げたら呼び出し側が片付ける。
 * AI 判定は posts の INSERT トリガー（migration 20260421000001）が起動するので、ここからは呼ばない。
 */
export async function insertPost(client: PostsWriteClient, post: NewPost): Promise<string> {
  const { data, error } = await client
    .from('posts')
    .insert(buildPostInsertRow(post))
    .select('id')
    .single()
  if (error) throw error
  // 成功なら PostgREST は必ず行を返す。返らないのは想定外なので、作れたと扱わない。
  if (!data?.id) throw new Error('投稿の id が返りませんでした')
  return data.id
}

/**
 * 書き込みの結果を検証する。**0 行なら失敗として投げる。**
 * RLS 拒否も対象なしも `error` にはならず 0 行で返るため、行数を見ないと区別がつかない。
 */
function assertAffected(rows: { id: string }[] | null, what: string): void {
  if (!rows || rows.length === 0) {
    throw new Error(`${what}権限がないか、対象が既に存在しません (RLS deny or not found)`)
  }
}

/** 自分の投稿を書き換える。0 行なら投げる。 */
export async function updateOwnPost(
  client: PostsWriteClient,
  postId: string,
  fields: PostUpdate
): Promise<void> {
  const { data, error } = await client.from('posts').update(fields).eq('id', postId).select('id')
  if (error) throw error
  assertAffected(data, '編集')
}

/**
 * REQ-329: 自分の投稿の位置を非公開（hidden）にする。**一方向**で、投稿者は公開へ戻せない（DB トリガーが強制）。
 * 0 行（他人の投稿・存在しない）なら投げる。トリガーが値を戻した場合（想定外）も、返ってきた値で検出して投げる。
 */
export async function hideOwnPostLocation(client: PostsWriteClient, postId: string): Promise<void> {
  const { data, error } = await client
    .from('posts')
    .update({ location_disclosure: 'hidden' })
    .eq('id', postId)
    .select('id, location_disclosure')
  if (error) throw error
  assertAffected(data, '変更')
  if (data?.[0]?.location_disclosure !== 'hidden') {
    throw new Error('位置を非公開にできませんでした')
  }
}

/** 自分の投稿を消す。0 行なら投げる。写真・音声の実体は呼び出し側が Storage から消す。 */
export async function deleteOwnPost(client: PostsWriteClient, postId: string): Promise<void> {
  const { data, error } = await client.from('posts').delete().eq('id', postId).select('id')
  if (error) throw error
  assertAffected(data, '削除')
}
