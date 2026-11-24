// 圏外で保存した投稿の下書き（IndexedDB）を 1 件送る。マイページの「すべて送信」（useOfflineQueue）と、
// ログアウト前の「送ってからログアウト」（AuthContext）が同じ関数を使う。
//
// - 送る直前にも持ち主を照合する（古い版の下書き・別の人の下書きは送らない。REQ-330）
// - REQ-330（2 周目の点検 🔴）: 調査計画の地点から作った下書き（fieldworkStopId あり）は、送る前に
//   その位置の近くの自分の希少種の記録を DB で確かめ、近ければ（確かめられなければ）位置を非公開にする。
//   送れたら地点とつなぐ。調査機能の部品は動的 import で読み、マイページのチャンクを重くしない
// - REQ-185: 音声も退避して送る。insert に失敗したら、先に置いた音声を消す（写真の孤立は従来どおり許容）
// - 失敗の理由は文言ではなく i18n のキーで残す（別の言語で読み戻されるため。REQ-183）

import { supabase } from '@/lib/supabase/client'
import { logError } from '@/lib/errorHandler'
import { uploadAudio, deleteAudio } from '@/lib/uploadAudio'
import { sha256Hex, sha256HexEach } from '@/lib/hash/sha256'
import { postInputSchema } from '@/lib/validation/schemas'
import { getMyExperimentVariants } from '@/lib/experiments'
// REQ-331: posts の INSERT 行は submitPost と同じ関数で組み立てる（列の組がずれないように）。
import { insertPost, postFieldsFromPending } from '@/lib/data/posts-write'
import { updatePendingPost, deletePendingPost, type PendingPost } from '@/lib/offlineStore'

/** 1 件を送る。送れたら端末から消して true。送れなければ理由を書き残して false。 */
export async function sendPendingPost(userId: string, post: PendingPost): Promise<boolean> {
  if (!post.id) return false
  // 送る直前にも持ち主を照合する（古い版の下書き・別の人の下書きは送らない）
  if (!post.userId || post.userId !== userId) return false

  await updatePendingPost(post.id, {
    status: 'sending',
    sendingStartedAt: Date.now(),
    errorMessage: undefined,
  })

  // REQ-185 FR-185-05: 音声アップロード成功時の path を保持し、後続の DB insert が
  // 失敗したら孤立ファイルを削除（ロールバック）する。
  let audioPath: string | null = null
  try {
    const fd = post.formData
    // REQ-330: 地点から作った下書きは、写真を置く前に保護を確かめる（通信が切れたら何も置かずに次の機会へ）
    let hideLocation = false
    if (post.fieldworkStopId) {
      const { mustHideOfflinePost } = await import('@/features/fieldwork/data/offlinePost')
      hideLocation = await mustHideOfflinePost(supabase, userId, { lat: fd.lat, lng: fd.lng }, post.fieldworkStopId)
    }

    // REQ-079 / REQ-331: 端末の写真は EXIF 除去済みの blob で、通常の送信が hash を取るのと同じバイト列。
    const imageHashes = await sha256HexEach(post.photos)

    // 1. 写真アップロード
    const photoUrls: string[] = []
    for (const blob of post.photos) {
      const fileName = `${userId}/${crypto.randomUUID()}.jpg`
      const { data, error: uploadError } = await supabase.storage
        .from('post-photos')
        .upload(fileName, blob, { cacheControl: '3600', upsert: false })
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('post-photos').getPublicUrl(data.path)
      photoUrls.push(publicUrl)
    }

    // REQ-185 FR-185-05: 音声 Blob があれば Storage へアップロードし、URL/hash を取得。
    // 失敗時は throw → 外側 catch で status:'error' にし、孤立ファイルは残さない
    // （アップロード自体が失敗＝Storage に何も残らない）。
    let audioUrl: string | null = null
    let audioHash: string | null = null
    if (post.audioBlob && post.audioMimeType) {
      // REQ-079: upload と並列で hash 計算（失敗しても NULL で続行）
      const [uploaded, hash] = await Promise.all([
        uploadAudio(post.audioBlob, userId, post.audioMimeType),
        sha256Hex(post.audioBlob),
      ])
      audioUrl = uploaded.publicUrl
      audioPath = uploaded.path
      audioHash = hash
    }

    // 2. DB 挿入
    // REQ-213 FR-213-05 / AC-03: 同期前に共有 zod スキーマで検証する。IndexedDB の下書きは
    //   usePostForm の検証を通っていない古い版や、改竄された値が直接 insert され得るため、
    //   ここを「第一の網」として再検証し、不正な下書きは insert せず error 状態にする
    //   （写真は既にアップロード済みでも、無効な本体を DB に投げない方が安全側）。
    //   最終防御は posts の DB CHECK 制約（schema.sql）。
    const draftCheck = postInputSchema.safeParse({
      species: fd.species,
      info_type: fd.infoType,
      lat: fd.lat,
      lng: fd.lng,
      comment: fd.comment,
      count: fd.count,
      weather: fd.weather,
      humidity: fd.humidity,
      survey_duration_minutes: fd.surveyDurationMinutes,
      location_source: fd.locationSource,
    })
    if (!draftCheck.success) {
      throw new Error('validation.draftInvalid')
    }
    // REQ-175 / REQ-331: 割付は再送する時点のもの（submitPost と同じく、取れなければ {} = control 相当）。
    const experimentAssignments = await getMyExperimentVariants().catch(() => ({}))
    // REQ-185 FR-185-06 / REQ-331: submitPost と同じ関数で行を組み立てる（同じ列の組で復元する）。
    // 古い版の下書きに無い項目は postFieldsFromPending が null にする。
    const fields = postFieldsFromPending(fd)
    const postId = await insertPost(supabase, {
      ...fields,
      // 非公開にする方向にだけ上書きする（下書きで非公開を選んでいれば、そのまま非公開）
      locationPrivate: fields.locationPrivate || hideLocation,
      userId,
      photoUrls,
      imageHashes,
      audioUrl,
      audioHash,
      experimentAssignments,
    })

    // 成功 → 削除
    await deletePendingPost(post.id)

    // REQ-330: 地点から作った投稿は地点とつなぐ（つなげなくても投稿はできているので、送信は成功のまま）
    if (post.fieldworkStopId) {
      try {
        const { linkOfflinePost } = await import('@/features/fieldwork/data/offlinePost')
        await linkOfflinePost(supabase, userId, post.fieldworkStopId, postId)
      } catch (linkError) {
        logError(linkError as Error, 'offlineQueue:linkStop')
      }
    }
    return true
  } catch (err) {
    // REQ-185 FR-185-05: insert 失敗時、先にアップロード済みの音声を孤立させないよう削除。
    // 写真の孤立は元実装どおり許容（再送時に新規 path で再アップロードされる）。
    if (audioPath) await deleteAudio(audioPath)
    logError(err as Error, 'offlineQueue:sendOne')
    // REQ-183 FR-183-04: 文言ではなく安定した i18n キーを保持し、表示側 (PendingPostsSection) で
    // t() する。IndexedDB に永続化され別言語セッションで読み戻される可能性があるため、
    // 言語に依存しないキーを保存する。
    await updatePendingPost(post.id, {
      status: 'error',
      sendingStartedAt: undefined,
      errorMessage: 'dashboard.sendFailed',
    })
    return false
  }
}
