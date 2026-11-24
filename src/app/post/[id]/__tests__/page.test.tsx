import { describe, it, expect, vi, beforeEach } from 'vitest'

// REQ-198 / AC-06: area/[municipality] の notFound 検証パターンに倣う。
// next/navigation.notFound は例外を投げる振る舞いをシムする。
const notFoundMock = vi.fn(() => {
  throw new Error('__NEXT_NOT_FOUND__')
})
vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
}))

// Supabase server client のモック。.single() の戻り値をテストごとに差し替える。
let singleResult: { data: unknown } = { data: null }

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: async () => singleResult,
      }
      return chain
    },
  }),
}))

vi.mock('../DetailPageClient', () => ({
  default: () => null,
}))

beforeEach(() => {
  notFoundMock.mockClear()
  singleResult = { data: null }
})

describe('post/[id]/page.tsx default (PostDetailPage)', () => {
  it('存在しない（RLS で見えない含む）ID は notFound() を呼ぶ', async () => {
    // RLS moderated_read により rejected/pending を第三者が見たときも data: null になる経路を兼ねる。
    singleResult = { data: null }
    const { default: PostDetailPage } = await import('../page')
    await expect(
      PostDetailPage({ params: Promise.resolve({ id: 'does-not-exist' }) }),
    ).rejects.toThrow(/__NEXT_NOT_FOUND__/)
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('存在する公開投稿は notFound() を呼ばない（200 で描画）', async () => {
    singleResult = {
      data: {
        id: 'p1',
        created_at: '2026-06-01T00:00:00Z',
        species: 'american_crayfish',
        info_type: 'sighting',
        municipality: '秋田市',
        comment: 'テスト',
        photos: [],
        status: 'approved',
        comments: [],
        likes: [],
      },
    }
    const { default: PostDetailPage } = await import('../page')
    await expect(
      PostDetailPage({ params: Promise.resolve({ id: 'p1' }) }),
    ).resolves.toBeTruthy()
    expect(notFoundMock).not.toHaveBeenCalled()
  })
})

describe('post/[id]/page.tsx generateMetadata', () => {
  it('存在しない ID は notFound を呼ばず title="投稿が見つかりません" を返す', async () => {
    singleResult = { data: null }
    const { generateMetadata } = await import('../page')
    const md = await generateMetadata({ params: Promise.resolve({ id: 'does-not-exist' }) })
    expect(md.title).toBe('投稿が見つかりません')
    expect(notFoundMock).not.toHaveBeenCalled()
  })
})
