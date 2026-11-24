import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import QuickSaveSheet from '../QuickSaveSheet'
import ja from '@/locales/ja/translation.json'

function translationValue(key: string): unknown {
  let value: unknown = ja
  for (const part of key.split('.')) {
    if (value == null || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[part]
  }
  return value
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const value = translationValue(key)
      if (typeof value !== 'string') return key
      return opts ? value.replace(/\{\{(\w+)\}\}/g, (_: string, n: string) => String(opts[n] ?? '')) : value
    },
  }),
}))
vi.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ dark: false }) }))
const { toastSuccess, toastError } = vi.hoisted(() => ({ toastSuccess: vi.fn(), toastError: vi.fn() }))
vi.mock('@/context/ToastContext', () => ({ useToastContext: () => ({ success: toastSuccess, error: toastError }) }))

function mockGeolocation(result: 'ok' | 'error') {
  const getCurrentPosition = vi.fn((ok: PositionCallback, ng: PositionErrorCallback) => {
    if (result === 'ok') ok({ coords: { latitude: 39.71234, longitude: 140.12345, accuracy: 12.4 } } as GeolocationPosition)
    else ng({ code: 1, message: 'denied' } as GeolocationPositionError)
  })
  Object.defineProperty(window.navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
  return getCurrentPosition
}

beforeEach(() => vi.clearAllMocks())

describe('QuickSaveSheet (REQ-329)', () => {
  it('ピンから開いたときは現在地を取らず、名前が空なら既定名で保存して閉じる', async () => {
    const geo = mockGeolocation('ok')
    const onSave = vi.fn().mockResolvedValue({ status: 'saved' })
    const onClose = vi.fn()
    render(<QuickSaveSheet initialPosition={{ lat: 39.5, lng: 140.5 }} mapCenter={null} onSave={onSave} onClose={onClose} />)
    expect(geo).not.toHaveBeenCalled()
    expect(screen.getByText('ピンの位置を保存します')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /非公開で保存/ }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const arg = onSave.mock.calls[0]?.[0]
    expect(arg).toMatchObject({ lat: 39.5, lng: 140.5, accuracy: null, note: null })
    expect(arg.name).toMatch(/^非公開スポット \d{1,2}\/\d{1,2} \d{2}:\d{2}$/)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('現在地で保存するとき、入力した名前と誤差（m・整数）を渡す', async () => {
    mockGeolocation('ok')
    const onSave = vi.fn().mockResolvedValue({ status: 'saved' })
    render(<QuickSaveSheet initialPosition={null} mapCenter={null} onSave={onSave} onClose={vi.fn()} />)
    await screen.findByText('現在地を保存します')
    fireEvent.change(screen.getByLabelText(/名前/), { target: { value: '  〇〇沼の  メダカ ' } })
    fireEvent.click(screen.getByRole('button', { name: /非公開で保存/ }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ name: '〇〇沼の メダカ', lat: 39.71234, lng: 140.12345, accuracy: 12 })
  })

  it('現在地が取れないときは地図の中心で保存できる', async () => {
    mockGeolocation('error')
    const onSave = vi.fn().mockResolvedValue({ status: 'queued' })
    render(<QuickSaveSheet initialPosition={null} mapCenter={{ lat: 39.1, lng: 140.2 }} onSave={onSave} onClose={vi.fn()} />)
    expect(await screen.findByText('現在地を取得できませんでした。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /非公開で保存/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '地図の中心を使う' }))
    fireEvent.click(screen.getByRole('button', { name: /非公開で保存/ }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ lat: 39.1, lng: 140.2 })
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('圏外のため端末に保存しました。つながったら自動で送ります'))
  })

  it('保存できなかったときは理由を出して閉じない', async () => {
    const onSave = vi.fn().mockResolvedValue({ status: 'error', reason: 'rateLimit' })
    const onClose = vi.fn()
    render(<QuickSaveSheet initialPosition={{ lat: 39.5, lng: 140.5 }} mapCenter={null} onSave={onSave} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /非公開で保存/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('短時間に保存しすぎています')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('非公開であること（本人と運営だけ）を必ず表示する', () => {
    render(<QuickSaveSheet initialPosition={{ lat: 39.5, lng: 140.5 }} mapCenter={null} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/あなたと運営（管理者）だけが見られます/)).toBeInTheDocument()
  })
})
