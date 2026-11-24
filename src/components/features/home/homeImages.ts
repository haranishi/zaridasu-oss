/**
 * ホームの説明用画像（生成した画像）。画像の最適化は同じURLの結果を長く覚える（next.config の minimumCacheTTL=31日）ため、
 * 中身を差し替えるときは同じ名前に上書きせず、ファイル名の版（-v2）を上げる。
 */
export const HOME_IMAGES = {
  canal: '/images/home/canal-v2.webp',
  pond: '/images/home/pond-v2.webp',
  crayfish: '/images/home/crayfish-v2.webp',
  bullfrog: '/images/home/bullfrog-v2.webp',
  waterside: '/images/home/waterside-v2.webp',
  phone: '/images/home/phone-v2.webp',
} as const

export type HomeImage = keyof typeof HOME_IMAGES
