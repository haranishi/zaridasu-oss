import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import ManualLocationInput from '../ManualLocationInput'

const translations = vi.hoisted(() => ({
  'postForm.manualLocation': '地図を使わずに位置を入力',
  'postForm.manualLocationHint': '緯度と経度を直接入力してください。',
  'postForm.latitude': '緯度',
  'postForm.longitude': '経度',
  'postForm.coordinateRangeError': '緯度と経度の範囲を確認してください。',
  'postForm.useCurrentLocation': '現在地を使う',
  'postForm.locating': '現在地を取得中…',
  'postForm.geoPermissionDenied': '位置情報の許可が必要です。',
  'postForm.geoTimeout': '位置情報の取得がタイムアウトしました。',
  'postForm.geoUnavailable': '位置情報を取得できません。',
  'postForm.geoDefault': '位置情報を取得できません。',
  'postForm.geoUnsupported': '位置情報の取得に対応していません。',
  'postForm.geolocationRetryHint': 'もう一度押すか、緯度・経度を入力してください。',
  'postForm.outsideTargetArea': '対象エリア（秋田県）外の位置が選択されています。',
  'postForm.locationSelected': '{{lat}}, {{lng}}',
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: keyof typeof translations, params?: Record<string, string>) => {
      const value = translations[key] ?? key
      if (!params) return value
      return Object.entries(params).reduce(
        (result, [name, replacement]) =>
          result.replace(`{{${name}}}`, String(replacement)),
        value,
      )
    },
  }),
}))

const getCurrentPosition = vi.fn()

function setGeolocation(value: Geolocation | undefined) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value,
  })
}

function renderInput(position: { lat: number; lng: number } | null = null) {
  const onManualPosition = vi.fn()
  const onGpsPosition = vi.fn()
  const result = render(
    <ManualLocationInput
      position={position}
      onManualPosition={onManualPosition}
      onGpsPosition={onGpsPosition}
      idPrefix="test-location"
      dark={false}
    />,
  )
  return { ...result, onManualPosition, onGpsPosition }
}

beforeEach(() => {
  getCurrentPosition.mockReset()
  setGeolocation({ getCurrentPosition } as unknown as Geolocation)
})

afterEach(() => {
  setGeolocation(undefined)
})

describe('ManualLocationInput', () => {
  it('label の htmlFor と input の id が関連付いている', () => {
    renderInput()

    expect(screen.getByLabelText('緯度')).toHaveAttribute('id', 'test-location-latitude')
    expect(screen.getByLabelText('経度')).toHaveAttribute('id', 'test-location-longitude')
  })

  it('緯度・経度を入力すると有限数値を手動位置として渡す', async () => {
    const user = userEvent.setup()
    const { onManualPosition } = renderInput()

    await user.type(screen.getByLabelText('緯度'), '39.7186')
    await user.type(screen.getByLabelText('経度'), '140.1023')

    expect(onManualPosition).toHaveBeenLastCalledWith({ lat: 39.7186, lng: 140.1023 })
  })

  it('空文字・途中入力・範囲外の値から NaN を渡さない', () => {
    const { onManualPosition } = renderInput()
    const latitude = screen.getByLabelText('緯度')
    const longitude = screen.getByLabelText('経度')

    fireEvent.change(latitude, { target: { value: '' } })
    fireEvent.change(latitude, { target: { value: '-' } })
    fireEvent.change(latitude, { target: { value: '39.' } })
    fireEvent.change(longitude, { target: { value: '140' } })
    fireEvent.change(latitude, { target: { value: '91' } })

    expect(onManualPosition).toHaveBeenCalled()
    for (const call of onManualPosition.mock.calls) {
      if (call[0] !== null) {
        expect(Number.isFinite(call[0]?.lat)).toBe(true)
        expect(Number.isFinite(call[0]?.lng)).toBe(true)
      }
    }
  })

  it('現在地取得に成功すると GPS 座標と精度を渡す', async () => {
    const user = userEvent.setup()
    const { onGpsPosition } = renderInput()
    getCurrentPosition.mockImplementation((success: PositionCallback) => {
      success({
        coords: { latitude: 39.72, longitude: 140.1, accuracy: 12 },
      } as GeolocationPosition)
    })

    await user.click(screen.getByRole('button', { name: '現在地を使う' }))

    expect(onGpsPosition).toHaveBeenCalledWith({ lat: 39.72, lng: 140.1 }, 12)
  })

  it.each([
    [1, '位置情報の許可が必要です。'],
    [3, '位置情報の取得がタイムアウトしました。'],
    [2, '位置情報を取得できません。'],
  ])('現在地取得エラー code=%i の理由と再試行方法を表示する', async (code, message) => {
    const user = userEvent.setup()
    renderInput()
    getCurrentPosition.mockImplementation(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code } as GeolocationPositionError)
      },
    )

    await user.click(screen.getByRole('button', { name: '現在地を使う' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('alert')).toHaveTextContent('もう一度押す')
    expect(screen.getByRole('button', { name: '現在地を使う' })).toBeEnabled()
  })

  it('Geolocation 未対応の理由と再試行方法を表示する', async () => {
    const user = userEvent.setup()
    setGeolocation(undefined)
    renderInput()

    await user.click(screen.getByRole('button', { name: '現在地を使う' }))

    expect(screen.getByRole('alert')).toHaveTextContent('位置情報の取得に対応していません。')
    expect(screen.getByRole('alert')).toHaveTextContent('もう一度押す')
  })

  it('秋田県外の現在地も破棄せず反映し、ソフト警告を表示する', async () => {
    const user = userEvent.setup()
    const { onGpsPosition } = renderInput()
    getCurrentPosition.mockImplementation((success: PositionCallback) => {
      success({
        coords: { latitude: 35.6812, longitude: 139.7671, accuracy: 20 },
      } as GeolocationPosition)
    })

    await user.click(screen.getByRole('button', { name: '現在地を使う' }))

    expect(onGpsPosition).toHaveBeenCalledWith(
      { lat: 35.6812, lng: 139.7671 },
      20,
    )
    expect(screen.getByText(/対象エリア（秋田県）外/)).toBeInTheDocument()
  })

  it('Tab とキーボード入力だけで緯度・経度・現在地ボタンを操作できる', async () => {
    const user = userEvent.setup()
    const { onManualPosition, onGpsPosition } = renderInput()
    getCurrentPosition.mockImplementation((success: PositionCallback) => {
      success({
        coords: { latitude: 39.7, longitude: 140.1, accuracy: 8 },
      } as GeolocationPosition)
    })

    await user.tab()
    expect(screen.getByLabelText('緯度')).toHaveFocus()
    await user.type(screen.getByLabelText('緯度'), '39.7186')
    await user.tab()
    expect(screen.getByLabelText('経度')).toHaveFocus()
    await user.type(screen.getByLabelText('経度'), '140.1023')
    expect(onManualPosition).toHaveBeenLastCalledWith({ lat: 39.7186, lng: 140.1023 })

    await user.tab()
    expect(screen.getByRole('button', { name: '現在地を使う' })).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(onGpsPosition).toHaveBeenCalledWith({ lat: 39.7, lng: 140.1 }, 8)
    })
  })

  // 地図クリック・GPS・EXIF から入る座標は小数6桁以上ある。step に刻み幅を決め打ちすると
  // 実ブラウザが stepMismatch と判定し、「有効な値として最も近いのは 35.70413 と 35.70414 です」
  // の検証バブルを出して**送信そのもの**を止める（step="0.00001" 時代の不具合）。
  // jsdom は stepMismatch を計算せず刻み幅違反でも false を返すため、validity を見るテストは
  // 壊れたコードでも通ってしまう。実ブラウザが弾く条件そのもの＝ step 属性を契約として固定する。
  it('緯度・経度の step は any で、刻み幅による送信ブロックを作らない', () => {
    renderInput()

    expect(screen.getByLabelText('緯度')).toHaveAttribute('step', 'any')
    expect(screen.getByLabelText('経度')).toHaveAttribute('step', 'any')
  })

  it('小数6桁以上の座標を丸めずそのまま入力欄に表示する', () => {
    renderInput({ lat: 35.704133186340336, lng: 139.76712226867676 })

    expect(screen.getByLabelText('緯度')).toHaveValue(35.704133186340336)
    expect(screen.getByLabelText('経度')).toHaveValue(139.76712226867676)
  })

  it('axe の critical を含むアクセシビリティ違反がない', async () => {
    const { container } = renderInput()
    expect(await axe(container)).toHaveNoViolations()
  })
})
