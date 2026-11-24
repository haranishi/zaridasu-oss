import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

// REQ-330 点検 B4 / B5 と 2 周目の C2 / C3 / C8: ログアウト・退会で、端末に残した調査のデータを片付ける。
//   - ログアウト: 控えと下書きを消す。送っていない記録（調査の送信待ち・圏外の投稿の下書き）があれば確認を出す
//     （送ってから出る／破棄して出る／やめる）。確認を出している間の 2 回目の signOut は 1 回目を待つ
//   - ログアウトに失敗した（圏外でセッションが残った）ら false。破棄はログアウトできてから行う
//   - どの経路のログアウト（SIGNED_OUT）でも、前の人の控えと下書きを消す
//   - 退会: 希少種の写真を Storage API で消してから退会する。消せなければ止める（置き場が無いときだけ進める）。
//     写真を消したあとで退会に失敗したら、写真は削除済みと伝える

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
  rpc: vi.fn(),
  flushBeforeSignOut: vi.fn(),
  removeAllOwnRarePhotos: vi.fn(),
  removeAllOwnWaterPhotos: vi.fn(),
  deletePendingPostsOf: vi.fn(),
  getPendingCount: vi.fn(),
  authCallback: { current: null as null | ((event: string, session: unknown) => void) },
}))

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => m.getSession(...a),
      signOut: (...a: unknown[]) => m.signOut(...a),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        m.authCallback.current = cb
        return m.onAuthStateChange(cb)
      },
    },
    rpc: (...a: unknown[]) => m.rpc(...a),
  },
}))
vi.mock('@/lib/errorHandler', () => ({ logError: vi.fn() }))
vi.mock('@/features/fieldwork/data/flushBeforeSignOut', () => ({ flushBeforeSignOut: m.flushBeforeSignOut }))
vi.mock('@/features/fieldwork/data/rarePhotos', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/fieldwork/data/rarePhotos')>()),
  removeAllOwnRarePhotos: m.removeAllOwnRarePhotos,
}))
vi.mock('@/features/water/data/photos', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/water/data/photos')>()),
  removeAllOwnWaterPhotos: m.removeAllOwnWaterPhotos,
}))
vi.mock('@/lib/offlineStore', () => ({ deletePendingPostsOf: m.deletePendingPostsOf, getPendingCount: m.getPendingCount }))

import { AuthProvider, useAuth } from '../AuthContext'
// 確認ダイアログは AuthContext が lazy で読む。先に読み込んでおき、混んだ環境で読み込み待ちの時間切れにしない
import '@/features/fieldwork/components/SignOutUnsentDialog'
import '@/components/ui/SignOutFailedNotice'
import { ToastProvider } from '@/context/ToastContext'
import { RarePhotoPurgeError } from '@/features/fieldwork/data/rarePhotos'
import { WaterPhotoPurgeError } from '@/features/water/data/photos'
import { draftKey } from '@/hooks/posts/usePostDraft'
import { PRIVATE_SPOT_QUEUE_KEY, planCacheKey, queueStorageKey } from '@/features/fieldwork/lib/localData'

const A = '00000000-0000-0000-0000-00000000aaaa'
const user = { id: A, email: 'a@example.com', app_metadata: {}, email_confirmed_at: '2026-01-01' }
const LONG = { timeout: 5000 }

function Consumer() {
  const { user: u, signOut, deleteAccount } = useAuth()
  const [result, setResult] = useState('')
  const [second, setSecond] = useState('')
  return (
    <div>
      <span data-testid="user">{u?.id ?? 'null'}</span>
      <span data-testid="result">{result}</span>
      <span data-testid="second">{second}</span>
      <button type="button" data-testid="signout" onClick={() => void signOut().then((ok) => setResult(String(ok)))}>
        out
      </button>
      <button type="button" data-testid="signout-again" onClick={() => void signOut().then((ok) => setSecond(String(ok)))}>
        out again
      </button>
      <button
        type="button"
        data-testid="delete"
        onClick={() =>
          void deleteAccount().then(
            () => setResult('deleted'),
            (e: unknown) => setResult(`error:${(e as Error).message}`)
          )
        }
      >
        delete
      </button>
    </div>
  )
}

async function renderSignedIn() {
  render(
    <ToastProvider>
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    </ToastProvider>
  )
  await waitFor(() => expect(screen.getByTestId('user').textContent).toBe(A))
}

function seedLocalData(queued: number) {
  localStorage.setItem(planCacheKey(A), JSON.stringify({ savedAt: 'x', plans: [], currentPlanId: null, stops: [], links: [], rare: [{ id: 'r', stop_id: null, lat: 39.7, lng: 140.1 }] }))
  localStorage.setItem(draftKey(A), JSON.stringify({ position: { lat: 39.7, lng: 140.1 } }))
  if (queued > 0) {
    const items = Array.from({ length: queued }, (_, i) => ({ type: 'status', clientId: `c${i}`, userId: A, at: '', stopId: 's1', status: 'skipped' }))
    localStorage.setItem(queueStorageKey(A), JSON.stringify(items))
  }
}

/** 圏外で保存した非公開スポットの送信待ち（座標が入る）。全員の分が 1 つの配列に入る。 */
function seedSpots(forA: number, forB: number) {
  const make = (userId: string, i: number) => ({
    localId: `${userId}-${i}`, userId, name: `沼${i}`, note: null, lat: 39.7, lng: 140.1, accuracy: null, recordedAt: '2026-10-21T00:00:00Z',
  })
  const items = [
    ...Array.from({ length: forA }, (_, i) => make(A, i)),
    ...Array.from({ length: forB }, (_, i) => make('00000000-0000-0000-0000-00000000bbbb', i)),
  ]
  localStorage.setItem(PRIVATE_SPOT_QUEUE_KEY, JSON.stringify(items))
}
const spotsLeftFor = (userId: string): number =>
  (JSON.parse(localStorage.getItem(PRIVATE_SPOT_QUEUE_KEY) ?? '[]') as { userId: string }[]).filter((x) => x.userId === userId).length

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  m.getSession.mockResolvedValue({ data: { session: { user } } })
  m.signOut.mockResolvedValue({ error: null })
  m.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  m.rpc.mockResolvedValue({ error: null })
  m.removeAllOwnRarePhotos.mockResolvedValue(0)
  m.removeAllOwnWaterPhotos.mockResolvedValue(0)
  m.deletePendingPostsOf.mockResolvedValue(undefined)
  m.getPendingCount.mockResolvedValue(0)
})

describe('ログアウト（REQ-330 B4・C2・C8）', () => {
  it('送っていない記録が無ければ確認を出さずにログアウトし、計画の控えと下書きを消す', async () => {
    seedLocalData(0)
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('signout'))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('true'))
    expect(m.signOut).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('fieldwork-signout-dialog')).toBeNull()
    expect(localStorage.getItem(planCacheKey(A))).toBeNull()
    expect(localStorage.getItem(draftKey(A))).toBeNull()
  })

  it('送信待ちがあれば確認を出す。「やめる」ならログインしたまま（何も消さない）', async () => {
    seedLocalData(2)
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('signout'))
    expect(await screen.findByTestId('fieldwork-signout-dialog', {}, LONG)).toBeInTheDocument()
    expect(m.signOut).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('fieldwork-signout-cancel'))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('false'))
    expect(m.signOut).not.toHaveBeenCalled()
    expect(localStorage.getItem(queueStorageKey(A))).not.toBeNull()
    expect(localStorage.getItem(planCacheKey(A))).not.toBeNull()
  })

  it('C8: 圏外で保存した投稿の下書きだけでも確認を出し、件数を見せる。確認の並びは「左＝やめる・右＝破棄」', async () => {
    seedLocalData(0)
    m.getPendingCount.mockResolvedValue(2)
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('signout'))
    const counts = await screen.findByTestId('fieldwork-signout-counts', {}, LONG)
    expect(counts.querySelectorAll('li')).toHaveLength(1)
    expect(m.getPendingCount).toHaveBeenCalledWith(A)
    const cancel = screen.getByTestId('fieldwork-signout-cancel')
    const discard = screen.getByTestId('fieldwork-signout-discard')
    expect(cancel.compareDocumentPosition(discard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('「破棄してログアウト」: ログアウトできてから、送信待ちと圏外の投稿の下書きを消す', async () => {
    seedLocalData(2)
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('signout'))
    fireEvent.click(await screen.findByTestId('fieldwork-signout-discard', {}, LONG))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('true'))
    expect(m.signOut).toHaveBeenCalledTimes(1)
    expect(m.flushBeforeSignOut).not.toHaveBeenCalled()
    expect(m.signOut.mock.invocationCallOrder[0]!).toBeLessThan(m.deletePendingPostsOf.mock.invocationCallOrder[0]!)
    expect(m.deletePendingPostsOf).toHaveBeenCalledWith(A)
    expect(localStorage.getItem(queueStorageKey(A))).toBeNull()
    expect(localStorage.getItem(planCacheKey(A))).toBeNull()
  })

  it('非公開スポットの送信待ち（座標入り）だけでも確認を出す。破棄すると、その人の分だけ端末から消える', async () => {
    seedSpots(2, 1)
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('signout'))
    const counts = await screen.findByTestId('fieldwork-signout-counts', {}, LONG)
    expect(counts.querySelectorAll('li')).toHaveLength(1)
    fireEvent.click(screen.getByTestId('fieldwork-signout-discard'))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('true'))
    expect(spotsLeftFor(A)).toBe(0)
    // 同じ端末の、ほかの人の分は消さない
    expect(spotsLeftFor('00000000-0000-0000-0000-00000000bbbb')).toBe(1)
  })

  it('非公開スポットの送信待ちがあって「やめる」なら、何も消さない', async () => {
    seedSpots(1, 0)
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('signout'))
    fireEvent.click(await screen.findByTestId('fieldwork-signout-cancel', {}, LONG))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('false'))
    expect(spotsLeftFor(A)).toBe(1)
  })

  it('C2: 「破棄してログアウト」でログアウトに失敗したら（セッションが残った）、何も破棄せずに理由を出す', async () => {
    seedLocalData(2)
    m.signOut.mockResolvedValueOnce({ error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' } })
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('signout'))
    fireEvent.click(await screen.findByTestId('fieldwork-signout-discard', {}, LONG))
    expect(await screen.findByTestId('fieldwork-signout-problem', {}, LONG)).toHaveTextContent('auth.signOutFailed')
    expect(localStorage.getItem(queueStorageKey(A))).not.toBeNull()
    expect(localStorage.getItem(planCacheKey(A))).not.toBeNull()
    expect(m.deletePendingPostsOf).not.toHaveBeenCalled()
  })

  it('「送ってからログアウト」: 圏外・上限で残ったら理由を分けて出し、送り切れたらログアウトする', async () => {
    seedLocalData(1)
    m.flushBeforeSignOut
      .mockResolvedValueOnce({ left: 1, reason: 'offline' })
      .mockResolvedValueOnce({ left: 1, reason: 'failed' })
      .mockResolvedValueOnce({ left: 0, reason: null })
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('signout'))
    fireEvent.click(await screen.findByTestId('fieldwork-signout-send', {}, LONG))
    expect(await screen.findByTestId('fieldwork-signout-problem', {}, LONG)).toHaveTextContent('fieldwork.signOut.sendFailed')
    expect(m.flushBeforeSignOut).toHaveBeenCalledWith(A)
    expect(m.signOut).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('fieldwork-signout-send'))
    await waitFor(() => expect(screen.getByTestId('fieldwork-signout-problem')).toHaveTextContent('fieldwork.signOut.sendBlocked'))
    expect(m.signOut).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('fieldwork-signout-send'))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('true'))
    expect(m.signOut).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(planCacheKey(A))).toBeNull()
  })

  it('C2: 確認の要らないログアウトでも、失敗してセッションが残ったら false（控えも下書きも消さない）・理由を通知で 1 回だけ出す', async () => {
    seedLocalData(0)
    m.signOut.mockResolvedValueOnce({ error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' } })
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('signout'))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('false'))
    expect(await screen.findByText('auth.signOutFailed', {}, LONG)).toBeInTheDocument()
    expect(screen.getAllByText('auth.signOutFailed')).toHaveLength(1)
    expect(localStorage.getItem(planCacheKey(A))).not.toBeNull()
    expect(localStorage.getItem(draftKey(A))).not.toBeNull()
  })

  it('C2: 成功したログアウトでは失敗の通知を出さない', async () => {
    seedLocalData(0)
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('signout'))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('true'))
    expect(screen.queryByText('auth.signOutFailed')).toBeNull()
  })

  it('C2: error が返ってもセッションが消えていればログアウトできている（true）', async () => {
    seedLocalData(0)
    m.signOut.mockResolvedValueOnce({ error: { name: 'AuthApiError', message: 'session not found' } })
    await renderSignedIn()
    m.getSession.mockResolvedValue({ data: { session: null } })
    fireEvent.click(screen.getByTestId('signout'))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('true'))
    expect(localStorage.getItem(planCacheKey(A))).toBeNull()
  })

  it('C8: 確認を出している間の 2 回目の signOut は、確認を二重に出さず 1 回目の結果を待つ', async () => {
    seedLocalData(1)
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('signout'))
    await screen.findByTestId('fieldwork-signout-dialog', {}, LONG)
    fireEvent.click(screen.getByTestId('signout-again'))
    expect(screen.getAllByTestId('fieldwork-signout-dialog')).toHaveLength(1)
    fireEvent.click(screen.getByTestId('fieldwork-signout-cancel'))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('false'))
    await waitFor(() => expect(screen.getByTestId('second').textContent).toBe('false'))
  })

  it('どの経路のログアウト（SIGNED_OUT）でも、前の人の控えと下書きを消す（送信待ちは残す）', async () => {
    seedLocalData(1)
    await renderSignedIn()
    act(() => {
      m.authCallback.current?.('SIGNED_OUT', null)
    })
    expect(screen.getByTestId('user').textContent).toBe('null')
    expect(localStorage.getItem(planCacheKey(A))).toBeNull()
    expect(localStorage.getItem(draftKey(A))).toBeNull()
    expect(localStorage.getItem(queueStorageKey(A))).not.toBeNull()
  })
})

describe('退会（REQ-330 B4 / B5・C3）', () => {
  it('希少種の写真を消してから退会し、端末のその人のものを全部消す', async () => {
    seedLocalData(2)
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('delete'))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('deleted'))
    expect(m.removeAllOwnRarePhotos).toHaveBeenCalledWith(expect.anything(), A)
    expect(m.removeAllOwnRarePhotos.mock.invocationCallOrder[0]!).toBeLessThan(m.rpc.mock.invocationCallOrder[0]!)
    expect(m.removeAllOwnWaterPhotos).toHaveBeenCalledWith(expect.anything(), A)
    expect(m.removeAllOwnWaterPhotos.mock.invocationCallOrder[0]!).toBeLessThan(m.rpc.mock.invocationCallOrder[0]!)
    expect(m.rpc).toHaveBeenCalledWith('delete_own_account')
    expect(localStorage.getItem(queueStorageKey(A))).toBeNull()
    expect(localStorage.getItem(planCacheKey(A))).toBeNull()
    expect(localStorage.getItem(draftKey(A))).toBeNull()
    expect(m.deletePendingPostsOf).toHaveBeenCalledWith(A)
    expect(m.signOut).toHaveBeenCalled()
  })

  it('退会すると、その人の非公開スポットの送信待ち（座標入り）も端末から消える。ほかの人の分は残す', async () => {
    seedSpots(2, 1)
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('delete'))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('deleted'))
    expect(spotsLeftFor(A)).toBe(0)
    expect(spotsLeftFor('00000000-0000-0000-0000-00000000bbbb')).toBe(1)
  })

  it('写真を消す途中で通信が切れたら退会しない（写真だけが残らないように）', async () => {
    m.removeAllOwnRarePhotos.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('delete'))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('error:account.deletePhotosFailed'))
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('C3: 権限で 0 件しか消えない・回数の上限は、退会を止める', async () => {
    for (const kind of ['denied', 'tooMany'] as const) {
      m.rpc.mockClear()
      m.removeAllOwnRarePhotos.mockRejectedValueOnce(new RarePhotoPurgeError(kind))
      const { unmount } = render(
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      )
      await waitFor(() => expect(screen.getByTestId('user').textContent).toBe(A))
      fireEvent.click(screen.getByTestId('delete'))
      await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('error:account.deletePhotosFailed'))
      expect(m.rpc).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('C3: 写真の置き場そのものが無い環境（消す写真も無い）だけは、記録して退会を進める', async () => {
    m.removeAllOwnRarePhotos.mockRejectedValueOnce({ statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' })
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('delete'))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('deleted'))
    expect(m.rpc).toHaveBeenCalledWith('delete_own_account')
  })

  it('C3: 写真を消したあとで退会に失敗したら、写真は削除済みと伝える（端末のものは消さない）', async () => {
    seedLocalData(1)
    m.rpc.mockResolvedValueOnce({ error: { message: 'rpc failed' } })
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('delete'))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('error:account.deleteFailedPhotosRemoved'))
    expect(localStorage.getItem(queueStorageKey(A))).not.toBeNull()
  })

  it.each([
    new TypeError('Failed to fetch'),
    new WaterPhotoPurgeError('denied'),
    new WaterPhotoPurgeError('tooMany'),
  ])('水域写真の削除が完了しなければ退会RPCを呼ばない: %s', async (error) => {
    m.removeAllOwnWaterPhotos.mockRejectedValueOnce(error)
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('delete'))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('error:account.deletePhotosFailed'))
    expect(m.rpc).not.toHaveBeenCalled()
    expect(m.signOut).not.toHaveBeenCalled()
  })

  it('水域写真のバケットが未導入の環境だけは退会を続ける', async () => {
    m.removeAllOwnWaterPhotos.mockRejectedValueOnce({ message: 'Bucket not found', statusCode: '404' })
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('delete'))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('deleted'))
    expect(m.rpc).toHaveBeenCalledWith('delete_own_account')
  })

  it('写真削除中に別のアカウントへ変わったら、そのアカウントの退会を行わない', async () => {
    let finish!: (count: number) => void
    m.removeAllOwnWaterPhotos.mockImplementationOnce(() => new Promise<number>((resolve) => { finish = resolve }))
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('delete'))
    await waitFor(() => expect(m.removeAllOwnWaterPhotos).toHaveBeenCalledTimes(1))
    act(() => m.authCallback.current?.('SIGNED_IN', { user: { ...user, id: '00000000-0000-0000-0000-00000000bbbb' } }))
    await act(async () => finish(1))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('error:account.deletePhotosFailed'))
    expect(m.rpc).not.toHaveBeenCalled()
    expect(m.signOut).not.toHaveBeenCalled()
  })

  it('退会RPCの返答を待つ間にアカウントが変わっても、新しい人をログアウトさせない', async () => {
    let finish!: (response: { error: null }) => void
    m.rpc.mockImplementationOnce(() => new Promise<{ error: null }>((resolve) => { finish = resolve }))
    await renderSignedIn()
    fireEvent.click(screen.getByTestId('delete'))
    await waitFor(() => expect(m.rpc).toHaveBeenCalledTimes(1))
    act(() => m.authCallback.current?.('SIGNED_IN', { user: { ...user, id: '00000000-0000-0000-0000-00000000bbbb' } }))
    await act(async () => finish({ error: null }))
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('deleted'))
    expect(m.signOut).not.toHaveBeenCalled()
    expect(screen.getByTestId('user')).toHaveTextContent('00000000-0000-0000-0000-00000000bbbb')
  })
})
