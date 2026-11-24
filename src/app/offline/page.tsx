import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'オフライン',
  robots: { index: false, follow: false },
}

export { default } from '@/views/OfflinePage'
