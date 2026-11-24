import { supabase } from '@/lib/supabase/client'

export function extractPhotoPath(url: string): string {
  return url.split('/post-photos/')[1] || ''
}

export function extractAudioPath(url: string): string {
  return url.split('/post-audio/')[1] || ''
}

/**
 * AI 判定用の縮小版は、本体 `<id>.jpg` の隣の `<id>.ai.jpg` に置かれる（usePostForm）。
 * 本体と別のオブジェクトで、本体を消しても残る。
 */
export function aiVariantPath(photoPath: string): string {
  return photoPath.replace(/\.jpg$/i, '.ai.jpg')
}

/**
 * 投稿に紐づく保管先の実体。写真とその AI 縮小版は post-photos、音声は post-audio。
 * 縮小版が無い投稿でも、存在しないパスの remove は成功するので、本体のパスから機械的に足す。
 */
export function postMediaPaths(post: {
  photos?: string[] | null
  audio_url?: string | null
}): { photoPaths: string[]; audioPaths: string[] } {
  const photos = (post.photos ?? []).map(extractPhotoPath).filter(Boolean)
  const variants = photos.map(aiVariantPath).filter((path, i) => path !== photos[i])
  const audio = post.audio_url ? extractAudioPath(post.audio_url) : ''
  return { photoPaths: [...photos, ...variants], audioPaths: audio ? [audio] : [] }
}

/**
 * 投稿の写真・AI 縮小版・音声を保管先から消す。1 つでも消せなかったら `storage_remove_failed` を投げる。
 * 公開の保管先なので、行を消しても実体が残ると、URL を控えた人が見続けられる（docs/current/privacy.md）。
 * 画像変換（storage.ts）は重いので、管理画面などが消すためだけに読み込まないよう、このファイルに分けてある。
 */
export async function removePostMedia(post: {
  photos?: string[] | null
  audio_url?: string | null
}): Promise<void> {
  const { photoPaths, audioPaths } = postMediaPaths(post)
  if (photoPaths.length) {
    const { error } = await supabase.storage.from('post-photos').remove(photoPaths)
    if (error) throw Object.assign(new Error('storage_remove_failed'), { cause: error })
  }
  if (audioPaths.length) {
    const { error } = await supabase.storage.from('post-audio').remove(audioPaths)
    if (error) throw Object.assign(new Error('storage_remove_failed'), { cause: error })
  }
}
