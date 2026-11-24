import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_SIZE,
  MAX_INPUT_IMAGE_SIZE,
  MAX_PHOTOS,
  SPAM_LIMIT_POSTS,
} from '@/lib/constants'
import { isWithinTargetBBox } from '@/lib/area/targetArea'
import { getErrorMessage, resolveErrorMessage, logError } from '@/lib/errorHandler'
import { processImage } from '@/lib/imageProcessor'
import { uploadAudio, deleteAudio } from '@/lib/uploadAudio'
import { addPendingPost, getOfflineDropWarning } from '@/lib/offlineStore'
import { sha256Hex, sha256HexEach } from '@/lib/hash/sha256'
import { checkImage } from '@/lib/image/blurDetect'
import { compressToAiVariant } from '@/lib/image/compressJpeg'
import { getMyExperimentVariants } from '@/lib/experiments'
import { trackEvent } from '@/lib/analytics'
// REQ-247 (H2): 投稿送信の純粋ロジックを切り出したユニット（単体テスト対象）。
import { evaluateSpamWindow, readSuccessfulPostTimestamps, storeSuccessfulPostTimestamps } from '@/lib/post/spamWindow'
import { resolveSurveyMethod } from '@/lib/post/postFields'
import { resolvePostValidationError } from '@/lib/post/postInputValidation'
// REQ-331: posts の INSERT 行の組み立てと実行はデータ層に 1 つ（再送・REQ-330 と共有）。
import { insertPost, postFieldsFromForm } from '@/lib/data/posts-write'

// REQ-077: フィーチャーフラグ（未設定時は off）
const AI_COMPRESSION_ENABLED =
  process.env.NEXT_PUBLIC_AI_INPUT_COMPRESSION_ENABLED === 'true'
import type { UsePostFormResult, PostFormData, SubmitPostOptions, UploadProgress, LatLng } from '@/types'

export function usePostForm(): UsePostFormResult {
  const { t } = useTranslation()
  const { user: currentUser, isAdmin } = useAuth()
  const [photos, setPhotos] = useState<File[]>([])
  const attachedPhotosRef = useRef<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioMimeType, setAudioMimeType] = useState<string | null>(null)
  // REQ-083: 録音時の duration を DB に永続化して UI 表示に使う
  const [audioDurationMs, setAudioDurationMs] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const submittingRef = useRef(false)
  const preparingRef = useRef(false)
  const mountedRef = useRef(true)
  const photoBatchRef = useRef(0)
  const [photoProcessing, setPhotoProcessing] = useState<UploadProgress | null>(null)
  const [error, setError] = useState('')
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)
  const [exifPosition, setExifPosition] = useState<LatLng | null>(null)
  const exifPhotoRef = useRef<File | null>(null)
  const [showExifBanner, setShowExifBanner] = useState(false)
  // REQ-077: 事前ゲート警告（blur / 低解像度）— 強制弾きはしない
  const [imageGateWarning, setImageGateWarning] = useState<string | null>(null)

  // 写真変更時に旧 Blob URL を解放（メモリリーク防止）
  const prevPreviewsRef = useRef<string[]>([])
  useEffect(() => {
    // 新しいプレビューに含まれない旧URLをrevoke
    prevPreviewsRef.current
      .filter((url) => !photoPreviews.includes(url))
      .forEach(URL.revokeObjectURL)
    prevPreviewsRef.current = photoPreviews
  }, [photoPreviews])
  // アンマウント時に残りの全URLを解放
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      prevPreviewsRef.current.forEach(URL.revokeObjectURL)
    }
  }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS - photos.length)
    e.target.value = '' // 同じ写真を削除後に選び直せるようにする。
    if (preparingRef.current || submittingRef.current || rawFiles.length === 0) return
    preparingRef.current = true
    const batch = ++photoBatchRef.current
    const isCurrent = () => mountedRef.current && photoBatchRef.current === batch
    setError('')
    setPhotoProcessing({ current: 0, total: rawFiles.length })
    const prepared: File[] = []
    let firstOriginal: File | undefined
    try {
      // 原本を同時デコードせず、端末のメモリを使いすぎないよう1枚ずつ準備する。
      for (const [index, original] of rawFiles.entries()) {
        if (!isCurrent()) return
        if (!ALLOWED_IMAGE_TYPES.includes(original.type)) {
          setError(t('postForm.fileTypeError', { name: original.name }))
        } else if (original.size > MAX_INPUT_IMAGE_SIZE) {
          setError(t('postForm.fileSizeError', { name: original.name, max: MAX_INPUT_IMAGE_SIZE / 1024 / 1024 }))
        } else {
          try {
            const photo = await processImage(original)
            if (!isCurrent()) return
            // processImageの失敗フォールバックは原本を返す。未変換のEXIFを送らない。
            if (photo === original || photo.type !== 'image/jpeg' || photo.size === 0 || photo.size > MAX_FILE_SIZE) {
              setError(t('postForm.photoConversionError', { name: original.name }))
            } else {
              prepared.push(photo)
              firstOriginal ??= original
            }
          } catch {
            if (isCurrent()) setError(t('postForm.photoConversionError', { name: original.name }))
          }
        }
        if (isCurrent()) setPhotoProcessing({ current: index + 1, total: rawFiles.length })
      }
      if (!isCurrent() || prepared.length === 0) return
      const newPhotos = [...photos, ...prepared]
      attachedPhotosRef.current = newPhotos
      setPhotos(newPhotos)
      setPhotoPreviews((prev) => [...prev, ...prepared.map((f) => URL.createObjectURL(f))])
      // EXIFは縮小済み画像から消えるため、原本を使う。追加処理は送信を待たせない。
      void (async () => {
        let hasExifGps = false
        try {
          const { default: exifr } = await import('exifr')
          const gps = await exifr.gps(firstOriginal!)
          if (!mountedRef.current || !attachedPhotosRef.current.includes(prepared[0]!)) return
          if (gps?.latitude != null && gps?.longitude != null && isWithinTargetBBox(gps.latitude, gps.longitude)) {
            exifPhotoRef.current = prepared[0]!
            setExifPosition({ lat: gps.latitude, lng: gps.longitude })
            setShowExifBanner(true)
            hasExifGps = true
          }
        } catch { /* EXIFのない写真も投稿できる */ }
        if (!isCurrent()) return
        trackEvent('post_media_attached', { photo_count: newPhotos.length, has_exif_gps: hasExifGps })
        try {
          const check = await checkImage(prepared[0]!)
          if (!isCurrent()) return
          setImageGateWarning(check?.isLowResolution
            ? t('postForm.lowResolutionWarning', { width: check.width, height: check.height })
            : check?.isBlurry ? t('postForm.blurryWarning') : null)
        } catch {
          if (isCurrent()) setImageGateWarning(null)
        }
      })()
    } finally {
      preparingRef.current = false
      if (isCurrent()) setPhotoProcessing(null)
    }
  }

  const dismissImageGateWarning = () => setImageGateWarning(null)

  const removePhoto = (index: number) => {
    if (preparingRef.current || submittingRef.current) return
    photoBatchRef.current++
    if (exifPhotoRef.current === photos[index]) {
      exifPhotoRef.current = null
      setExifPosition(null)
      setShowExifBanner(false)
    }
    setImageGateWarning(null)
    attachedPhotosRef.current = photos.filter((_, i) => i !== index)
    setPhotos(attachedPhotosRef.current)
    setPhotoPreviews(photoPreviews.filter((_, i) => i !== index))
  }

  // REQ-079: 画像アップロード時に SHA-256 を同時計算し、dedup 用に返す
  const uploadPhotos = async (): Promise<{ urls: string[]; hashes: (string | null)[] }> => {
    const uploadedPaths: string[] = []
    setUploadProgress({ current: 0, total: photos.length })
    try {
      // 写真選択時に準備済み。アップロード時は再デコード・再圧縮しない。
      const processed = photos
      // 画像 hash は EXIF 除去後の blob に対して計算（実際に保存されるバイト列と一致）。
      // 再送（useOfflineQueue）も端末に退避した同じ blob から同じ関数で計算する。
      const hashes = await sha256HexEach(processed)

      for (const [i, stripped] of processed.entries()) {
        const prefix = currentUser?.id ?? 'anon'
        const id = crypto.randomUUID()
        const fileName = `${prefix}/${id}.jpg`
        const { data, error: uploadError } = await supabase.storage
          .from('post-photos')
          .upload(fileName, stripped, { cacheControl: '3600', upsert: false })
        if (uploadError) {
          if (uploadedPaths.length > 0) {
            // FR-011: ロールバックに10秒タイムアウト
            await Promise.race([
              supabase.storage
                .from('post-photos')
                .remove(uploadedPaths),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('ロールバックがタイムアウトしました')), 10000)
              ),
            ]).catch((rollbackErr: unknown) => logError(rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr)), 'uploadPhotos:rollback'))
          }
          const err = Object.assign(uploadError, {
            successCount: uploadedPaths.length,
            totalCount: photos.length,
          })
          throw err
        }
        uploadedPaths.push(data.path)

        // REQ-077: AI バリアントを別 path に非同期アップロード（失敗しても本体は成功扱い）
        if (AI_COMPRESSION_ENABLED) {
          try {
            const variant = await compressToAiVariant(stripped)
            if (variant && variant.size < stripped.size) {
              const aiFileName = `${prefix}/${id}.ai.jpg`
              await supabase.storage
                .from('post-photos')
                .upload(aiFileName, variant, { cacheControl: '3600', upsert: false })
            }
          } catch (e) {
            logError(e instanceof Error ? e : new Error(String(e)), 'uploadPhotos:aiVariant')
          }
        }

        setUploadProgress({ current: i + 1, total: photos.length })
      }
      const urls = uploadedPaths.map((path) => {
        const {
          data: { publicUrl },
        } = supabase.storage.from('post-photos').getPublicUrl(path)
        return publicUrl
      })
      return { urls, hashes }
    } finally {
      setUploadProgress(null)
    }
  }

  // NOTE: このクライアント側チェックは UX 最適化のみを目的としています。
  // localStorage は利用者が容易にクリアできるため、実際のレートリミットは
  // DB トリガー (check_post_rate_limit) がサーバー側で強制します。
  const checkSpamLimit = (userId: string): { allowed: boolean; nextAvailable?: Date } => {
    if (isAdmin) return { allowed: true }
    // 失敗した送信を数えず、DB で確定した投稿だけを利用者別の履歴で判定する。
    const stored = readSuccessfulPostTimestamps(userId)
    const result = evaluateSpamWindow(stored, Date.now())
    if (!result.allowed) return { allowed: false, nextAvailable: result.nextAvailable }
    return { allowed: true }
  }

  const recordSuccessfulPost = (userId: string) => {
    if (isAdmin) return
    const now = Date.now()
    const { recent } = evaluateSpamWindow(readSuccessfulPostTimestamps(userId), now)
    storeSuccessfulPostTimestamps(userId, [...recent, new Date(now).toISOString()])
  }

  const formatTimeUntil = (date: Date): string => {
    const diff = date.getTime() - Date.now()
    const hours = Math.floor(diff / 3600000)
    const minutes = Math.ceil((diff % 3600000) / 60000)
    return hours > 0
      ? t('postForm.timeUntilHours', { hours, minutes })
      : t('postForm.timeUntilMinutes', { minutes })
  }

  const submitPost = async (postData: PostFormData, options?: SubmitPostOptions): Promise<boolean> => {
    // state の反映を待つ前の連打でも、アップロードと INSERT を 1 回にする。
    if (submittingRef.current || preparingRef.current) return false
    if (!currentUser) {
      setError(t('postForm.loginRequired'))
      return false
    }

    const spamCheck = checkSpamLimit(currentUser.id)
    if (!spamCheck.allowed) {
      setError(
        t('postForm.rateLimitReached', {
          limit: SPAM_LIMIT_POSTS,
          time: formatTimeUntil(spamCheck.nextAvailable!),
        })
      )
      return false
    }

    submittingRef.current = true
    setLoading(true)
    setError('')

    try {
      // 入力値バリデーション (FR-003) — 写真アップロード前に実行し、孤立ファイルを防ぐ
      const pos = postData.position
      if (!pos) {
        setError(t('postForm.selectLocation'))
        return false
      }
      // REQ-331: フォームの文字列を数値・null に直す規則は、圏外の下書き保存（saveOffline）と同じ関数。
      const fields = postFieldsFromForm(postData, pos, audioDurationMs)

      // REQ-213 FR-213-05 / REQ-247 (H2): 座標範囲/コメント長/個体数の検証は共有 zod スキーマ
      //   （postInputSchema、許可リスト方式）に一元化し、safeParse と「issue の path → 表示 i18n
      //   キー + 補間 params」のマッピングは resolvePostValidationError（純粋・単体テスト済み）へ
      //   切り出した。失敗時は写真をアップロードせず、既存の interpolated メッセージで弾く（UX 維持）。
      //   ⚠️ クライアント側の「第一の網」。最終防御は posts の DB CHECK 制約（schema.sql）。
      const validationError = resolvePostValidationError({
        species: fields.species,
        info_type: fields.infoType,
        lat: fields.lat,
        lng: fields.lng,
        comment: fields.comment,
        count: fields.count,
      })
      if (validationError) {
        setError(validationError.params ? t(validationError.key, validationError.params) : t(validationError.key))
        return false
      }

      let photoUrls: string[] = []
      let imageHashes: (string | null)[] = []
      if (photos.length > 0) {
        const uploaded = await uploadPhotos()
        photoUrls = uploaded.urls
        imageHashes = uploaded.hashes
      }

      // REQ-069/070: 音声アップロード
      let audioUrl: string | null = null
      let audioPath: string | null = null
      let audioHash: string | null = null
      if (audioBlob && audioMimeType && currentUser) {
        try {
          // REQ-079: upload と並列で hash 計算（失敗しても NULL で続行）
          const [uploaded, hash] = await Promise.all([
            uploadAudio(audioBlob, currentUser.id, audioMimeType),
            sha256Hex(audioBlob),
          ])
          audioUrl = uploaded.publicUrl
          audioPath = uploaded.path
          audioHash = hash
        } catch (e) {
          logError(e as Error, 'submitPost:uploadAudio')
          setError(t('postForm.audioUploadFailed'))
          return false
        }
      }

      // REQ-175: 投稿時点の群割付を記録（取得失敗は {} = control 相当でフォールバック）
      const experimentAssignments = await getMyExperimentVariants().catch(() => ({}))

      // REQ-232 (FR-232-02): 投稿ファネル計測。PII・自由記述・座標は送らず低カーディナリティ値のみ。
      // REQ-247 (H2): survey_method の決定は resolveSurveyMethod（単体テスト済み）に一元化し、
      // 計測パラメータと insert（buildPostInsertRow）が同じ関数・同じ入力で決める。
      const funnelParams = {
        species: fields.species,
        info_type: fields.infoType,
        has_photo: photos.length > 0,
        has_audio: !!(audioBlob && audioMimeType),
        survey_method: resolveSurveyMethod(fields.surveySiteId, fields.surveyMethod),
        // REQ-329: 位置を非公開にした投稿か（有無のみ）
        location_private: fields.locationPrivate,
      }
      trackEvent('post_submit', funnelParams)

      let postId: string
      try {
        postId = await insertPost(supabase, {
          ...fields,
          userId: currentUser.id,
          photoUrls,
          imageHashes,
          audioUrl,
          audioHash,
          experimentAssignments,
        })
      } catch (insertError) {
        // 音声の孤立ファイルをロールバック
        if (audioPath) await deleteAudio(audioPath)
        throw insertError
      }

      recordSuccessfulPost(currentUser.id)
      // REQ-232 (FR-232-02): 投稿成功（キーイベント候補）。param は post_submit と同等。
      trackEvent('post_success', funnelParams)
      // REQ-330: 呼び出し側（地点シート）が投稿と地点をつなぐ。投稿は作れているので、ここで投げても失敗にしない。
      try {
        await options?.onCreated?.(postId)
      } catch (e) {
        logError(e instanceof Error ? e : new Error(String(e)), 'submitPost:onCreated')
      }
      return true
    } catch (err) {
      logError(err as Error, 'submitPost')
      const typedErr = err as Error & { successCount?: number; totalCount?: number; code?: string; message?: string }

      // REQ-232 (FR-232-02): 失敗の原因種別のみ送出（メッセージ文字列・PII は送らない）。
      let failReason: 'rate_limit' | 'upload' | 'validation' | 'unknown' = 'unknown'

      // DB トリガーによるレートリミットエラーを検出（P0001 + 投稿上限キーワード）
      // クライアント側の localStorage チェックをバイパスされた場合にここに到達する
      if (typedErr.code === 'P0001' && typedErr.message?.includes('投稿上限')) {
        // DB の実投稿が期限切れになった後の再送を妨げないよう、架空の成功履歴は足さない。
        setError(t('postForm.rateLimitGeneric'))
        failReason = 'rate_limit'
      } else if (typedErr.successCount !== undefined && typedErr.successCount > 0) {
        setError(
          t('postForm.photoUploadPartial', {
            total: typedErr.totalCount,
            success: typedErr.successCount,
          })
        )
        failReason = 'upload'
      } else {
        setError(resolveErrorMessage(getErrorMessage(err as Error), t))
      }
      trackEvent('post_fail', { reason: failReason })
      return false
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  /** オフライン時の下書き保存 */
  const saveOffline = async (postData: PostFormData, options: { fieldworkStopId?: string } = {}): Promise<boolean> => {
    if (submittingRef.current || preparingRef.current) return false
    // REQ-330: 下書きは保存した利用者の名義で持つ（表示も送信もその人だけ）。名義の無い下書きは作らない。
    if (!currentUser) {
      setError(t('postForm.offlineLoginRequired'))
      return false
    }
    submittingRef.current = true
    setLoading(true)
    setError('')
    try {
      const pos = postData.position
      if (!pos) {
        setError(t('postForm.selectLocation'))
        return false
      }
      // 選択時に準備した同じJPEGを、ネットワークを使わず下書きへ保存。
      const processedBlobs: Blob[] = photos

      // REQ-185 FR-185-07 / AC-05: 退避できずに脱落する項目があれば、保存自体は行いつつ
      // ユーザーへ明示警告する。完全対応済みの現状では getOfflineDropWarning は null を
      // 返すため警告は出ない（success トーストと競合しない）。
      const dropWarning = getOfflineDropWarning({
        hasAudio: !!(audioBlob && audioMimeType),
        hasSurveyRequest: !!postData.surveyRequestId,
      })
      if (dropWarning) {
        setError(t(dropWarning))
      }

      await addPendingPost(
        // REQ-185 FR-185-04 / REQ-331: オンライン投稿（submitPost）と等価に復元するため、送るときと
        // 同じ関数で作った中身をそのまま退避する（位置精度・取得手段・調査依頼・調査手法・録音の長さ・
        // 位置の非公開まで含む）。再送は useOfflineQueue → postFieldsFromPending で読み戻す。
        postFieldsFromForm(postData, pos, audioDurationMs),
        processedBlobs,
        // REQ-185 FR-185-02: 録音音声があれば Blob を直接退避（Base64 変換しない）
        audioBlob && audioMimeType ? { blob: audioBlob, mimeType: audioMimeType } : null,
        currentUser.id,
        // REQ-330: 調査計画の地点から作った下書きの印（送るときに近くの希少種を確かめ直し、地点とつなぐ）
        options.fieldworkStopId ? { fieldworkStopId: options.fieldworkStopId } : undefined,
      )
      // REQ-232 (FR-232-02): オフライン下書き保存の計測。
      // REQ-185: 音声・調査依頼紐付けの退避有無も低カーディナリティ値で記録する。
      trackEvent('post_save_offline', {
        photo_count: photos.length,
        has_audio: !!(audioBlob && audioMimeType),
        has_survey_request: !!postData.surveyRequestId,
      })
      return true
    } catch (err) {
      logError(err as Error, 'saveOffline')
      setError(t('postForm.draftSaveFailed'))
      return false
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  const applyExifPosition = () => setShowExifBanner(false)
  const dismissExifBanner = () => { setShowExifBanner(false); setExifPosition(null) }

  const setAudio = (blob: Blob | null, mimeType: string | null, durationMs: number | null = null) => {
    setAudioBlob(blob)
    setAudioMimeType(mimeType)
    setAudioDurationMs(durationMs)
  }

  return {
    currentUser,
    photos,
    photoPreviews,
    photoProcessing,
    audioBlob,
    audioMimeType,
    setAudio,
    loading,
    error,
    uploadProgress,
    exifPosition,
    showExifBanner,
    imageGateWarning,
    dismissImageGateWarning,
    setError,
    handleFileChange,
    removePhoto,
    applyExifPosition,
    dismissExifBanner,
    submitPost,
    saveOffline,
  }
}
