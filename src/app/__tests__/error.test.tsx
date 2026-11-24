import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const logError = vi.fn()
vi.mock('@/lib/errorHandler', () => ({
  logError: (...args: unknown[]) => logError(...args),
}))

const reloadMock = vi.fn()

beforeEach(() => {
  logError.mockReset()
  reloadMock.mockReset()
  sessionStorage.clear()
  Object.defineProperty(window, 'location', {
    value: { reload: reloadMock },
    writable: true,
  })
  Object.defineProperty(window, 'caches', {
    value: { keys: async () => [], delete: async () => true },
    configurable: true,
  })
})

async function renderError(error: Error & { digest?: string }) {
  const { default: GlobalError } = await import('../error')
  return render(<GlobalError error={error} reset={vi.fn()} />)
}

describe('app/error.tsx', () => {
  it('error.message の文字列を DOM に露出しない（情報漏洩防止）', async () => {
    const SECRET = 'SECRET_DB_URL=postgres://user:pass@host'
    const { container } = await renderError(Object.assign(new Error(SECRET), { digest: 'd1' }))
    expect(container.textContent).not.toContain(SECRET)
    expect(screen.queryByText(new RegExp(SECRET))).toBeNull()
  })

  it('日本語文言（エラーが発生しました／再試行／ホームに戻る）が表示される', async () => {
    await renderError(new Error('boom'))
    expect(screen.getByRole('heading', { name: 'エラーが発生しました' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ホームに戻る' })).toBeInTheDocument()
  })

  it('error.digest がある場合はエラーIDとして表示する', async () => {
    await renderError(Object.assign(new Error('x'), { digest: 'abc123' }))
    expect(screen.getByText(/エラーID: abc123/)).toBeInTheDocument()
  })

  it('chunk load error でも一度リロード試行済みなら再リロードしない（無限ループ防止）', async () => {
    sessionStorage.setItem('chunk-reload-attempted', '1')
    await renderError(Object.assign(new Error('ChunkLoadError: Loading chunk 123 failed'), { digest: 'c1' }))
    // useEffect は同期 render 後に flush 済み
    expect(reloadMock).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('chunk-reload-attempted')).toBeNull()
  })

  it('logError が context="app/error" で呼ばれる', async () => {
    const err = new Error('boom')
    await renderError(err)
    expect(logError).toHaveBeenCalledWith(err, 'app/error')
  })
})
