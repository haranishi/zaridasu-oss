import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Database } from '@/types/database.types'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ supabase: { rpc } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'fake-admin' } }) }))
vi.mock('@/lib/errorHandler', () => ({ logError: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

import AdminLogsPage from '../AdminLogsPage'

type AuditLog = Database['public']['Functions']['get_audit_logs']['Returns'][number]
const loginFailure: AuditLog = {
  id: 'failed-login', admin_id: null, admin_email: null,
  action: 'login_failed', target_type: 'user', target_id: null,
  details: { reason: 'invalid_credentials', attempts: 1 },
  created_at: '2026-10-08T06:00:00Z', total_count: 41,
}
const deletedAdmin: AuditLog = {
  ...loginFailure, id: 'deleted-admin', action: 'delete_post',
  admin_id: '12345678-aaaa-bbbb-cccc-1234567890ab',
  target_id: '87654321-aaaa-bbbb-cccc-1234567890ab', details: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockImplementation((name: string) => Promise.resolve({
    data: name === 'get_audit_logs' ? [loginFailure, deletedAdmin] : [], error: null,
  }))
})

describe('AdminLogsPage', () => {
  it('管理者・対象IDがNULLの失敗ログと、メールのない管理者を両方のレイアウトに表示する', async () => {
    render(<AdminLogsPage />)
    expect(await screen.findAllByText('invalid_credentials', { exact: false })).toHaveLength(2)
    expect(screen.getAllByText('admin.logs.action.login_failed')).toHaveLength(3)
    expect(screen.getAllByText('12345678…')).toHaveLength(2)
    expect(screen.getAllByText('87654321…')).toHaveLength(2)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4)
  })

  it('有効なJSONのネスト値、配列、スカラーを文字列として安全に表示する', async () => {
    const details = [{ payload: { toString: null }, nested: ['one', 2] }, ['array', 3], 'scalar']
    rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === 'get_audit_logs' ? details.map((value, index) => ({
        ...deletedAdmin, id: `details-${index}`, details: value,
      })) : [], error: null,
    }))
    render(<AdminLogsPage />)
    expect(await screen.findAllByText('payload: {"toString":null}')).toHaveLength(2)
    expect(screen.getAllByText('nested: ["one",2]')).toHaveLength(2)
    expect(screen.getAllByText('["array",3]')).toHaveLength(2)
    expect(screen.getAllByText('scalar')).toHaveLength(2)
  })

  it('ページ移動と操作種別フィルターで正しいRPCパラメータを送る', async () => {
    render(<AdminLogsPage />)
    await screen.findAllByText('12345678…')
    fireEvent.click(screen.getByRole('button', { name: 'admin.logs.next' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('get_audit_logs', expect.objectContaining({ p_offset: 20 })))
    fireEvent.change(screen.getAllByRole('combobox')[0]!, { target: { value: 'login_failed' } })
    await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('get_audit_logs', expect.objectContaining({
      p_offset: 0, p_action: 'login_failed',
    })))
  })

  it('NULLを空セルにしてネストJSONをCSVへ書き出す', async () => {
    const createObjectURL = vi.fn(() => 'blob:logs')
    globalThis.URL.createObjectURL = createObjectURL
    globalThis.URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<AdminLogsPage />)
    await screen.findAllByText('12345678…')
    fireEvent.click(screen.getByRole('button', { name: 'admin.logs.exportCsv' }))
    const blob = (createObjectURL.mock.calls as unknown as [Blob][])[0]![0]
    expect(await blob.text()).toContain(',admin.logs.action.login_failed,admin.logs.target.user,,"{""reason"":""invalid_credentials"",""attempts"":1}"')
    expect(click).toHaveBeenCalledOnce()
    click.mockRestore()
  })

  it.each(['rpc error', 'network rejection'])('%sから再試行して操作ログを復旧できる', async (failure) => {
    let attempts = 0
    rpc.mockImplementation((name: string) => {
      if (name !== 'get_audit_logs') return Promise.resolve({ data: [], error: null })
      if (attempts++ === 0) {
        return failure === 'network rejection'
          ? Promise.reject(new TypeError('fetch failed'))
          : Promise.resolve({ data: null, error: { message: 'temporary failure' } })
      }
      return Promise.resolve({ data: [loginFailure], error: null })
    })
    render(<AdminLogsPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('admin.logs.fetchFailed')
    expect(screen.queryByText('admin.logs.empty')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    await screen.findAllByText('invalid_credentials', { exact: false })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(attempts).toBe(2)
  })

  it.each(['failure', 'success'])('フィルター変更前の遅い%sで最新結果を上書きしない', async (lateResult) => {
    let resolveOld!: (value: { data: AuditLog[]; error: null }) => void
    let rejectOld!: (error: Error) => void
    const oldRequest = new Promise<{ data: AuditLog[]; error: null }>((resolve, reject) => {
      resolveOld = resolve
      rejectOld = reject
    })
    let attempts = 0
    rpc.mockImplementation((name: string) => {
      if (name !== 'get_audit_logs') return Promise.resolve({ data: [], error: null })
      return attempts++ === 0 ? oldRequest : Promise.resolve({
        data: [{ ...loginFailure, details: { reason: 'latest_result' } }], error: null,
      })
    })
    render(<AdminLogsPage />)
    fireEvent.change(screen.getAllByRole('combobox')[0]!, { target: { value: 'login_failed' } })
    expect(await screen.findAllByText('latest_result', { exact: false })).toHaveLength(2)
    await act(async () => {
      if (lateResult === 'failure') rejectOld(new TypeError('old fetch failed'))
      else resolveOld({ data: [{ ...deletedAdmin, details: { reason: 'outdated_result' } }], error: null })
      await Promise.resolve()
    })
    expect(screen.getAllByText('latest_result', { exact: false })).toHaveLength(2)
    expect(screen.queryByText('outdated_result', { exact: false })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('admin.logs.loading')).toBeNull()
  })
})
