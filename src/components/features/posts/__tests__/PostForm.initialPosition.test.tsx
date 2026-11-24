import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'

// REQ-330 / REQ-331: PostForm の props の約束を固定する。
//   - initialPosition の精度・取り方（gps / map）で位置の状態を始める。渡さなければ従来どおり手動の位置
//   - 通常の送信では onCreated を submitPost へ渡す。圏外の下書き保存では渡さない
// 実フォームは依存が多いので、送信の手前（usePostForm）と子部品はモックにし、PostForm 自身の配線だけを見る。

const { submitPostMock, saveOfflineMock, locationProps, online } = vi.hoisted(() => ({
  submitPostMock: vi.fn(),
  saveOfflineMock: vi.fn(),
  locationProps: { current: null as Record<string, unknown> | null },
  online: { current: true },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ja' } }),
}))
vi.mock('next/image', () => ({ default: () => null }))
vi.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ dark: false }) }))
vi.mock('@/context/ToastContext', () => ({ useToastContext: () => ({ success: vi.fn(), error: vi.fn() }) }))
vi.mock('@/hooks/useEscapeKey', () => ({ useEscapeKey: () => {} }))
vi.mock('@/hooks/useBodyScrollLock', () => ({ useBodyScrollLock: () => {} }))
vi.mock('@/hooks/useFocusTrap', () => ({ useFocusTrap: () => {} }))
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => online.current }))
vi.mock('@/hooks/posts/usePostDraft', () => ({ usePostDraft: () => {}, loadDraft: () => null, clearDraft: () => {} }))
vi.mock('@/hooks/useReverseGeocode', () => ({
  useReverseGeocode: () => ({ municipality: '', prefecture: '', geocoding: false, geocodeError: '', retry: () => {} }),
}))
vi.mock('@/hooks/useWeather', () => ({ useWeather: () => ({ weatherData: null, fetching: false, weatherError: false }) }))
vi.mock('@/hooks/posts/usePostForm', () => ({
  usePostForm: () => ({
    currentUser: { id: 'user-1' },
    photos: [],
    photoPreviews: [],
    audioBlob: null,
    audioMimeType: null,
    setAudio: () => {},
    loading: false,
    error: '',
    uploadProgress: null,
    exifPosition: null,
    showExifBanner: false,
    imageGateWarning: null,
    dismissImageGateWarning: () => {},
    setError: () => {},
    handleFileChange: () => {},
    removePhoto: () => {},
    applyExifPosition: () => {},
    dismissExifBanner: () => {},
    submitPost: submitPostMock,
    saveOffline: saveOfflineMock,
  }),
}))
// 位置セクションには、PostForm が持つ位置の状態がそのまま props で渡る
vi.mock('../LocationSection', () => ({
  default: (props: Record<string, unknown>) => {
    locationProps.current = props
    return null
  },
}))
vi.mock('../WeatherSelector', () => ({ default: () => null }))
vi.mock('../PhotoUploadSection', () => ({ default: () => null }))
vi.mock('../AudioRecorder', () => ({ default: () => null }))

import PostForm from '../PostForm'

type Props = Partial<Parameters<typeof PostForm>[0]>

function renderForm(props: Props = {}) {
  return render(<PostForm onClose={() => {}} onSuccess={() => {}} onLoginClick={() => {}} {...props} />)
}

function submit(container: HTMLElement) {
  const form = container.querySelector('form')
  if (!form) throw new Error('form not found')
  fireEvent.submit(form)
}

beforeEach(() => {
  submitPostMock.mockReset().mockResolvedValue(true)
  saveOfflineMock.mockReset().mockResolvedValue(true)
  locationProps.current = null
  online.current = true
})

describe('PostForm の initialPosition（REQ-330）', () => {
  it('精度と取り方を渡さなければ、従来どおり手動の位置（精度なし）で始まり、そのまま送る', async () => {
    const { container } = renderForm({ initialPosition: { lat: 39.7, lng: 140.1 } })
    expect(locationProps.current).toMatchObject({ position: { lat: 39.7, lng: 140.1 }, accuracy: null, locationSource: 'manual' })

    submit(container)
    await waitFor(() => expect(submitPostMock).toHaveBeenCalledTimes(1))
    const [payload] = submitPostMock.mock.calls[0]!
    expect(payload).toMatchObject({ accuracy: null, locationSource: 'manual' })
    expect(payload.position).toEqual({ lat: 39.7, lng: 140.1 })
  })

  it('取り方 gps と精度を渡すと、その値で始まり、送るときも精度と gps を送る', async () => {
    const { container } = renderForm({ initialPosition: { lat: 39.71, lng: 140.12, accuracy: 18, source: 'gps' } })
    expect(locationProps.current).toMatchObject({ accuracy: 18, locationSource: 'gps' })

    submit(container)
    await waitFor(() => expect(submitPostMock).toHaveBeenCalledTimes(1))
    const [payload] = submitPostMock.mock.calls[0]!
    expect(payload).toMatchObject({ accuracy: 18, locationSource: 'gps' })
    // 位置の状態には lat / lng だけを持つ（下書きにも精度や取り方を混ぜない）
    expect(payload.position).toEqual({ lat: 39.71, lng: 140.12 })
  })

  it('取り方 map は手動の位置として扱い、精度は送らない', async () => {
    const { container } = renderForm({ initialPosition: { lat: 39.7, lng: 140.1, accuracy: 50, source: 'map' } })
    expect(locationProps.current).toMatchObject({ locationSource: 'manual' })

    submit(container)
    await waitFor(() => expect(submitPostMock).toHaveBeenCalledTimes(1))
    expect(submitPostMock.mock.calls[0]![0]).toMatchObject({ accuracy: null, locationSource: 'manual' })
  })

  it('調査依頼の位置があれば、そちらが優先し、initialPosition の精度・取り方は使わない', () => {
    renderForm({
      surveyRequest: { id: 'req-1', species: 'american', lat: 39.5, lng: 140.3, municipality: null, reason: null },
      initialPosition: { lat: 39.7, lng: 140.1, accuracy: 18, source: 'gps' },
    })
    expect(locationProps.current).toMatchObject({ position: { lat: 39.5, lng: 140.3 }, accuracy: null, locationSource: 'manual' })
  })
})

describe('PostForm の onCreated（REQ-330）', () => {
  it('通常の送信では onCreated を submitPost に渡す', async () => {
    const onCreated = vi.fn()
    const { container } = renderForm({ initialPosition: { lat: 39.7, lng: 140.1 }, onCreated })
    submit(container)
    await waitFor(() => expect(submitPostMock).toHaveBeenCalledTimes(1))
    expect(submitPostMock.mock.calls[0]![1]).toEqual({ onCreated })
  })

  it('C1🔴: 調査計画の地点から開いたフォームを圏外で保存すると、「地点から作った」印（地点 id）を付ける', async () => {
    online.current = false
    const { container } = renderForm({ initialPosition: { lat: 39.7, lng: 140.1, source: 'map' }, fieldworkStopId: 'stop-9' })
    submit(container)
    await waitFor(() => expect(saveOfflineMock).toHaveBeenCalledTimes(1))
    expect(saveOfflineMock.mock.calls[0]![1]).toEqual({ fieldworkStopId: 'stop-9' })
  })

  it('圏外では下書き保存になり、onCreated はどこにも渡らない', async () => {
    online.current = false
    const onCreated = vi.fn()
    const { container } = renderForm({ initialPosition: { lat: 39.7, lng: 140.1 }, onCreated })
    submit(container)
    await waitFor(() => expect(saveOfflineMock).toHaveBeenCalledTimes(1))
    expect(saveOfflineMock.mock.calls[0]).toHaveLength(1)
    expect(submitPostMock).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })
})

describe('PostForm の surveyMethod / lockedPrivateReason（REQ-330）', () => {
  it('渡さなければ従来どおり（調査方法は送らず、位置は公開で始まる）', async () => {
    const { container } = renderForm({ initialPosition: { lat: 39.7, lng: 140.1 } })
    submit(container)
    await waitFor(() => expect(submitPostMock).toHaveBeenCalledTimes(1))
    const [payload] = submitPostMock.mock.calls[0]!
    expect(payload).not.toHaveProperty('surveyMethod')
    expect(payload.locationPrivate).toBe(false)
  })

  it('調査計画の地点から開くと structured で送る', async () => {
    const { container } = renderForm({ initialPosition: { lat: 39.7, lng: 140.1, accuracy: 10, source: 'gps' }, surveyMethod: 'structured' })
    submit(container)
    await waitFor(() => expect(submitPostMock).toHaveBeenCalledTimes(1))
    expect(submitPostMock.mock.calls[0]![0]).toMatchObject({ surveyMethod: 'structured' })
  })

  it('非公開を固定すると、公開を選べず、理由を 1 行出し、必ず非公開で送る', async () => {
    const { container, getByTestId } = renderForm({
      initialPosition: { lat: 39.7, lng: 140.1 },
      lockedPrivateReason: 'この地点に希少種の記録があるため、位置は非公開に固定しています',
    })
    expect(getByTestId('postform-disclosure-private')).toHaveAttribute('aria-pressed', 'true')
    const publicButton = container.querySelector('[aria-pressed="false"]') as HTMLButtonElement
    expect(publicButton).toBeDisabled()
    fireEvent.click(publicButton)
    expect(getByTestId('postform-disclosure-locked')).toHaveTextContent('この地点に希少種の記録があるため')
    submit(container)
    await waitFor(() => expect(submitPostMock).toHaveBeenCalledTimes(1))
    expect(submitPostMock.mock.calls[0]![0]).toMatchObject({ locationPrivate: true })
  })
})
