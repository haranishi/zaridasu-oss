import type { Metadata } from 'next'

// REQ-250: 個人のコレクション（図鑑・水槽）。本人専用のため noindex（dashboard と同方針）。
export const metadata: Metadata = {
  title: 'コレクション',
  robots: { index: false, follow: false },
}

export { default } from '@/views/CollectionPage'
