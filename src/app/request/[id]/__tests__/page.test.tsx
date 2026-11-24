import { describe, it, expect, vi, beforeEach } from 'vitest'

// REQ-198 / AC-06: area/[municipality] の notFound 検証パターンに倣う。
const notFoundMock = vi.fn(() => {
  throw new Error('__NEXT_NOT_FOUND__')
})
vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
}))

let singleResult: { data: unknown } = { data: null }

// REQ-186: 本ルートは cookie 非依存の anon クライアント(同期・null 可)を使う。
vi.mock('@/lib/supabase/anon', () => ({
  createAnonClient: () => ({
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

vi.mock('../SurveyRequestPageClient', () => ({
  default: () => null,
}))

beforeEach(() => {
  notFoundMock.mockClear()
  singleResult = { data: null }
})

describe('request/[id]/page.tsx default (SurveyRequestPage)', () => {
  it('存在しない依頼 ID は notFound() を呼ぶ', async () => {
    singleResult = { data: null }
    const { default: SurveyRequestPage } = await import('../page')
    await expect(
      SurveyRequestPage({ params: Promise.resolve({ id: 'does-not-exist' }) }),
    ).rejects.toThrow(/__NEXT_NOT_FOUND__/)
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('存在する依頼は notFound() を呼ばない（200 で描画）', async () => {
    singleResult = {
      data: {
        id: 'r1',
        species: 'american_crayfish',
        municipality: '秋田市',
        reason: 'テスト',
        urgency: 'medium',
        status: 'open',
        created_at: '2026-06-01T00:00:00Z',
      },
    }
    const { default: SurveyRequestPage } = await import('../page')
    await expect(
      SurveyRequestPage({ params: Promise.resolve({ id: 'r1' }) }),
    ).resolves.toBeTruthy()
    expect(notFoundMock).not.toHaveBeenCalled()
  })
})

describe('request/[id]/page.tsx generateMetadata', () => {
  it('存在しない ID は notFound を呼ばず title="調査依頼が見つかりません" を返す', async () => {
    singleResult = { data: null }
    const { generateMetadata } = await import('../page')
    const md = await generateMetadata({ params: Promise.resolve({ id: 'does-not-exist' }) })
    expect(md.title).toBe('調査依頼が見つかりません')
    expect(notFoundMock).not.toHaveBeenCalled()
  })
})
