/**
 * Supabase Storage の画像変換URLを生成する
 * 有料プラン（Image Transformation）が有効な場合にリサイズされた画像を返す
 * 無効な場合は元URLをそのまま返す
 */
export function toThumbnailUrl(url: string | null | undefined, width: number = 200): string | null | undefined {
  if (!url) return url
  if (!url.includes('/storage/v1/object/public/')) return url
  return (
    url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') +
    `?width=${width}&quality=80`
  )
}
