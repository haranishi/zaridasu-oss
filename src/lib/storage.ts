import { supabase } from '@/lib/supabase/client'
import { processImage } from '@/lib/imageProcessor'
import { postMediaPaths } from '@/lib/postMedia'

// 既存の import（'@/lib/storage'）を壊さない。パス計算と削除は postMedia.ts にある。
export { extractPhotoPath } from '@/lib/postMedia'

export async function deletePhotos(urls: string[]): Promise<void> {
  if (!urls.length) return
  // AI 用の縮小版（<id>.ai.jpg）も一緒に消す
  const { photoPaths } = postMediaPaths({ photos: urls })
  if (photoPaths.length) await supabase.storage.from('post-photos').remove(photoPaths)
}

/**
 * REQ-243 FR-243-04: 投稿編集の写真追加を本体投稿（usePostForm）と同じ EXIF 除去パイプラインに通す。
 * - processImage が EXIF/GPS を除去し長辺 1280px にリサイズ + JPEG 変換する（撮影地点の座標漏えい防止）。
 * - 変換に失敗すると processImage は原本（位置情報つき）をそのまま返す。公開の保管先へ原本を送らないよう、
 *   原本のまま・JPEG でない・空のときは送らず null を返す（新規投稿・希少種・水域の写真と同じ約束）。
 * - 保存パスは `${auth.uid()}/${uuid}.jpg`。ストレージ INSERT ポリシー authenticated_upload
 *   （(storage.foldername(name))[1] = auth.uid()）と一致し、拡張子はホワイトリスト固定
 *   （ユーザー入力 file.name をキーに使わない＝`..` 混入余地を排除）。
 */
export async function uploadPhoto(userId: string, file: File): Promise<string | null> {
  const processed = await processImage(file)
  if (processed === file || processed.type !== 'image/jpeg' || processed.size === 0) return null
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from('post-photos')
    .upload(path, processed, { cacheControl: '3600', upsert: false })
  if (error) return null
  const { data } = supabase.storage.from('post-photos').getPublicUrl(path)
  return data.publicUrl
}
