import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '管理者ログイン',
  robots: { index: false, follow: false },
}

export { default } from '@/views/admin/AdminLoginPage'
