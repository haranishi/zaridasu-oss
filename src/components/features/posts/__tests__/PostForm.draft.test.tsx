import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

// REQ-330 点検 B2: 投稿フォームの下書き（端末の自動保存）に、希少種の地点の座標や「非公開の固定」を残さない。
//   - 地点から開いたフォーム（initialPosition か lockedPrivateReason があるとき）は下書きを読まず書かない
//   - 下書きの保存先は利用者ごとに分ける（前の人の下書きを次の人に出さない）
// ここでは usePostDraft をモックせず、本物で localStorage に何が残るかを見る（PostForm.initialPosition.test はモックしている）。

const { user } = vi.hoisted(() => ({ user: { current: { id: 'user-1' } as { id: string } | null } }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ja' } }),
}))
vi.mock('next/image', () => ({ default: () => null }))
vi.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ dark: false }) }))
vi.mock('@/context/ToastContext', () => ({ useToastContext: () => ({ success: vi.fn(), error: vi.fn() }) }))
vi.mock('@/hooks/useEscapeKey', () => ({ useEscapeKey: () => {} }))
vi.mock('@/hooks/useBodyScrollLock', () => ({ useBodyScrollLock: () => {} }))
vi.mock('@/hooks/useFocusTrap', () => ({ useFocusTrap: () => {} }))
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }))
vi.mock('@/hooks/useReverseGeocode', () => ({
  useReverseGeocode: () => ({ municipality: '', prefecture: '', geocoding: false, geocodeError: '', retry: () => {} }),
}))
vi.mock('@/hooks/useWeather', () => ({ useWeather: () => ({ weatherData: null, fetching: false, weatherError: false }) }))
vi.mock('@/hooks/posts/usePostForm', () => ({
  usePostForm: () => ({
    currentUser: user.current,
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
    submitPost: vi.fn().mockResolvedValue(true),
    saveOffline: vi.fn().mockResolvedValue(true),
  }),
}))
vi.mock('../LocationSection', () => ({ default: () => null }))
vi.mock('../WeatherSelector', () => ({ default: () => null }))
vi.mock('../PhotoUploadSection', () => ({ default: () => null }))
vi.mock('../AudioRecorder', () => ({ default: () => null }))

import PostForm from '../PostForm'
import { clearDraftsOnSignOut, draftKey, loadDraft } from '@/hooks/posts/usePostDraft'

type Props = Partial<Parameters<typeof PostForm>[0]>

function renderForm(props: Props = {}) {
  return render(<PostForm onClose={() => {}} onSuccess={() => {}} onLoginClick={() => {}} {...props} />)
}

/** 下書きの自動保存（500ms のデバウンス）を進める */
function flushDraftTimer() {
  act(() => {
    vi.advanceTimersByTime(1000)
  })
}

function comment() {
  return document.querySelector('textarea') as HTMLTextAreaElement
}

beforeEach(() => {
  localStorage.clear()
  user.current = { id: 'user-1' }
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PostForm の下書き（REQ-330 B2）', () => {
  it('地点から開いたフォームは、入力しても端末に何も残さない（位置も非公開の固定も）', () => {
    renderForm({ initialPosition: { lat: 39.7123, lng: 140.1234, source: 'map' } })
    fireEvent.change(comment(), { target: { value: '池の北側' } })
    flushDraftTimer()
    expect(localStorage.length).toBe(0)
    expect(JSON.stringify({ ...localStorage })).not.toContain('39.7123')
  })

  it('非公開を固定したフォームも、端末に何も残さない', () => {
    renderForm({ initialPosition: { lat: 39.7123, lng: 140.1234, source: 'gps', accuracy: 9 }, lockedPrivateReason: 'この地点の記録は、位置を非公開にします' })
    fireEvent.change(comment(), { target: { value: 'メモ' } })
    flushDraftTimer()
    expect(localStorage.length).toBe(0)
  })

  it('地点から開いたフォームは、前に保存された下書き（別の場所の位置）を読み込まない', () => {
    localStorage.setItem(draftKey('user-1'), JSON.stringify({ position: { lat: 39.9, lng: 140.9 }, comment: '前の下書き' }))
    renderForm({ initialPosition: { lat: 39.7, lng: 140.1, source: 'map' } })
    expect(screen.queryByText('postForm.draftRestored')).toBeNull()
    expect(comment().value).toBe('')
    // 前の下書きは消さずに残す（ふつうの投稿で使える）
    expect(localStorage.getItem(draftKey('user-1'))).toContain('前の下書き')
  })

  it('ふつうのフォームは、利用者ごとの保存先に書く（共有の古いキーには書かない）', () => {
    renderForm()
    fireEvent.change(comment(), { target: { value: 'ふつうの投稿' } })
    flushDraftTimer()
    expect(localStorage.getItem(draftKey('user-1'))).toContain('ふつうの投稿')
    expect(localStorage.getItem('zaridasu_draft_post')).toBeNull()
  })

  it('別の利用者の下書きは読まない。持ち主の分からない古い共有のキーは読まずに消す', () => {
    localStorage.setItem(draftKey('user-2'), JSON.stringify({ comment: '別の人の下書き' }))
    localStorage.setItem('zaridasu_draft_post', JSON.stringify({ comment: '古い共有の下書き', position: { lat: 39.8, lng: 140.2 } }))
    renderForm()
    expect(screen.queryByText('postForm.draftRestored')).toBeNull()
    expect(comment().value).toBe('')
    expect(localStorage.getItem('zaridasu_draft_post')).toBeNull()
    expect(localStorage.getItem(draftKey('user-2'))).toContain('別の人の下書き')
  })

  it('自分の下書きは復元する', () => {
    localStorage.setItem(draftKey('user-1'), JSON.stringify({ comment: '自分の下書き' }))
    renderForm()
    expect(screen.getByText('postForm.draftRestored')).toBeInTheDocument()
    expect(comment().value).toBe('自分の下書き')
  })
})

describe('別のタブで利用者が替わったとき（2 周目の点検 C4）', () => {
  it('下書きの持ち主はフォームを開いた時点で固定し、替わったあとの入力は誰のキーにも書かない', () => {
    const { rerender } = renderForm()
    fireEvent.change(comment(), { target: { value: 'A の入力' } })
    flushDraftTimer()
    expect(localStorage.getItem(draftKey('user-1'))).toContain('A の入力')

    // 別のタブで A がログアウトし、B がログインした（このタブのフォームは開いたまま）
    user.current = { id: 'user-2' }
    rerender(<PostForm onClose={() => {}} onSuccess={() => {}} onLoginClick={() => {}} />)
    fireEvent.change(comment(), { target: { value: 'A の入力の続き' } })
    flushDraftTimer()
    expect(localStorage.getItem(draftKey('user-2'))).toBeNull()
    expect(localStorage.getItem(draftKey(null))).toBeNull()
    expect(localStorage.getItem(draftKey('user-1'))).toContain('A の入力')
    expect(localStorage.getItem(draftKey('user-1'))).not.toContain('続き')
  })
})

describe('usePostDraft のログアウト時の片付け', () => {
  it('その人の下書き・未ログインの下書き・古い共有のキーを消し、別の人の分は残す', () => {
    localStorage.setItem(draftKey('user-1'), '{"comment":"a"}')
    localStorage.setItem(draftKey(null), '{"comment":"anon"}')
    localStorage.setItem(draftKey('user-2'), '{"comment":"b"}')
    localStorage.setItem('zaridasu_draft_post', '{"comment":"legacy"}')
    clearDraftsOnSignOut('user-1')
    expect(loadDraft('user-1')).toBeNull()
    expect(loadDraft(null)).toBeNull()
    expect(localStorage.getItem('zaridasu_draft_post')).toBeNull()
    expect(loadDraft('user-2')).toEqual({ comment: 'b' })
  })
})
