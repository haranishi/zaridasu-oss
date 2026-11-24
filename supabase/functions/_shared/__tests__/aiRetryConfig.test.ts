// REQ-218 FR-218-01 / AC-01: aiRetryConfig.ts の単体テスト。
//
// 検証する挙動:
//   - getMaxRetryAttempts: 既定 2（後方互換）/ env 上書き / 0 でリトライ無効 / 不正値 fallback
//   - getRequestTotalTimeoutMs: 既定 / env 上書き / 0 で無効
//   - computeBackoffDelayMs: 指数増加・上限クランプ・ジッタ範囲（決定的 rng で検証）
//   - hasBudgetForNextAttempt: 残り時間が待機+試行に足りるか / timeout 無効時は常に true
//   - RetryDeadlineError: 名前・メタ情報
//
// 実行: `deno test --allow-env --allow-net --allow-read \
//   --lock=supabase/functions/deno.lock --cached-only --no-check \
//   supabase/functions/_shared/__tests__/aiRetryConfig.test.ts`

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

import {
  computeBackoffDelayMs,
  DEFAULT_MAX_RETRY,
  DEFAULT_REQUEST_TOTAL_TIMEOUT_MS,
  getMaxRetryAttempts,
  getRequestTotalTimeoutMs,
  hasBudgetForNextAttempt,
  RetryDeadlineError,
  sleep,
} from "../aiRetryConfig.ts";

function withEnv(
  name: string,
  value: string | undefined,
  fn: () => void,
): void {
  const prev = Deno.env.get(name);
  try {
    if (value === undefined) Deno.env.delete(name);
    else Deno.env.set(name, value);
    fn();
  } finally {
    if (prev === undefined) Deno.env.delete(name);
    else Deno.env.set(name, prev);
  }
}

// ===== getMaxRetryAttempts =====

Deno.test("getMaxRetryAttempts: 未設定なら既定 2 (後方互換・AC-08)", () => {
  withEnv("AI_MAX_RETRY", undefined, () => {
    assertEquals(getMaxRetryAttempts(), DEFAULT_MAX_RETRY);
    assertEquals(getMaxRetryAttempts(), 2);
  });
});

Deno.test("getMaxRetryAttempts: env で上書きできる", () => {
  withEnv("AI_MAX_RETRY", "1", () => assertEquals(getMaxRetryAttempts(), 1));
  withEnv("AI_MAX_RETRY", "5", () => assertEquals(getMaxRetryAttempts(), 5));
});

Deno.test("getMaxRetryAttempts: 0 を明示するとリトライ無効 (初回のみ)", () => {
  withEnv("AI_MAX_RETRY", "0", () => assertEquals(getMaxRetryAttempts(), 0));
});

Deno.test("getMaxRetryAttempts: 不正値 / 負値は既定にフォールバック", () => {
  withEnv("AI_MAX_RETRY", "abc", () => assertEquals(getMaxRetryAttempts(), 2));
  withEnv("AI_MAX_RETRY", "-3", () => assertEquals(getMaxRetryAttempts(), 2));
  withEnv("AI_MAX_RETRY", "", () => assertEquals(getMaxRetryAttempts(), 2));
});

// ===== getRequestTotalTimeoutMs =====

Deno.test("getRequestTotalTimeoutMs: 未設定なら既定", () => {
  withEnv("AI_REQUEST_TOTAL_TIMEOUT_MS", undefined, () => {
    assertEquals(getRequestTotalTimeoutMs(), DEFAULT_REQUEST_TOTAL_TIMEOUT_MS);
  });
});

Deno.test("getRequestTotalTimeoutMs: env 上書き / 0 で無効化", () => {
  withEnv("AI_REQUEST_TOTAL_TIMEOUT_MS", "30000", () =>
    assertEquals(getRequestTotalTimeoutMs(), 30000));
  withEnv("AI_REQUEST_TOTAL_TIMEOUT_MS", "0", () =>
    assertEquals(getRequestTotalTimeoutMs(), 0));
});

Deno.test("getRequestTotalTimeoutMs: 不正値は既定にフォールバック", () => {
  withEnv("AI_REQUEST_TOTAL_TIMEOUT_MS", "xyz", () =>
    assertEquals(getRequestTotalTimeoutMs(), DEFAULT_REQUEST_TOTAL_TIMEOUT_MS));
});

// ===== computeBackoffDelayMs =====

Deno.test("computeBackoffDelayMs: ジッタ 0 (rng=0.5) で指数増加する", () => {
  // rng()=0.5 → jitter 係数 (0.5*2-1)=0 → 揺らぎ無し。base=500。
  const opts = { baseDelayMs: 500, maxDelayMs: 100_000, rng: () => 0.5 };
  assertEquals(computeBackoffDelayMs(1, opts), 500); // 500 * 2^0
  assertEquals(computeBackoffDelayMs(2, opts), 1000); // 500 * 2^1
  assertEquals(computeBackoffDelayMs(3, opts), 2000); // 500 * 2^2
  assertEquals(computeBackoffDelayMs(4, opts), 4000); // 500 * 2^3
});

Deno.test("computeBackoffDelayMs: maxDelay で頭打ちになる", () => {
  const opts = { baseDelayMs: 500, maxDelayMs: 1500, rng: () => 0.5 };
  // attempt=3 の素の値は 2000 だが maxDelay=1500 でクランプ。
  assertEquals(computeBackoffDelayMs(3, opts), 1500);
  assertEquals(computeBackoffDelayMs(10, opts), 1500);
});

Deno.test("computeBackoffDelayMs: ジッタは ±jitterRatio の範囲に収まる", () => {
  const base = 1000;
  const ratio = 0.2;
  // rng=0 → 下限 (capped*(1-ratio)) / rng→1 近似 → 上限 (capped*(1+ratio))
  const low = computeBackoffDelayMs(1, {
    baseDelayMs: base,
    maxDelayMs: 100_000,
    jitterRatio: ratio,
    rng: () => 0,
  });
  const high = computeBackoffDelayMs(1, {
    baseDelayMs: base,
    maxDelayMs: 100_000,
    jitterRatio: ratio,
    rng: () => 0.999999,
  });
  assertEquals(low, Math.round(base * (1 - ratio))); // 800
  assert(high <= Math.round(base * (1 + ratio))); // <= 1200
  assert(high >= base); // 上振れ側
  // 実際の Math.random でも常に 0 以上で上下限内であることをサンプリング確認。
  for (let i = 0; i < 200; i++) {
    const d = computeBackoffDelayMs(2, {
      baseDelayMs: base,
      maxDelayMs: 100_000,
      jitterRatio: ratio,
    });
    assert(d >= 0);
    assert(d >= Math.floor(2000 * (1 - ratio)) - 1);
    assert(d <= Math.ceil(2000 * (1 + ratio)) + 1);
  }
});

Deno.test("computeBackoffDelayMs: attempt<1 は 1 として扱い負値を返さない", () => {
  const d = computeBackoffDelayMs(0, {
    baseDelayMs: 500,
    maxDelayMs: 100_000,
    rng: () => 0,
  });
  assert(d >= 0);
});

// ===== hasBudgetForNextAttempt =====

Deno.test("hasBudgetForNextAttempt: 残り時間が待機+試行に足りれば true", () => {
  // started=0, timeout=10000, 経過 2000 (now=2000), 待機 1000 → 3000 < 10000 → true
  assert(hasBudgetForNextAttempt(0, 10_000, 1000, 2000));
});

Deno.test("hasBudgetForNextAttempt: 経過+待機が timeout を超えるなら false (AC-01 打ち切り)", () => {
  // 経過 9500 + 待機 1000 = 10500 >= 10000 → false
  assertEquals(hasBudgetForNextAttempt(0, 10_000, 1000, 9500), false);
});

Deno.test("hasBudgetForNextAttempt: timeout<=0 (無効) なら常に true", () => {
  assert(hasBudgetForNextAttempt(0, 0, 999_999, 999_999));
});

// ===== sleep / RetryDeadlineError =====

Deno.test("sleep: ms<=0 は即 resolve", async () => {
  const t0 = Date.now();
  await sleep(0);
  await sleep(-5);
  assert(Date.now() - t0 < 50);
});

Deno.test("sleep: 指定 ms 程度待つ", async () => {
  const t0 = Date.now();
  await sleep(30);
  assert(Date.now() - t0 >= 25);
});

Deno.test("RetryDeadlineError: name とメタ情報を持つ", () => {
  const err = new RetryDeadlineError(12345, 10000, new Error("inner"));
  assertEquals(err.name, "RetryDeadlineError");
  assertEquals(err.elapsedMs, 12345);
  assertEquals(err.timeoutMs, 10000);
  assert(/timeout/i.test(err.message));
  assert(err instanceof Error);
});
