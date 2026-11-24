import { describe, it, expect, vi, beforeEach } from 'vitest'

// next/navigation.notFound は例外を投げる振る舞いをシム
const notFoundMock = vi.fn(() => {
  throw new Error('__NEXT_NOT_FOUND__')
})
vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
}))

// Supabase server client のモック（チェーン）
type QueryResult<T> = Promise<{ count?: number; data?: T[]; error: null }>

const selectQueue: Array<QueryResult<unknown>> = []

// REQ-186: 本ルートは cookie 非依存の anon クライアント(同期・null 可)を使う。
vi.mock('@/lib/supabase/anon', () => ({
  createAnonClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        then(onFulfilled: (v: unknown) => unknown) {
          const next = selectQueue.shift() ?? Promise.resolve({ count: 0, data: [], error: null })
          return next.then(onFulfilled)
        },
      }
      return chain
    },
  }),
}))

vi.mock('@/views/AreaPage', () => ({
  default: () => null,
}))

beforeEach(() => {
  notFoundMock.mockClear()
  selectQueue.length = 0
})

describe('area/[municipality]/page.tsx generateMetadata', () => {
  it('未知 slug は title="地域が見つかりません" を返す（notFound は呼ばない）', async () => {
    const { generateMetadata } = await import('../page')
    const md = await generateMetadata({ params: Promise.resolve({ municipality: 'non-existent-xyz' }) })
    expect(md.title).toBe('地域が見つかりません')
  })

  it('既知 slug は canonical=/area/<slug> を返す', async () => {
    selectQueue.push(Promise.resolve({ count: 12, error: null }))
    const { generateMetadata } = await import('../page')
    const md = await generateMetadata({ params: Promise.resolve({ municipality: 'akita-shi' }) })
    expect(md.alternates?.canonical).toBe('/area/akita-shi')
    expect(String(md.title)).toContain('秋田市')
  })
})

describe('area/[municipality]/page.tsx default (AreaPage)', () => {
  it('未知 slug は notFound() を呼ぶ', async () => {
    const { default: AreaPage } = await import('../page')
    await expect(
      AreaPage({ params: Promise.resolve({ municipality: 'non-existent-xyz' }) }),
    ).rejects.toThrow(/__NEXT_NOT_FOUND__/)
    expect(notFoundMock).toHaveBeenCalled()
  })
})
