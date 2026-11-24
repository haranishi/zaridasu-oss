import { buildPageMetadata } from '@/lib/seo'
import HomePage from '@/views/HomePage'

export const metadata = buildPageMetadata({
  title: '秋田県外来生物情報マップ',
  description: 'アメリカザリガニ・ウシガエルの公開された観察記録を地図で確認できます。',
  path: '/map',
})

export default function MapPage() {
  return <><link rel="preload" as="image" href="/map-tile-placeholder.png" fetchPriority="high" /><h1 className="sr-only">秋田県外来生物情報マップ</h1><HomePage /></>
}
