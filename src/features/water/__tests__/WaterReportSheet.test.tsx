import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PropsWithChildren } from 'react'

import ja from '@/locales/ja/translation.json'

const m = vi.hoisted(() => ({
  user: { current: '66666666-6666-6666-6666-666666666666' },
  prepare: vi.fn(), upload: vi.fn(), insert: vi.fn(), success: vi.fn(),
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: m.user.current } }) }))
vi.mock('@/context/ToastContext', () => ({ useToastContext: () => ({ success: m.success }) }))
vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))
vi.mock('../data/photos', async (original) => ({
  ...await original<typeof import('../data/photos')>(),
  prepareWaterPhoto: m.prepare, uploadWaterPhoto: m.upload,
}))
vi.mock('../data/reports', () => ({ insertWaterReport: m.insert }))

import WaterReportSheet from '../WaterReportSheet'

const USER = '66666666-6666-6666-6666-666666666666'
const POSITION = { lat: 39.7, lng: 140.1 }
const i18n = i18next.createInstance()
void i18n.use(initReactI18next).init({ lng: 'ja', resources: { ja: { translation: ja } }, initAsync: false, interpolation: { escapeValue: false } })
const Wrapper = ({ children }: PropsWithChildren) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
const photo = () => new File(['original'], 'IMG.HEIC', { type: 'image/heic' })

beforeEach(() => {
  vi.clearAllMocks()
  m.user.current = USER
  m.prepare.mockImplementation(() => Promise.resolve(new File(['jpeg'], 'safe.jpg', { type: 'image/jpeg' })))
  m.upload.mockResolvedValue(`${USER}/a.jpg`)
  m.insert.mockResolvedValue({ report: {}, duplicate: false })
  URL.createObjectURL = vi.fn(() => 'blob:water-preview')
  URL.revokeObjectURL = vi.fn()
  window.scrollTo = vi.fn()
})

describe('WaterReportSheet', () => {
  it('states what becomes public, traps focus and uses the existing Escape dismissal', () => {
    const onClose = vi.fn()
    render(<WaterReportSheet userId={USER} position={POSITION} onClose={onClose} />, { wrapper: Wrapper })
    expect(screen.getByRole('dialog', { name: '地図未掲載の水域を報告' })).toBeInTheDocument()
    expect(screen.getByText('採用後、名前とおおよその位置が公開されます。写真と補足は本人・管理者だけが確認できます。')).toBeInTheDocument()
    expect(screen.getByText('39.70000, 140.10000')).toBeInTheDocument()
    const close = within(screen.getByRole('dialog')).getByRole('button', { name: '閉じる' })
    const submit = screen.getByTestId('water-report-submit')
    submit.focus()
    fireEvent.keyDown(submit, { key: 'Tab' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('disables sending during preparation, retains location and reports success once', async () => {
    let finish!: (file: File) => void
    m.prepare.mockReturnValueOnce(new Promise<File>((resolve) => { finish = resolve }))
    const onClose = vi.fn(), onSubmitted = vi.fn()
    const view = render(<WaterReportSheet userId={USER} position={POSITION} onClose={onClose} onSubmitted={onSubmitted} />, { wrapper: Wrapper })
    fireEvent.change(screen.getByTestId('water-report-name'), { target: { value: '小さな池' } })
    fireEvent.change(screen.getByTestId('water-report-note'), { target: { value: '岸から撮影' } })
    fireEvent.change(screen.getByTestId('water-report-photos'), { target: { files: [photo()] } })
    expect(screen.getByTestId('water-report-submit')).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('写真を準備中… 0/1')
    await act(async () => finish(new File(['safe'], 'x.jpg', { type: 'image/jpeg' })))
    expect(await screen.findByAltText('水域の写真 1')).toHaveAttribute('src', 'blob:water-preview')
    view.rerender(<WaterReportSheet userId={USER} position={{ lat: 40, lng: 141 }} onClose={onClose} onSubmitted={onSubmitted} />)
    expect(screen.getByText('39.70000, 140.10000')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('water-report-submit'))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(m.insert.mock.calls[0]![1]).toMatchObject({ name: '小さな池', note: '岸から撮影', ...POSITION })
    expect(m.success).toHaveBeenCalledWith('情報を受け付けました。管理者が確認します。')
    expect(onSubmitted).toHaveBeenCalledTimes(1)
  })

  it('keeps failed input visible and retries the same report without reuploading', async () => {
    m.insert.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const onClose = vi.fn()
    render(<WaterReportSheet userId={USER} position={POSITION} onClose={onClose} />, { wrapper: Wrapper })
    fireEvent.change(screen.getByTestId('water-report-name'), { target: { value: '小さな池' } })
    fireEvent.change(screen.getByTestId('water-report-note'), { target: { value: '岸から撮影' } })
    fireEvent.change(screen.getByTestId('water-report-photos'), { target: { files: [photo()] } })
    await screen.findByAltText('水域の写真 1')
    fireEvent.click(screen.getByTestId('water-report-submit'))
    expect(await screen.findByRole('alert')).toHaveTextContent('入力は残っています')
    expect(screen.getByTestId('water-report-name')).toHaveValue('小さな池')
    expect(screen.getByTestId('water-report-note')).toHaveValue('岸から撮影')
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('water-report-submit'))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(m.upload).toHaveBeenCalledTimes(1)
    expect(m.insert.mock.calls[0]![1].clientId).toBe(m.insert.mock.calls[1]![1].clientId)
  })

  it('hides the old account draft immediately and starts a clean form for a different owner', async () => {
    const onClose = vi.fn()
    const view = render(<WaterReportSheet userId={USER} position={POSITION} onClose={onClose} />, { wrapper: Wrapper })
    fireEvent.change(screen.getByTestId('water-report-name'), { target: { value: '前の人の池' } })
    fireEvent.change(screen.getByTestId('water-report-photos'), { target: { files: [photo()] } })
    await screen.findByAltText('水域の写真 1')
    const next = '77777777-7777-7777-7777-777777777777'
    m.user.current = next
    view.rerender(<WaterReportSheet userId={USER} position={POSITION} onClose={onClose} />)
    expect(screen.queryByTestId('water-report-name')).toBeNull()
    expect(screen.queryByAltText('水域の写真 1')).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('ログイン状態が変わりました')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:water-preview')
    view.rerender(<WaterReportSheet userId={next} position={POSITION} onClose={onClose} />)
    expect(screen.getByTestId('water-report-name')).toHaveValue('')
    expect(screen.queryByAltText('水域の写真 1')).toBeNull()
    expect(m.insert).not.toHaveBeenCalled()
  })
})
