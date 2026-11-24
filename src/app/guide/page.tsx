import { buildPageMetadata } from '@/lib/seo'
import HomeGuide from '@/components/features/home/HomeGuide'

export const metadata = buildPageMetadata({
  title: '記録ガイド',
  description: 'ザリダスで水辺の生き物を記録するときの写真、場所、不在確認の残し方。',
  path: '/guide',
})

export default function GuidePage() { return <HomeGuide /> }
