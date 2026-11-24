import { describe, it, expect, vi, beforeEach } from 'vitest'

// logError をモックして「rejected 時に呼ばれる／aborted 時は呼ばれない」を検証する。
const logErrorMock = vi.fn()
vi.mock('@/lib/errorHandler', () => ({
  logError: (err: unknown, ctx: string) => logErrorMock(err, ctx),
}))

import { settleAll } from '../settleAll'

beforeEach(() => {
  logErrorMock.mockReset()
})

describe('settleAll', () => {
  it('全て fulfilled のとき resolve 値を順序どおり返し、logError は呼ばれない', async () => {
    const values = await settleAll<{ n: number }>(
      [Promise.resolve({ n: 1 }), Promise.resolve({ n: 2 }), Promise.resolve({ n: 3 })],
      'ctx',
    )
    expect(values).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
    expect(logErrorMock).not.toHaveBeenCalled()
  })

  it('rejected のインデックスは null になり、他は値を保つ（順序維持）', async () => {
    const values = await settleAll<{ v: string }>(
      [
        Promise.resolve({ v: 'a' }),
        Promise.reject(new Error('boom')),
        Promise.resolve({ v: 'c' }),
      ],
      'ctx',
    )
    expect(values).toEqual([{ v: 'a' }, null, { v: 'c' }])
  })

  it('rejection ごとに logError(Error, `${ctx}[i]`) を 1 回ずつ呼ぶ', async () => {
    const err1 = new Error('e1')
    const err2 = new Error('e2')
    await settleAll(
      [Promise.resolve(1), Promise.reject(err1), Promise.resolve(3), Promise.reject(err2)],
      'useAdminStats:query',
    )
    expect(logErrorMock).toHaveBeenCalledTimes(2)
    expect(logErrorMock).toHaveBeenCalledWith(err1, 'useAdminStats:query[1]')
    expect(logErrorMock).toHaveBeenCalledWith(err2, 'useAdminStats:query[3]')
  })

  it('非 Error の reason は Error(String(reason)) に包んで logError する', async () => {
    await settleAll([Promise.reject('plain string reason')], 'ctx')
    expect(logErrorMock).toHaveBeenCalledTimes(1)
    const [errArg, ctxArg] = logErrorMock.mock.calls[0]!
    expect(errArg).toBeInstanceOf(Error)
    expect((errArg as Error).message).toBe('plain string reason')
    expect(ctxArg).toBe('ctx[0]')
  })

  it('isAborted() が true の間は rejection を記録しない（null 化はする）', async () => {
    const values = await settleAll(
      [Promise.resolve('ok'), Promise.reject(new Error('ignored'))],
      'ctx',
      () => true,
    )
    expect(values).toEqual(['ok', null])
    expect(logErrorMock).not.toHaveBeenCalled()
  })

  it('空配列では空配列を返し、logError は呼ばれない', async () => {
    const values = await settleAll([], 'ctx')
    expect(values).toEqual([])
    expect(logErrorMock).not.toHaveBeenCalled()
  })

  it('Supabase レスポンス様の異種形（count / data / error）を丸めず素通しで返す', async () => {
    // useAdminStats は count と data を、useAdminKpi は data と error を、同じ配列から取り出す。
    const values = await settleAll<{ count?: number | null; data?: unknown; error?: unknown }>(
      [
        Promise.resolve({ count: 42, data: null }),
        Promise.resolve({ data: [{ id: 1 }] }),
        Promise.resolve({ data: null, error: { message: 'rls' } }),
        Promise.reject(new Error('net')),
      ],
      'ctx',
    )
    expect(values[0]?.count).toBe(42)
    expect(values[1]?.data).toEqual([{ id: 1 }])
    expect(values[2]?.error).toEqual({ message: 'rls' })
    expect(values[3]).toBeNull()
  })
})
