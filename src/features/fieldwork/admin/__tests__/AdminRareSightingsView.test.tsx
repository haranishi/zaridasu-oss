import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ selectForAdmin: vi.fn(), createUrls: vi.fn() }))

vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))
vi.mock('@/lib/errorHandler', () => ({ logError: vi.fn() }))
vi.mock('../../data/rareSightings', () => ({ selectRareSightingsForAdmin: m.selectForAdmin }))
vi.mock('../../data/rarePhotos', () => ({ createRarePhotoUrls: m.createUrls }))

import AdminRareSightingsView from '../AdminRareSightingsView'
import { renderJa } from '../../components/__tests__/withI18n'

// REQ-330 §3 運営の画面: 一覧・写真は署名 URL の小さな画像・CSV は csvCell・「取り扱い注意：外部に出さない」。

const row = {
  id: 'r1',
  user_id: '12345678-aaaa-bbbb-cccc-1234567890ab',
  client_id: 'c1',
  stop_id: 's1',
  species_key: 'other',
  species_label: '=HYPERLINK("https://evil.example")',
  count: 4,
  note: '岸の近く',
  lat: 39.70111,
  lng: 140.10222,
  accuracy: 9,
  location_source: 'gps',
  observed_at: '2026-10-01T01:00:00Z',
  photo_paths: ['12345678-aaaa-bbbb-cccc-1234567890ab/p1.jpg'],
  created_at: '2026-10-01T01:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  m.selectForAdmin.mockResolvedValue({ data: [row], error: null })
  m.createUrls.mockResolvedValue([{ path: row.photo_paths[0], url: 'https://x.supabase.co/storage/v1/object/sign/rare-photos/p1.jpg?token=t' }])
})

describe('AdminRareSightingsView (REQ-330)', () => {
  it('取り扱い注意・種・数・短縮した利用者 ID・署名 URL の写真を出す（メールは出さない）', async () => {
    renderJa(<AdminRareSightingsView />)
    expect(await screen.findByText(/その他（=HYPERLINK/)).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('取り扱い注意：外部に出さない')
    expect(screen.getByText('12345678')).toBeInTheDocument()
    expect(screen.queryByText(row.user_id)).toBeNull()
    expect(screen.getByText('4個体')).toBeInTheDocument()
    const img = await screen.findByRole('img', { name: '写真 1' })
    expect(img).toHaveAttribute('src', expect.stringContaining('/object/sign/rare-photos/'))
    expect(m.createUrls).toHaveBeenCalledWith({}, row.photo_paths)
  })

  it('CSV は数式の差し込みを無害化して書き出す', async () => {
    const createObjectURL = vi.fn(() => 'blob:x')
    globalThis.URL.createObjectURL = createObjectURL
    globalThis.URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderJa(<AdminRareSightingsView />)
    await screen.findByText(/その他（=HYPERLINK/)
    fireEvent.click(screen.getByRole('button', { name: 'CSV を書き出す' }))
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled())
    const text = await (createObjectURL.mock.calls as unknown as [Blob][])[0]![0].text()
    expect(text).toContain('id,observed_at,species_key,species_label,count,note,lat,lng,accuracy_m,location_source,stop_id,photo_count,user_id,created_at')
    expect(text).toContain(`"'=HYPERLINK(""https://evil.example"")"`)
    click.mockRestore()
  })

  it('読み込みに失敗したら再試行を出す', async () => {
    m.selectForAdmin.mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    renderJa(<AdminRareSightingsView />)
    expect(await screen.findByRole('alert')).toHaveTextContent('読み込めませんでした')
  })
})
