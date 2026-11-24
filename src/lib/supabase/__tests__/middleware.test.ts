import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { SetAllCookies } from '@supabase/ssr'

// Supabase SSR クライアントを完全に差し替える
const getUserMock = vi.fn()
const getSessionMock = vi.fn()
const createServerClientMock = vi.fn((...args: unknown[]) => {
  void args
  return ({
  auth: {
    getUser: (...args: unknown[]) => getUserMock(...args),
    getSession: (...args: unknown[]) => getSessionMock(...args),
  },
  })
})

vi.mock('@supabase/ssr', async importOriginal => ({
  ...await importOriginal<typeof import('@supabase/ssr')>(),
  createServerClient: (...args: unknown[]) => createServerClientMock(...(args as [])),
}))

// REQ-137: logError が catch ブロックで呼ばれることを assert する
const logErrorMock = vi.fn()
vi.mock('@/lib/errorHandler', () => ({
  logError: (...args: unknown[]) => logErrorMock(...(args as [])),
}))

import { updateSession } from '../middleware'

function request(url: string) {
  return new NextRequest(new URL(url))
}

beforeEach(() => {
  getUserMock.mockReset()
  getSessionMock.mockReset()
  logErrorMock.mockReset()
  createServerClientMock.mockReset()
  createServerClientMock.mockImplementation(() => ({
    auth: {
      getUser: (...args: unknown[]) => getUserMock(...(args as [])),
      getSession: (...args: unknown[]) => getSessionMock(...(args as [])),
    },
  }))
})

describe('updateSession', () => {
  it('/admin/posts に未認証で到達したら /admin/login へリダイレクトする（クエリ無し）', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await updateSession(request('http://localhost/admin/posts'))
    expect(res.status).toBe(307)
    // e2e の末尾一致 /\/admin\/login$/ を壊さないよう、リダイレクト先は素の path（クエリ無し）。
    expect(res.headers.get('location')).toBe('http://localhost/admin/login')
  })

  it('非 admin ユーザーが /admin/posts に来たら / へリダイレクトする', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'u1', app_metadata: { role: 'authenticated' } } },
    })
    const res = await updateSession(request('http://localhost/admin/posts'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/')
  })

  it('admin ユーザーは /admin/posts を通過できる（リダイレクトしない）', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'u1', app_metadata: { role: 'admin' } } },
    })
    const res = await updateSession(request('http://localhost/admin/posts'))
    expect(res.status).not.toBe(307)
    expect(res.headers.get('location')).toBeNull()
  })

  // セキュリティ回帰 (fail-open バグ): getUser() は fetch failed を throw せず
  // { data:{ user }, error: AuthRetryableFetchError } で返す。error 非 null のときは
  // たとえ user が（Cookie 由来で）truthy でも fail-closed すること。
  // CI（NEXT_PUBLIC_SUPABASE_URL=placeholder で到達不可）で毎回起こる経路。
  it('fail-closed: /admin/* で getUser が fetch failed (error 非null) を返したら user が truthy でも /admin/login へ（クエリ無し）', async () => {
    getUserMock.mockResolvedValue({
      // 攻撃シナリオ: 古い/改ざんされうる Cookie 由来で admin ロールの user が返る
      data: { user: { id: 'u1', app_metadata: { role: 'admin' } } },
      error: { name: 'AuthRetryableFetchError', message: 'fetch failed' },
    })
    const res = await updateSession(request('http://localhost/admin/posts'))
    expect(res.status).toBe(307)
    // クエリを付けない（前回 ?reason=auth_unavailable を付けて e2e の $ 正規表現で落ちていた）。
    expect(res.headers.get('location')).toBe('http://localhost/admin/login')
  })

  it('fail-closed: /dashboard で getUser が fetch failed (error 非null) を返したら user が truthy でも / へ', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'u1', app_metadata: { role: 'authenticated' } } },
      error: { name: 'AuthRetryableFetchError', message: 'fetch failed' },
    })
    const res = await updateSession(request('http://localhost/dashboard'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/')
  })

  it('未認証(AuthSessionMissingError)も /admin/login へ素直に弾く（reason は付けない＝e2e の $ 正規表現に一致）', async () => {
    // 新規ブラウザ(Cookie 無し)で getUser が返すエラー。error が付くので「検証できなかった」扱いで
    // 一律 fail-closed する（種別で分岐しない素直な形）。
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' },
    })
    const res = await updateSession(request('http://localhost/admin/posts'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/admin/login')
  })

  it('未認証(AuthSessionMissingError)は /dashboard でも / へ（クエリ無し）', async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' },
    })
    const res = await updateSession(request('http://localhost/dashboard'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/')
  })

  it('既存クエリ付きで /admin/* に来ても redirect 先は素の /admin/login に正規化する', async () => {
    // 例えば /admin/posts?foo=bar のような遷移でも、redirect 先にクエリを引き継がない。
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await updateSession(request('http://localhost/admin/posts?foo=bar'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/admin/login')
  })

  it('/admin/login は認証チェックをスキップする', async () => {
    const res = await updateSession(request('http://localhost/admin/login'))
    expect(getUserMock).not.toHaveBeenCalled()
    expect(res.status).not.toBe(307)
  })

  it('/dashboard に未認証で到達したら / へリダイレクトする（REQ-035: getUser で検証）', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await updateSession(request('http://localhost/dashboard'))
    expect(getUserMock).toHaveBeenCalled()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/')
  })

  // REQ-137: fail-closed for /admin/*（throw 経路）
  it('REQ-137: /admin/* で例外時は /admin/login へ fail-closed redirect（クエリ無し）', async () => {
    getUserMock.mockRejectedValue(new Error('supabase down'))
    const res = await updateSession(request('http://localhost/admin/posts'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/admin/login')
    expect(logErrorMock).toHaveBeenCalledTimes(1)
    expect(logErrorMock.mock.calls[0]?.[1]).toBe('middleware:updateSession')
  })

  it('REQ-137: /dashboard で例外時は / へ fail-closed redirect（クエリ無し）', async () => {
    getUserMock.mockRejectedValue(new Error('supabase down'))
    const res = await updateSession(request('http://localhost/dashboard'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/')
    expect(logErrorMock).toHaveBeenCalledTimes(1)
    expect(logErrorMock.mock.calls[0]?.[1]).toBe('middleware:updateSession')
  })

  it('REQ-137: 公開ページは例外時も fail-open で通過する', async () => {
    // createServerClient 自体を throw させて catch ブロックを発火
    createServerClientMock.mockImplementationOnce(() => {
      throw new Error('client init failed')
    })
    const res = await updateSession(request('http://localhost/'))
    expect(res.status).not.toBe(307)
    expect(res.status).not.toBe(500)
    expect(logErrorMock).toHaveBeenCalledTimes(1)
    expect(logErrorMock.mock.calls[0]?.[1]).toBe('middleware:updateSession')
  })

  it('REQ-137: /admin/login への redirect 自体は例外時もリダイレクト先として無限ループしない', async () => {
    // /admin/login は isAdminRoute 判定から除外されるので公開と同じ fail-open
    createServerClientMock.mockImplementationOnce(() => {
      throw new Error('client init failed')
    })
    const res = await updateSession(request('http://localhost/admin/login'))
    expect(res.status).not.toBe(307)
  })
})


describe('protected response cookies and cache (9.3)', () => {
  const writeCookies = () => {
    const options = createServerClientMock.mock.calls.at(-1)?.[2] as { cookies: { setAll: SetAllCookies } }
    options.cookies.setAll([
      { name: 'session.0', value: 'refreshed', options: { path: '/admin', expires: new Date('2030-01-01'), maxAge: 3600, priority: 'high' } },
      { name: 'session.1', value: '', options: { path: '/', maxAge: 0 } },
      { name: 'session.1', value: '', options: { domain: 'example.invalid', path: '/', maxAge: 0 } },
    ], { 'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0', Expires: '0', Pragma: 'no-cache' })
  }

  it.each(['/admin/posts', '/dashboard', '/admin/login'])(
    'protects both allowed and denied responses at %s', async pathname => {
      getUserMock.mockResolvedValue({ data: { user: null }, error: null })
      const res = await updateSession(request(`http://localhost${pathname}?secret=drop`))
      expect(res.headers.get('cache-control')).toMatch(/private/)
      expect(res.headers.get('cache-control')).toMatch(/no-store/)
      if (res.status === 307) expect(res.headers.get('vary')?.toLowerCase().split(/,\s*/)).toContain('cookie')
      else expect(res.headers.has('vary')).toBe(false)
    },
  )

  it.each(['deny', 'allow', 'throw'])('keeps every scoped cookie write on %s', async outcome => {
    vi.stubEnv('NODE_ENV', 'production')
    getUserMock.mockImplementationOnce(async () => {
      writeCookies()
      if (outcome === 'throw') throw new Error('after refresh')
      return { data: { user: outcome === 'allow' ? { id: 'u1', app_metadata: { role: 'admin' } } : null }, error: null }
    })
    try {
      const res = await updateSession(request('https://example.invalid/admin/posts?ignored=1'))
      const cookies = res.headers.getSetCookie()
      expect(cookies).toHaveLength(3)
      expect(cookies[0]).toContain('session.0=refreshed')
      expect(cookies[0]).toMatch(/Path=\/admin/i)
      expect(cookies[0]).toMatch(/Expires=Tue, 01 Jan 2030/i)
      expect(cookies[0]).toMatch(/Priority=High/i)
      expect(cookies[1]).toMatch(/Max-Age=0/i)
      expect(cookies[2]).toContain('Domain=example.invalid')
      for (const cookie of cookies) {
        expect(cookie).toMatch(/Secure/i)
        expect(cookie).toMatch(/SameSite=Lax/i)
      }
      expect(res.headers.get('cache-control')).toMatch(/private.*no-store/)
      expect(res.headers.get('expires')).toBe('0')
      expect(res.headers.get('pragma')).toBe('no-cache')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('denies admin forged only in user_metadata', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', app_metadata: {}, user_metadata: { role: 'admin' } } }, error: null })
    const res = await updateSession(request('http://localhost/admin/posts'))
    expect(res.headers.get('location')).toBe('http://localhost/')
  })
})
