import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import AdminDashboardPage from '../AdminDashboardPage'

const { fromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: fromMock, rpc: rpcMock },
}))
vi.mock('@/lib/errorHandler', () => ({ logError: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ja' } }),
}))
vi.mock('@/context/ToastContext', () => ({
  useToastContext: () => ({ success: vi.fn(), error: vi.fn() }),
}))
vi.mock('next/dynamic', () => ({ default: () => () => null }))

interface QueryResult {
  data: unknown
  count: number | null
  error: { message: string } | null
}

// Keep useAdminStats and settleAll real; replace only the Supabase query boundary.
function query(result: QueryResult) {
  const builder = {
    select: () => builder,
    abortSignal: () => builder,
    gte: () => builder,
    lte: () => builder,
    lt: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  }
  return builder
}

let requestsSucceed: boolean

beforeEach(() => {
  vi.clearAllMocks()
  requestsSucceed = false
  const failure: QueryResult = { data: null, count: null, error: { message: 'temporary failure' } }
  fromMock.mockImplementation((table: string) => query(requestsSucceed
    ? { data: [], count: table === 'reports' ? 0 : 17, error: null }
    : failure))
  rpcMock.mockImplementation((name: string) => query(requestsSucceed
    ? {
        data: name === 'get_admin_post_stats'
          ? { species_counts: [], info_type_counts: [], monthly: [], municipality_counts: [] }
          : [],
        count: null,
        error: null,
      }
    : failure))
})

describe('AdminDashboardPage', () => {
  it('retries failed critical queries and restores the dashboard for the same date range', async () => {
    render(<AdminDashboardPage />)
    const retry = await screen.findByRole('button', { name: '再試行' })
    expect(screen.getByText('統計データの取得に失敗しました。')).toBeInTheDocument()
    const initialCalls = rpcMock.mock.calls.filter(([name]) => name === 'get_admin_post_stats')
    expect(initialCalls).toHaveLength(1)
    const initialRange = initialCalls[0]![1]

    requestsSucceed = true
    fireEvent.click(retry)

    expect(await screen.findByRole('heading', { level: 1, name: 'admin.dashboard.title' }))
      .toBeInTheDocument()
    expect(screen.queryByText('統計データの取得に失敗しました。')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument()
    const postCard = screen.getByText('admin.dashboard.kpi.posts').parentElement!
    expect(within(postCard).getByText('17')).toBeInTheDocument()
    const calls = rpcMock.mock.calls.filter(([name]) => name === 'get_admin_post_stats')
    expect(calls).toHaveLength(2)
    expect(calls[1]![1]).toEqual(initialRange)
  })
})
