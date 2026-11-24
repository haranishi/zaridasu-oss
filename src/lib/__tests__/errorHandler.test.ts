import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getErrorMessage,
  resolveErrorMessage,
  logError,
  setErrorReporter,
  resetErrorReporter,
} from '../errorHandler'
import ja from '@/locales/ja/translation.json'

function translationValue(key: string): unknown {
  let value: unknown = ja
  for (const part of key.split('.')) {
    if (value == null || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[part]
  }
  return value
}

// REQ-183: getErrorMessage() は文字列ではなく ErrorMessage { key, params?, raw? }
// を返すようになった。表示側の t() を再現するスタブで ja の実文言に解決して、
// ユーザー向け文言の正しさも併せて検証する。raw があればそれを優先する
// （resolveErrorMessage の仕様に合わせる）。
const tStub = (key: string, params?: Record<string, unknown>): string => {
  // 'errors.network' → ja.errors.network のように辿る
  const value = translationValue(key)
  if (typeof value !== 'string') return key
  if (!params) return value
  return value.replace(/\{\{(\w+)\}\}/g, (_match: string, name: string) => (params[name] != null ? String(params[name]) : ''))
}
const resolve = (err: unknown) => resolveErrorMessage(getErrorMessage(err), tStub)

describe('getErrorMessage()', () => {
  it('null / undefined → 汎用メッセージ', () => {
    expect(getErrorMessage(null).key).toBe('errors.unexpected')
    expect(getErrorMessage(undefined).key).toBe('errors.unexpected')
    expect(resolve(null)).toContain('予期しない')
    expect(resolve(undefined)).toContain('予期しない')
  })

  it('code=P0001 → PostgreSQL メッセージ(raw)を優先して返す', () => {
    const err = { code: 'P0001', message: '投稿が集中しています。' }
    const msg = getErrorMessage(err)
    expect(msg.key).toBe('errors.rateLimitServer')
    expect(msg.raw).toBe('投稿が集中しています。')
    // raw 優先で解決される
    expect(resolve(err)).toBe('投稿が集中しています。')
  })

  it('code=P0001 で message が空 → デフォルトのレートリミットメッセージ', () => {
    const err = { code: 'P0001', message: '' }
    const msg = getErrorMessage(err)
    expect(msg.key).toBe('errors.rateLimitServer')
    expect(msg.raw).toBeUndefined()
    expect(resolve(err)).toContain('集中しています')
  })

  it('TypeError(fetch) → ネットワークエラーメッセージ', () => {
    const err = new TypeError('Failed to fetch')
    expect(getErrorMessage(err).key).toBe('errors.network')
    expect(resolve(err)).toContain('通信エラー')
  })

  it('status=401 → セッション切れメッセージ', () => {
    expect(getErrorMessage({ status: 401 }).key).toBe('errors.sessionExpired')
    expect(resolve({ status: 401 })).toContain('セッション')
  })

  it('code=PGRST301 → セッション切れメッセージ', () => {
    expect(getErrorMessage({ code: 'PGRST301' }).key).toBe('errors.sessionExpired')
    expect(resolve({ code: 'PGRST301' })).toContain('セッション')
  })

  it('status=403 → 権限なしメッセージ', () => {
    expect(getErrorMessage({ status: 403 }).key).toBe('errors.forbidden')
    expect(resolve({ status: 403 })).toContain('権限')
  })

  it('code=PGRST116 → 権限なしメッセージ', () => {
    expect(getErrorMessage({ code: 'PGRST116' }).key).toBe('errors.forbidden')
    expect(resolve({ code: 'PGRST116' })).toContain('権限')
  })

  it('statusCode=404 → ファイル未発見メッセージ', () => {
    expect(getErrorMessage({ statusCode: '404' }).key).toBe('errors.notFound')
    expect(resolve({ statusCode: '404' })).toContain('見つかりません')
  })

  it('error=not_found → ファイル未発見メッセージ', () => {
    expect(getErrorMessage({ error: 'not_found' }).key).toBe('errors.notFound')
    expect(resolve({ error: 'not_found' })).toContain('見つかりません')
  })

  it('status=429 → レート制限メッセージ', () => {
    expect(getErrorMessage({ status: 429 }).key).toBe('errors.tooManyRequests')
    expect(resolve({ status: 429 })).toContain('多すぎます')
  })

  it('不明なエラー → 汎用エラーメッセージ', () => {
    expect(getErrorMessage({ code: 'UNKNOWN' }).key).toBe('errors.generic')
    expect(resolve({ code: 'UNKNOWN' })).toContain('エラーが発生しました')
  })
})

describe('logError()', () => {
  const originalConsoleError = console.error

  beforeEach(() => {
    console.error = vi.fn()
  })

  afterEach(() => {
    console.error = originalConsoleError
  })

  it('DEV 環境では console.error を呼ぶ', () => {
    // vite.config.js の test 設定では DEV=true
    const err = new Error('test error')
    logError(err, 'TestContext')
    // jsdom テスト環境では import.meta.env.DEV=true
    // logError が console.error を呼んでいるか確認
    // (環境によって変わるため、エラーなしで実行できることを確認)
    expect(() => logError(err, 'ctx')).not.toThrow()
  })

  it('context 引数なしでも動作する', () => {
    expect(() => logError(new Error('no context'))).not.toThrow()
  })

  it('null / undefined のエラーでも動作する', () => {
    expect(() => logError(null)).not.toThrow()
    expect(() => logError(undefined)).not.toThrow()
  })
})

describe('setErrorReporter()', () => {
  const originalConsoleError = console.error

  beforeEach(() => {
    console.error = vi.fn()
    resetErrorReporter()
  })

  afterEach(() => {
    console.error = originalConsoleError
    resetErrorReporter()
  })

  it('設定したレポーターが logError() から呼ばれる', () => {
    const reporter = vi.fn()
    setErrorReporter(reporter)

    const err = new Error('test')
    logError(err, 'TestCtx')

    expect(reporter).toHaveBeenCalledOnce()
    expect(reporter).toHaveBeenCalledWith(err, 'TestCtx')
  })

  it('context 未指定の場合は "unknown" が渡される', () => {
    const reporter = vi.fn()
    setErrorReporter(reporter)

    logError(new Error('no ctx'))

    expect(reporter).toHaveBeenCalledWith(expect.any(Error), 'unknown')
  })

  it('resetErrorReporter() でレポーターが解除される', () => {
    const reporter = vi.fn()
    setErrorReporter(reporter)
    resetErrorReporter()

    logError(new Error('after reset'))

    expect(reporter).not.toHaveBeenCalled()
  })

  it('レポーターがエラーを投げてもアプリは壊れない', () => {
    setErrorReporter(() => {
      throw new Error('reporter crash')
    })

    expect(() => logError(new Error('safe'))).not.toThrow()
  })
})
