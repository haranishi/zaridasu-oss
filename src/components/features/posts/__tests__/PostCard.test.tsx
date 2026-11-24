import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PostCard from '../PostCard'

const translations = {
  'species.american': 'アメリカザリガニ',
  'species.bullfrog': 'ウシガエル',
  'infoType.sighting': '目撃',
  'infoType.capture': '捕獲',
  'infoType.trace': '痕跡',
  'infoType.damage': '農業被害',
  'postCard.anonymous': '匿名',
  'postCard.official': '公式',
  'postCard.verified': '確認済み',
  'postCard.unknown': '不明',
  'postCard.count': '{{count}}匹',
  'postCard.verifiedTitle': 'ログイン済みユーザーによる投稿です',
  'postCard.officialTitle': '運営チームが登録した公式データです',
  'postCard.editTitle': 'この投稿を編集',
  'postCard.deleteTitle': 'この投稿を削除',
  'postCard.deleteCancel': 'キャンセル',
  'postCard.deleteOk': '削除する',
  'postCard.deleting': '削除中...',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => {
      const val = translations[key as keyof typeof translations]
      if (val && opts) return val.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => opts[k] ?? '')
      return val || key
    },
    i18n: { language: 'ja' },
  }),
}))

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}))

vi.mock('../../../../context/ThemeContext', () => ({
  useTheme: () => ({ dark: false }),
}))

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    storage: { from: vi.fn(() => ({ remove: vi.fn() })) },
    from: vi.fn(() => ({ delete: vi.fn(() => ({ eq: vi.fn() })) })),
  },
}))

// Mock next/navigation for useRouter
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const basePost = {
  id: 'post-1',
  species: 'american' as const,
  info_type: 'sighting' as const,
  municipality: '秋田市',
  count: 2,
  comment: 'テストコメント',
  created_at: '2024-01-15T10:00:00Z',
  is_anonymous: true,
  is_official: false,
  user_id: 'user-1',
  photos: [] as string[],
  lat: 39.72,
  lng: 140.1,
  observed_at: '2024-01-15',
  updated_at: '2024-01-15T10:00:00Z',
  // REQ-243: posts Row に追加された公開レベル/粗化列
  location_disclosure: 'coarsened' as const,
  display_lat: 39.72,
  display_lng: 140.1,
  // REQ-231: posts Row に追加された地理列（enrichment・全 NULL 許容）
  locality: null,
  water_body: null,
  is_on_water: null,
  elevation_m: null,
  geo_enriched_at: null,
  geo_source: null,
  // REQ-246: PostCardPost（= posts Row の上位集合）を満たすための残り列。
  // スパム対策・天気・審査ワークフロー・AI 判定・音声・実験/定点/調査依頼リンク。
  reporter_ip: null,
  is_flagged: false,
  weather: null,
  temperature: null,
  humidity: null,
  accuracy: null,
  status: 'approved' as const,
  rejection_reason: null,
  rejection_message: null,
  reviewed_at: null,
  reviewed_by: null,
  ai_result: null,
  ai_analyzed_at: null,
  auto_approved: false,
  ai_failure_count: 0,
  audio_hash: null,
  image_hashes: null,
  audio_duration_ms: null,
  survey_duration_minutes: null,
  audio_url: null,
  location_source: null,
  experiment_assignments: {},
  survey_method: null,
  survey_site_id: null,
  survey_request_id: null,
}

function renderPostCard(post = basePost, onDeleted = vi.fn(), onEdited = vi.fn()) {
  return render(<PostCard post={post} onDeleted={onDeleted} onEdited={onEdited} />)
}

describe('PostCard', () => {
  it('種類ラベルを表示する', () => {
    renderPostCard()
    expect(screen.getByText('アメリカザリガニ')).toBeInTheDocument()
  })

  it('情報タイプを表示する', () => {
    renderPostCard()
    expect(screen.getByText(/目撃/)).toBeInTheDocument()
  })

  it('市区町村を表示する', () => {
    renderPostCard()
    expect(screen.getByText('秋田市')).toBeInTheDocument()
  })

  it('匹数を表示する', () => {
    renderPostCard()
    expect(screen.getByText('2匹')).toBeInTheDocument()
  })

  it('コメントを表示する', () => {
    renderPostCard()
    expect(screen.getByText('テストコメント')).toBeInTheDocument()
  })

  it('is_anonymous=false の場合に確認済みバッジを表示する', () => {
    renderPostCard({ ...basePost, is_anonymous: false })
    expect(screen.getByText(/確認済み/)).toBeInTheDocument()
  })

  it('is_anonymous=true の場合は確認済みバッジを表示しない', () => {
    renderPostCard({ ...basePost, is_anonymous: true })
    expect(screen.queryByText(/確認済み/)).not.toBeInTheDocument()
  })

  it('is_official=true の場合に公式バッジを表示する', () => {
    renderPostCard({ ...basePost, is_official: true })
    expect(screen.getByText(/公式/)).toBeInTheDocument()
  })

  it('写真がある場合にサムネイルを表示する', () => {
    const post = { ...basePost, photos: ['https://example.com/photo.jpg'] }
    const { container } = renderPostCard(post)
    const images = container.querySelectorAll('img')
    // REQ-147: unoptimized を外したため、サムネは Next.js Image Optimization 経由
    // (/_next/image?url=<encoded>) で配信される。元 URL がエンコードされて含まれることを確認する。
    expect(
      Array.from(images).some((img) => {
        const src = img.getAttribute('src') ?? ''
        return src.includes(encodeURIComponent('https://example.com/photo.jpg')) || src === 'https://example.com/photo.jpg'
      }),
    ).toBe(true)
  })
})
