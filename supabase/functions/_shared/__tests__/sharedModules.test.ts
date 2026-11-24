// REQ-117: `_shared/` 共通モジュール本体の smoke test
//
// テスト対象:
//   - aiLogging.ts (extractUsage の純粋関数)
//   - aiLogging.ts (logAiCall がフェイルオープン)
//   - aiDedup.ts (DEDUP_ENABLED フラグ)
//   - aiRateLimit.ts (fail-closed の挙動)
//
// `_shared` の export が壊れた場合 (import path / 関数名不一致 / シグネチャ変更) に
// CI で検出できるようにするのが目的。
//
// 実行: `deno test --allow-env --allow-net --allow-read supabase/functions/_shared/__tests__/sharedModules.test.ts`

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

import {
  classifyAiError,
  extractUsage,
  GeminiApiError,
  GeminiResponseError,
  getThinkingBudget,
  logAiCall,
  redactAiErrorMessage,
} from "../aiLogging.ts";
import { DEDUP_ENABLED, findAudioDedup, findImageDedup } from "../aiDedup.ts";
import {
  checkReanalysisCallerRateLimit,
  checkReanalysisRateLimit,
  reanalysisCallerKey,
} from "../aiRateLimit.ts";

// ===== aiLogging.extractUsage =====
Deno.test("extractUsage: usageMetadata から input/output トークン数を抽出する", () => {
  const u = extractUsage({
    usageMetadata: { promptTokenCount: 123, candidatesTokenCount: 45 },
  });
  assertEquals(u.input, 123);
  assertEquals(u.output, 45);
});

Deno.test("extractUsage: usageMetadata が無い場合は undefined を返す", () => {
  const u = extractUsage({});
  assertEquals(u.input, undefined);
  assertEquals(u.output, undefined);
});

Deno.test("extractUsage: 不正な型 (null) でも例外を投げない", () => {
  const u = extractUsage(null);
  assertEquals(u.input, undefined);
  assertEquals(u.output, undefined);
});

Deno.test("extractUsage: 数値以外のフィールドは undefined になる", () => {
  const u = extractUsage({
    usageMetadata: { promptTokenCount: "oops", candidatesTokenCount: null },
  });
  assertEquals(u.input, undefined);
  assertEquals(u.output, undefined);
});

// ===== aiLogging.logAiCall (フェイルオープン) =====
Deno.test("logAiCall: insert が throw してもエラーを投げない (fail-open)", async () => {
  const supabase = {
    from(_table: string) {
      return {
        insert(_row: unknown) {
          throw new Error("boom");
        },
      };
    },
  };
  // 投げないことが確認できれば OK
  await logAiCall(supabase, {
    functionName: "analyze-image",
    model: "gemini-2.5-flash-lite",
    status: "error",
  });
});

Deno.test("logAiCall: 正常系で ai_call_logs に正しいフィールドが渡る", async () => {
  let captured: Record<string, unknown> | null = null;
  const supabase = {
    from(table: string) {
      assertEquals(table, "ai_call_logs");
      return {
        insert(row: Record<string, unknown>) {
          captured = row;
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  await logAiCall(supabase, {
    postId: "p1",
    functionName: "analyze-image",
    model: "gemini-2.5-flash-lite",
    inputTokens: 10,
    outputTokens: 20,
    latencyMs: 123,
    status: "success",
    reanalysis: false,
    dedupStatus: "miss",
    cacheStatus: "hit",
  });
  assert(captured !== null, "insert が呼ばれていない");
  const row = captured as unknown as Record<string, unknown>;
  assertEquals(row.post_id, "p1");
  assertEquals(row.function_name, "analyze-image");
  assertEquals(row.input_tokens, 10);
  assertEquals(row.output_tokens, 20);
  assertEquals(row.status, "success");
  assertEquals(row.dedup_status, "miss");
  assertEquals(row.cache_status, "hit");
});

Deno.test("redactAiErrorMessage: Gemini API key query を保存前に伏せる", () => {
  const msg =
    "Gemini API エラー (500): https://generativelanguage.googleapis.com/v1beta/models/x?key=AIzaSyTEST";
  assertEquals(
    redactAiErrorMessage(msg),
    "Gemini API エラー (500): https://generativelanguage.googleapis.com/v1beta/models/x?key=[REDACTED]",
  );
});

Deno.test("classifyAiError: エラー種別を分類する（文字列・後方互換）", () => {
  assertEquals(
    classifyAiError("画像の取得に失敗しました (404)"),
    "image_fetch",
  );
  assertEquals(classifyAiError("Gemini API エラー (500): bad"), "gemini_api");
  assertEquals(classifyAiError("JSON.parse 失敗: SyntaxError"), "json_parse");
  assertEquals(classifyAiError("other"), "unknown");
});

// REQ-126 FR-126-12: GeminiApiError インスタンスを受けたら HTTP status で細分化する。
Deno.test("classifyAiError: GeminiApiError(400) → gemini_auth", () => {
  assertEquals(
    classifyAiError(new GeminiApiError(400, "API key not valid")),
    "gemini_auth",
  );
});

Deno.test("classifyAiError: GeminiApiError(401) → gemini_auth", () => {
  assertEquals(
    classifyAiError(new GeminiApiError(401, "Unauthorized")),
    "gemini_auth",
  );
});

Deno.test("classifyAiError: GeminiApiError(403) → gemini_auth", () => {
  assertEquals(
    classifyAiError(new GeminiApiError(403, "Forbidden")),
    "gemini_auth",
  );
});

Deno.test("classifyAiError: GeminiApiError(500) → gemini_transient", () => {
  assertEquals(
    classifyAiError(new GeminiApiError(500, "internal")),
    "gemini_transient",
  );
});

Deno.test("classifyAiError: GeminiApiError(503) → gemini_transient", () => {
  assertEquals(
    classifyAiError(new GeminiApiError(503, "unavailable")),
    "gemini_transient",
  );
});

Deno.test("classifyAiError: GeminiApiError(429) → gemini_transient", () => {
  assertEquals(
    classifyAiError(new GeminiApiError(429, "rate limit")),
    "gemini_transient",
  );
});

Deno.test("classifyAiError: GeminiApiError(404) → gemini_api（その他 HTTP）", () => {
  assertEquals(
    classifyAiError(new GeminiApiError(404, "not found")),
    "gemini_api",
  );
});

Deno.test("classifyAiError: 通常の Error も message ベースで判定する", () => {
  assertEquals(
    classifyAiError(new Error("画像の取得に失敗しました")),
    "image_fetch",
  );
  assertEquals(
    classifyAiError(new Error("Gemini API エラー (500): bad")),
    "gemini_api",
  );
});

// REQ-127 FR-127-13: GeminiResponseError の分類テスト
Deno.test("classifyAiError: GeminiResponseError(MAX_TOKENS) → gemini_truncated", () => {
  assertEquals(
    classifyAiError(
      new GeminiResponseError({
        finishReason: "MAX_TOKENS",
        blockReason: null,
        rawText: '{"detected_species":"american","notes":"アメリ',
        cause: "response_truncated",
      }),
    ),
    "gemini_truncated",
  );
});

Deno.test("classifyAiError: GeminiResponseError(SAFETY) → gemini_safety", () => {
  assertEquals(
    classifyAiError(
      new GeminiResponseError({
        finishReason: "SAFETY",
        blockReason: null,
        rawText: "",
        cause: "response_blocked",
      }),
    ),
    "gemini_safety",
  );
});

Deno.test("classifyAiError: GeminiResponseError(RECITATION) → gemini_safety", () => {
  assertEquals(
    classifyAiError(
      new GeminiResponseError({
        finishReason: "RECITATION",
        blockReason: null,
        rawText: "",
        cause: "response_blocked",
      }),
    ),
    "gemini_safety",
  );
});

Deno.test("classifyAiError: GeminiResponseError(blockReason=PROHIBITED_CONTENT) → gemini_safety", () => {
  assertEquals(
    classifyAiError(
      new GeminiResponseError({
        finishReason: null,
        blockReason: "PROHIBITED_CONTENT",
        rawText: "",
        cause: "response_blocked",
      }),
    ),
    "gemini_safety",
  );
});

Deno.test("classifyAiError: GeminiResponseError(STOP + JSON.parse 失敗) → json_parse", () => {
  assertEquals(
    classifyAiError(
      new GeminiResponseError({
        finishReason: "STOP",
        blockReason: null,
        rawText: "not a json",
        cause: "JSON.parse 失敗: Unexpected token",
      }),
    ),
    "json_parse",
  );
});

// REQ-130 FR-130-06: GeminiResponseError が usage を保持する
Deno.test("GeminiResponseError: usage を保持できる (MAX_TOKENS でも token 数が伝播する)", () => {
  const err = new GeminiResponseError({
    finishReason: "MAX_TOKENS",
    blockReason: null,
    rawText: '{"detected_species":"ame',
    usage: { input: 600, output: 1024 },
    cause: "response_truncated",
  });
  assertEquals(err.usage?.input, 600);
  assertEquals(err.usage?.output, 1024);
});

Deno.test("GeminiResponseError: usage 未指定なら null", () => {
  const err = new GeminiResponseError({
    finishReason: "SAFETY",
    blockReason: null,
    rawText: "",
    cause: "response_blocked",
  });
  assertEquals(err.usage, null);
});

// REQ-130 FR-130-02: getThinkingBudget の挙動
Deno.test("getThinkingBudget: 未設定なら 0 (thinking 無効が既定)", () => {
  Deno.env.delete("GEMINI_THINKING_BUDGET");
  assertEquals(getThinkingBudget(), 0);
});

Deno.test("getThinkingBudget: 数値を文字列で指定すると number に変換", () => {
  Deno.env.set("GEMINI_THINKING_BUDGET", "128");
  try {
    assertEquals(getThinkingBudget(), 128);
  } finally {
    Deno.env.delete("GEMINI_THINKING_BUDGET");
  }
});

Deno.test("getThinkingBudget: 不正値 (NaN/負数) は 0 にフォールバック", () => {
  Deno.env.set("GEMINI_THINKING_BUDGET", "abc");
  try {
    assertEquals(getThinkingBudget(), 0);
  } finally {
    Deno.env.delete("GEMINI_THINKING_BUDGET");
  }
  Deno.env.set("GEMINI_THINKING_BUDGET", "-5");
  try {
    assertEquals(getThinkingBudget(), 0);
  } finally {
    Deno.env.delete("GEMINI_THINKING_BUDGET");
  }
});

Deno.test("getThinkingBudget: 0 を明示的に指定しても 0", () => {
  Deno.env.set("GEMINI_THINKING_BUDGET", "0");
  try {
    assertEquals(getThinkingBudget(), 0);
  } finally {
    Deno.env.delete("GEMINI_THINKING_BUDGET");
  }
});

// ===== aiDedup =====
Deno.test("aiDedup: DEDUP_ENABLED フラグが boolean としてエクスポートされている", () => {
  assertEquals(typeof DEDUP_ENABLED, "boolean");
});

Deno.test("aiDedup: hash が空の場合は { found: false } を返す", async () => {
  const supabase = {
    from() {
      throw new Error("クエリは発行されない想定");
    },
  };
  const audio = await findAudioDedup(supabase, null, "p1");
  assertEquals(audio.found, false);
  const audio2 = await findAudioDedup(supabase, "", "p1");
  assertEquals(audio2.found, false);
  const image = await findImageDedup(supabase, null, "p1");
  assertEquals(image.found, false);
  const image2 = await findImageDedup(supabase, [], "p1");
  assertEquals(image2.found, false);
});

Deno.test("aiDedup: クエリエラー時は found:false を返し非致命", async () => {
  const supabase = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        neq() {
          return this;
        },
        gte() {
          return this;
        },
        contains() {
          return this;
        },
        not() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return Promise.resolve({ data: null, error: { message: "db down" } });
        },
      };
    },
  };
  const r = await findAudioDedup(supabase, "somehash", "p1");
  assertEquals(r.found, false);
});

// ===== aiRateLimit =====
Deno.test("checkReanalysisRateLimit: count 取得失敗時は fail-closed (allowed=false)", async () => {
  const supabase = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        gte() {
          return Promise.resolve({ count: null, error: { message: "fail" } });
        },
      };
    },
  };
  const r = await checkReanalysisRateLimit(supabase, "p1", "analyze-image");
  assertEquals(r.allowed, false);
  assert(r.limit > 0);
  assertEquals(r.retryAfterSeconds, 86400);
});

Deno.test("checkReanalysisRateLimit: 上限未達なら allowed=true", async () => {
  const supabase = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        gte() {
          return Promise.resolve({ count: 0, error: null });
        },
      };
    },
  };
  const r = await checkReanalysisRateLimit(supabase, "p1", "analyze-image");
  assertEquals(r.allowed, true);
  assertEquals(r.current, 0);
});

// ===== REQ-212: caller 単位の reanalysis スロットル（インメモリ） =====
Deno.test("reanalysisCallerKey: user_id があれば user:<id>、無ければ IP フォールバック", () => {
  const reqCf = new Request("http://x", {
    headers: { "cf-connecting-ip": "203.0.113.7" },
  });
  assertEquals(reanalysisCallerKey("u1", reqCf), "user:u1");
  assertEquals(reanalysisCallerKey(null, reqCf), "ip:203.0.113.7");

  const reqXff = new Request("http://x", {
    headers: { "x-forwarded-for": "1.1.1.1, 203.0.113.8" },
  });
  // 偽装可能な先頭ではなくエッジ追記の末尾を採用する（extract_request_ip と同方針）。
  assertEquals(reanalysisCallerKey(undefined, reqXff), "ip:203.0.113.8");

  const reqNone = new Request("http://x");
  assertEquals(reanalysisCallerKey(null, reqNone), "ip:unknown");
});

Deno.test("checkReanalysisCallerRateLimit: 上限まで allowed=true、超過で allowed=false + retryAfter>0", () => {
  const key = `user:caller-test-${crypto.randomUUID()}`;
  const limit = Number(
    Deno.env.get("AI_REANALYSIS_CALLER_DAILY_LIMIT") ?? "20",
  );
  let last;
  for (let i = 0; i < limit; i++) {
    last = checkReanalysisCallerRateLimit(key);
    assertEquals(last.allowed, true);
  }
  assertEquals(last!.current, limit);

  // 上限到達後の次の呼び出しは拒否される。
  const over = checkReanalysisCallerRateLimit(key);
  assertEquals(over.allowed, false);
  assert(over.retryAfterSeconds > 0);
  assertEquals(over.limit, limit);
});

Deno.test("checkReanalysisCallerRateLimit: caller が違えばカウントは独立", () => {
  const a = `user:indep-a-${crypto.randomUUID()}`;
  const b = `user:indep-b-${crypto.randomUUID()}`;
  const ra = checkReanalysisCallerRateLimit(a);
  const rb = checkReanalysisCallerRateLimit(b);
  assertEquals(ra.current, 1);
  assertEquals(rb.current, 1);
});
