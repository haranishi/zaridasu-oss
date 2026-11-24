import { MetadataRoute } from 'next'
import { BASE_URL } from '@/lib/constants'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      // REQ-275 FR-275-05: JSON API（/api/nearby-water 等）はクロール不要のため /api/ を
      // まとめて disallow する。/api/og は SNS カード用のOG画像なので allow で除外する
      // （robots の最長一致ルールにより allow が優先される）。
      allow: ['/', '/api/og'],
      // REQ-177: 旧静的 public/robots.txt 削除に伴い、そこにあった保護パスを後退させないため
      // /offline を引き継ぐ（オフラインフォールバックページはインデックス不要）。/auth/callback は
      // 認証コールバック URL のクロール露出を防ぐため動的版で新規追加済み。
      disallow: ['/admin/', '/dashboard', '/auth/callback', '/offline', '/api/'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
