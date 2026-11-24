import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '認証',
  robots: { index: false, follow: false },
}

export { default } from '@/views/AuthCallbackPage'
