import { vi } from 'vitest'

import type { WaterClient } from '../reports'

interface Result { data: unknown; error: unknown; count?: number | null }
export function fakeWaterClient(results: Result | Result[], rpcResult: Result = { data: true, error: null }) {
  const queue = Array.isArray(results) ? [...results] : [results]
  const calls: { table: string; ops: [string, unknown[]][] }[] = []
  const rpcCalls: [string, unknown][] = []
  const client = {
    from: vi.fn((table: string) => {
      const result = queue.length > 1 ? queue.shift()! : queue[0]
      const call = { table, ops: [] as [string, unknown[]][] }
      calls.push(call)
      const builder: Record<string, unknown> = {}
      for (const op of ['select', 'insert', 'eq', 'gte', 'lte', 'order', 'limit', 'abortSignal']) {
        builder[op] = (...args: unknown[]) => { call.ops.push([op, args]); return builder }
      }
      builder.single = () => Promise.resolve(result)
      builder.then = (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)
      return builder
    }),
    rpc: vi.fn((name: string, args: unknown) => { rpcCalls.push([name, args]); return Promise.resolve(rpcResult) }),
  }
  return { client: client as unknown as WaterClient, calls, rpcCalls }
}
