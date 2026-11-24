import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import RareSightingSheet from '../RareSightingSheet'
import type { RecordPosition } from '../../lib/positionRule'
import { renderJa } from './withI18n'

// REQ-330 §3 希少種シート（本物の i18next で描画）。「あなたと運営だけ」の一言・その他の名前・
// 圏外では写真を選べない・client_id は保存し直しても同じ。

const atStop: RecordPosition = { source: 'gps', lat: 39.7201, lng: 140.1, accuracy: 11, distanceM: 12 }

function renderSheet(props: Partial<Parameters<typeof RareSightingSheet>[0]> = {}) {
  const onSave = props.onSave ?? vi.fn().mockResolvedValue({ status: 'saved', duplicate: false, sighting: {} })
  const onClose = vi.fn()
  renderJa(
    <RareSightingSheet
      stop={null}
      showRare={false}
      anchor={{ lat: 39.72, lng: 140.1 }}
      initialPosition={atStop}
      mapCenter={{ lat: 39.5, lng: 140.5 }}
      online
      onSave={onSave}
      onClose={onClose}
      errorText={(err) => `ERR:${String((err as { code?: string })?.code ?? err)}`}
      {...props}
    />
  )
  return { onSave, onClose }
}

beforeEach(() => vi.clearAllMocks())

describe('RareSightingSheet (REQ-330)', () => {
  it('保存ボタンの上に「あなたと運営だけ」を毎回書き、保存ボタンは「希少種を記録する（非公開）」', () => {
    renderSheet()
    const note = screen.getByText('この記録は、あなたと運営だけが見られます。ほかの人の地図・一覧・公開データには出ません。')
    const submit = screen.getByTestId('fieldwork-rare-submit')
    expect(note.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(submit).toHaveTextContent('希少種を記録する（非公開）')
    expect(screen.getByTestId('fieldwork-position')).toHaveTextContent('記録の位置：現在地（誤差 約11m）')
    // 数の欄には単位「個体」
    expect(screen.getByText('個体')).toBeInTheDocument()
  })

  it('選んだ種のボタンは押した状態（✓）になる', () => {
    renderSheet()
    const medaka = screen.getByRole('button', { name: 'メダカ' })
    expect(medaka).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(medaka)
    expect(medaka).toHaveAttribute('aria-pressed', 'true')
  })

  it('種は一覧のボタンから選ぶ。「その他」のときだけ名前の欄が出て、空なら保存しない', async () => {
    const { onSave } = renderSheet()
    expect(screen.queryByLabelText(/種の名前/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'その他' }))
    expect(screen.getByLabelText(/種の名前/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('fieldwork-rare-submit'))
    expect(await screen.findByRole('alert')).toHaveTextContent('種の名前を入れてください')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('選んだ種・数・観察日時・位置を渡して保存し、閉じる', async () => {
    const { onSave, onClose } = renderSheet({ stop: null })
    fireEvent.click(screen.getByRole('button', { name: 'メダカ' }))
    fireEvent.change(screen.getByLabelText('数（任意）'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('観察日時'), { target: { value: '2026-10-01T09:30' } })
    fireEvent.click(screen.getByTestId('fieldwork-rare-submit'))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const arg = (onSave as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(arg).toMatchObject({
      speciesKey: 'medaka',
      speciesLabel: null,
      count: 12,
      stopId: null,
      position: { lat: 39.7201, lng: 140.1, accuracy: 11, source: 'gps' },
      observedAt: new Date('2026-10-01T09:30').toISOString(),
      photos: [],
    })
    expect(arg.clientId).toMatch(/^[0-9a-f-]{36}$/)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('圏外では写真を選べず、理由を出す（写真なしで保存できる）', () => {
    renderSheet({ online: false })
    expect(screen.queryByTestId('fieldwork-rare-photos')).toBeNull()
    expect(screen.getByTestId('fieldwork-rare-photos-offline')).toHaveTextContent('圏外では写真を付けられません。写真なしで保存できます')
  })

  it('保存に失敗しても閉じず、保存し直すときは同じ client_id を使う', async () => {
    const onSave = vi.fn().mockRejectedValueOnce({ code: 'P0001' }).mockResolvedValueOnce({ status: 'queued' })
    renderSheet({ onSave })
    fireEvent.click(screen.getByRole('button', { name: 'タガメ' }))
    fireEvent.click(screen.getByTestId('fieldwork-rare-submit'))
    expect(await screen.findByRole('alert')).toHaveTextContent('ERR:P0001')
    fireEvent.click(screen.getByTestId('fieldwork-rare-submit'))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    expect(onSave.mock.calls[0]![0].clientId).toBe(onSave.mock.calls[1]![0].clientId)
  })

  it('計画の外で現在地が取れなければ、地図の中心を使える', async () => {
    Object.defineProperty(window.navigator, 'geolocation', {
      value: { getCurrentPosition: (_ok: unknown, ng: (e: unknown) => void) => ng({ code: 1 }) },
      configurable: true,
    })
    renderSheet({ anchor: null, initialPosition: null })
    expect(await screen.findByText('現在地を取得できませんでした')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '地図の中心を使う' }))
    expect(screen.getByText('記録の位置：地図の中心')).toBeInTheDocument()
  })
})
