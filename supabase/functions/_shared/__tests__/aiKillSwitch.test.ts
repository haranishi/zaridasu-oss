// REQ-218 FR-218-03 / AC-02: aiKillSwitch.ts の単体テスト。
//
// 検証する挙動:
//   - AI_ANALYSIS_ENABLED 未設定 → 有効（true・後方互換）
//   - "false" / "0" / "no" / "off"（大小文字・前後空白）→ 無効（false）
//   - "true" / それ以外 → 有効（true）
//   - skip 理由定数が "disabled"
//
// 実行: `deno test --allow-env --allow-net --allow-read \
//   --lock=supabase/functions/deno.lock --cached-only --no-check \
//   supabase/functions/_shared/__tests__/aiKillSwitch.test.ts`

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

import {
  AI_DISABLED_SKIP_REASON,
  isAiAnalysisEnabled,
} from "../aiKillSwitch.ts";

function withEnv(value: string | undefined, fn: () => void): void {
  const prev = Deno.env.get("AI_ANALYSIS_ENABLED");
  try {
    if (value === undefined) Deno.env.delete("AI_ANALYSIS_ENABLED");
    else Deno.env.set("AI_ANALYSIS_ENABLED", value);
    fn();
  } finally {
    if (prev === undefined) Deno.env.delete("AI_ANALYSIS_ENABLED");
    else Deno.env.set("AI_ANALYSIS_ENABLED", prev);
  }
}

Deno.test("aiKillSwitch: 未設定なら既定で有効 (後方互換・AC-08)", () => {
  withEnv(undefined, () => assertEquals(isAiAnalysisEnabled(), true));
});

Deno.test("aiKillSwitch: 空文字も既定で有効", () => {
  withEnv("", () => assertEquals(isAiAnalysisEnabled(), true));
  withEnv("   ", () => assertEquals(isAiAnalysisEnabled(), true));
});

Deno.test("aiKillSwitch: 'true' は有効", () => {
  withEnv("true", () => assertEquals(isAiAnalysisEnabled(), true));
  withEnv("TRUE", () => assertEquals(isAiAnalysisEnabled(), true));
  withEnv("1", () => assertEquals(isAiAnalysisEnabled(), true));
  withEnv("yes", () => assertEquals(isAiAnalysisEnabled(), true));
});

Deno.test("aiKillSwitch: 'false' で停止する (AC-02)", () => {
  withEnv("false", () => assertEquals(isAiAnalysisEnabled(), false));
});

Deno.test("aiKillSwitch: false 相当 (0 / no / off・大小文字・前後空白) も停止", () => {
  for (const v of ["FALSE", " false ", "0", "No", "OFF", "off"]) {
    withEnv(v, () =>
      assertEquals(
        isAiAnalysisEnabled(),
        false,
        `"${v}" は停止扱いであるべき`,
      ));
  }
});

Deno.test("aiKillSwitch: 未知の値は安全側ではなく『有効』(明示 false のみ停止)", () => {
  // 設定ミスで意図せず止まり続けるより、明示 false のみで止める設計。
  withEnv("enabled", () => assertEquals(isAiAnalysisEnabled(), true));
  withEnv("disable", () => assertEquals(isAiAnalysisEnabled(), true));
});

Deno.test("aiKillSwitch: skip 理由定数は 'disabled' (AC-02)", () => {
  assertEquals(AI_DISABLED_SKIP_REASON, "disabled");
  assert(typeof AI_DISABLED_SKIP_REASON === "string");
});
