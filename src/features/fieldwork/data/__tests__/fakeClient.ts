import { vi } from 'vitest'

import type { FieldworkClient } from '../shared'

export interface Result {
  data: unknown
  error: unknown
}

export interface Recorded {
  table: string
  ops: [string, unknown[]][]
}

/**
 * 組み立てたクエリを記録し、終端（await / single / maybeSingle / rpc）で決めた結果を返す偽クライアント。
 * `results` は `.from()` を呼んだ順に 1 つずつ使う（足りなければ最後のものを使い回す）。
 */
export function fakeClient(results: Result | Result[], rpcResult: Result = { data: null, error: null }) {
  const queue = Array.isArray(results) ? [...results] : [results]
  const calls: Recorded[] = []
  const rpcCalls: [string, unknown][] = []

  function builder(result: Result, recorded: Recorded) {
    const b: Record<string, unknown> = {}
    for (const op of ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'gte', 'lte', 'order', 'limit']) {
      b[op] = vi.fn((...args: unknown[]) => {
        recorded.ops.push([op, args])
        return b
      })
    }
    b.single = vi.fn(() => Promise.resolve(result))
    b.maybeSingle = vi.fn(() => Promise.resolve(result))
    b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject)
    return b
  }

  const client = {
    from: vi.fn((table: string) => {
      const result = (queue.length > 1 ? queue.shift() : queue[0]) as Result
      const recorded: Recorded = { table, ops: [] }
      calls.push(recorded)
      return builder(result, recorded)
    }),
    rpc: vi.fn((fn: string, args: unknown) => {
      rpcCalls.push([fn, args])
      return Promise.resolve(rpcResult)
    }),
  }
  return { client: client as unknown as FieldworkClient, calls, rpcCalls }
}

/** 記録の中から最初の op の引数を取り出す。 */
export function argOf(recorded: Recorded | undefined, op: string): unknown {
  return recorded?.ops.find(([name]) => name === op)?.[1][0]
}
