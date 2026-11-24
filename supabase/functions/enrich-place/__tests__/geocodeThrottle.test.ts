// REQ-231 (NFR-231-01(a) / AC-03(a)): スロットラの単体テスト。
//   - 直列実行（前の完了を待ってから次が走る）
//   - 最小間隔（合算で 1req/秒を超えない）の担保
//   - task が throw しても後続がブロックされない
//
// 実行: `deno test --allow-env --allow-net --allow-read \
//   --lock=supabase/functions/deno.lock --cached-only --no-check \
//   supabase/functions/enrich-place/__tests__/geocodeThrottle.test.ts`

import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { resetThrottle, runThrottled } from '../../_shared/geocodeThrottle.ts'

Deno.test('runThrottled: 最小間隔を空けて直列実行する（合算レート上限）', async () => {
  Deno.env.set('GEOCODE_MIN_INTERVAL_MS', '120')
  resetThrottle()
  try {
    const starts: number[] = []
    const task = () => {
      starts.push(Date.now())
      return Promise.resolve('ok')
    }
    // 3 件を同時に投入しても、発火は >= 120ms 間隔で直列化される。
    await Promise.all([runThrottled(task), runThrottled(task), runThrottled(task)])
    assertEquals(starts.length, 3)
    starts.sort((a, b) => a - b)
    assert(starts[1] - starts[0] >= 110, `interval0=${starts[1] - starts[0]}`)
    assert(starts[2] - starts[1] >= 110, `interval1=${starts[2] - starts[1]}`)
  } finally {
    Deno.env.delete('GEOCODE_MIN_INTERVAL_MS')
    resetThrottle()
  }
})

Deno.test('runThrottled: task の戻り値を解決する', async () => {
  Deno.env.set('GEOCODE_MIN_INTERVAL_MS', '0')
  resetThrottle()
  try {
    const v = await runThrottled(() => Promise.resolve(42))
    assertEquals(v, 42)
  } finally {
    Deno.env.delete('GEOCODE_MIN_INTERVAL_MS')
    resetThrottle()
  }
})

Deno.test('runThrottled: task が reject しても後続はブロックされない', async () => {
  Deno.env.set('GEOCODE_MIN_INTERVAL_MS', '0')
  resetThrottle()
  try {
    const failing = runThrottled(() => Promise.reject(new Error('boom')))
    await failing.then(
      () => assert(false, 'should have rejected'),
      (e) => assert(e instanceof Error),
    )
    // 後続は正常に解決する（チェーンがエラーで詰まらない）
    const ok = await runThrottled(() => Promise.resolve('next'))
    assertEquals(ok, 'next')
  } finally {
    Deno.env.delete('GEOCODE_MIN_INTERVAL_MS')
    resetThrottle()
  }
})
