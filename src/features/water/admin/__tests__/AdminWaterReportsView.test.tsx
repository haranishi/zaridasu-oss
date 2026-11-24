import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderJa } from '@/features/fieldwork/components/__tests__/withI18n'
import type { WaterReport } from '../../types'

const mocks = vi.hoisted(() => ({ load: vi.fn(), review: vi.fn(), photos: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))
vi.mock('@/lib/errorHandler', () => ({ logError: vi.fn() }))
vi.mock('../../data/reports', () => ({ selectWaterReportsForAdmin: mocks.load, reviewWaterReport: mocks.review }))
vi.mock('../../data/photos', () => ({ createWaterPhotoUrls: mocks.photos }))

import AdminWaterReportsView from '../AdminWaterReportsView'

const report: WaterReport = {
  id: 'report-1', user_id: 'user-1', client_id: 'client-1', name: '山の池', note: '道路の横に水面があります',
  lat: 39.7, lng: 140.1, photo_paths: ['user-1/photo.jpg'], status: 'pending',
  public_name: null, published_water_body_id: null, reviewed_at: null, reviewed_by: null,
  created_at: '2026-10-08T10:00:00Z',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.load.mockResolvedValue({ data: [report], error: null })
  mocks.photos.mockResolvedValue([{ path: report.photo_paths[0], url: 'https://example.invalid/signed-photo' }])
  mocks.review.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('水域情報提供の管理確認', () => {
  it('取得の通信失敗から再試行でき、写真だけの失敗でも申請を確認できる', async () => {
    mocks.load.mockRejectedValueOnce(new Error('Network unavailable'))
    mocks.photos.mockRejectedValueOnce(new Error('Photo unavailable'))
    renderJa(<AdminWaterReportsView />)
    expect(await screen.findByRole('alert')).toHaveTextContent('情報提供を読み込めませんでした')
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(await screen.findByRole('heading', { name: '山の池' })).toBeVisible()
    expect(await screen.findByText('写真を読み込めません。再試行できます。', { selector: 'p' })).toBeVisible()
    expect(screen.getByRole('button', { name: '採用して公開' })).toBeEnabled()
  })

  it('連打を一回に抑え、審査失敗後は公開名称を保持して同じ申請を再試行できる', async () => {
    const attempt = deferred<void>()
    mocks.review.mockReturnValueOnce(attempt.promise)
    renderJa(<AdminWaterReportsView />)
    const name = await screen.findByLabelText('公開する水域の名前')
    fireEvent.change(name, { target: { value: '確認した池の名前' } })
    const accept = screen.getByRole('button', { name: '採用して公開' })
    fireEvent.click(accept)
    fireEvent.click(accept)
    expect(mocks.review).toHaveBeenCalledTimes(1)
    expect(mocks.review).toHaveBeenCalledWith({}, 'report-1', 'accepted', '確認した池の名前')
    await act(async () => attempt.reject(new Error('Temporary failure')))
    expect(await screen.findByRole('alert')).toHaveTextContent('審査結果を保存できませんでした')
    expect(name).toHaveValue('確認した池の名前')
    mocks.load.mockResolvedValue({ data: [{ ...report, status: 'accepted', public_name: '確認した池の名前' }], error: null })
    fireEvent.click(screen.getByRole('button', { name: '採用して公開' }))
    await waitFor(() => expect(mocks.review).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('水域を採用し、名前とおおよその位置を公開しました。')).toBeVisible()
    expect(screen.queryByRole('heading', { name: '山の池' })).not.toBeInTheDocument()
  })

  it('採用済み申請は確認済みの公開名称で表示し、公開を取り消せる', async () => {
    mocks.load.mockResolvedValue({ data: [{ ...report, status: 'accepted', public_name: '公開名称', published_water_body_id: 'water-1' }], error: null })
    renderJa(<AdminWaterReportsView />)
    await screen.findByText('この状態の情報提供はありません。')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'accepted' } })
    expect(await screen.findByLabelText('公開する水域の名前')).toHaveValue('公開名称')
    fireEvent.click(screen.getByRole('button', { name: '公開を取り消す' }))
    await waitFor(() => expect(mocks.review).toHaveBeenCalledWith({}, 'report-1', 'rejected', undefined))
    expect(await screen.findByText('公開を取り消し、水域一覧から外しました。')).toBeVisible()
  })

  it('審査待ちの見送りは公開取消と区別し、絞り込み変更で通知と審査エラーを消す', async () => {
    renderJa(<AdminWaterReportsView />)
    await screen.findByRole('heading', { name: '山の池' })
    fireEvent.click(screen.getByRole('button', { name: '見送る' }))
    expect(await screen.findByText('情報提供を見送りました。')).toBeVisible()
    fireEvent.change(screen.getByLabelText('公開する水域の名前'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '採用して公開' }))
    expect(screen.getByRole('alert')).toHaveTextContent('公開する名前を80文字以内で入力してください。')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'rejected' } })
    expect(screen.queryByText('情報提供を見送りました。')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('審査状態をサーバー側で絞り込み、上限で省略した報告があれば明示する', async () => {
    mocks.load.mockResolvedValue({ data: [report], error: null, count: 1200 })
    renderJa(<AdminWaterReportsView />)

    await screen.findByRole('heading', { name: '山の池' })
    expect(mocks.load).toHaveBeenCalledWith({}, 'pending')
    expect(screen.getByText(/最新1000件/)).toBeVisible()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'rejected' } })
    await waitFor(() => expect(mocks.load).toHaveBeenCalledWith({}, 'rejected'))
  })

  it('更新前の署名URLが遅れて返っても、新しい一覧へ写真を混ぜない', async () => {
    const oldPhotos = deferred<{ path: string; url: string }[]>()
    mocks.photos.mockReturnValueOnce(oldPhotos.promise)
    renderJa(<AdminWaterReportsView />)
    await screen.findByRole('heading', { name: '山の池' })
    mocks.load.mockResolvedValue({ data: [{ ...report, id: 'report-2', name: '別の池', photo_paths: ['user-2/new.jpg'] }], error: null })
    mocks.photos.mockResolvedValueOnce([{ path: 'user-2/new.jpg', url: 'https://example.invalid/new-signed' }])
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    const photo = await screen.findByRole('img', { name: '水域の写真 1' })
    await waitFor(() => expect(photo).toHaveAttribute('src', 'https://example.invalid/new-signed'))
    await act(async () => oldPhotos.resolve([{ path: report.photo_paths[0]!, url: 'https://example.invalid/stale-signed' }]))
    expect(screen.getByRole('img', { name: '水域の写真 1' })).toHaveAttribute('src', 'https://example.invalid/new-signed')
  })
})
