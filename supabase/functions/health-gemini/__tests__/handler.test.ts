// REQ-126 FR-126-13: health-gemini Edge Function のハンドラユニットテスト
//
// テスト方針:
//   - globalThis.fetch をモックして以下をすべて分岐ごとに verify する:
//     * 非 admin の JWT → 403
//     * admin かつ Gemini が 200 → { ok: true, latency_ms: number }
//     * admin かつ Gemini が 400 → { ok: false, status: 400, error_kind: 'gemini_auth' }
//   - ai_call_logs.insert が **呼ばれないこと** を verify する (REQ-126: ヘルスチェックでログを汚さない)
//   - OPTIONS は CORS プリフライトとして 200 を返す
//   - Authorization 未設定は 401
//
// 注意: Supabase JS は内部で setTimeout を使う関係で sanitizeOps/Resources を false にする
//       (analyze-image/index.test.ts と同方針)。
//
// 実行:
//   deno test --allow-env --allow-net --allow-read supabase/functions/health-gemini/

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_ANON_KEY", "test-anon");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-key");
Deno.env.set("GEMINI_API_KEY", "AIzaSyTEST");

const { handleRequest } = await import("../index.ts");

function buildRequest(opts: {
  method?: string;
  authHeader?: string;
} = {}): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.authHeader !== undefined) {
    headers["Authorization"] = opts.authHeader;
  }
  return new Request("http://localhost/functions/health-gemini", {
    method: opts.method ?? "POST",
    headers,
  });
}

interface MockOptions {
  user?: { id: string; app_metadata?: Record<string, unknown> } | null;
  authError?: { message: string } | null;
  geminiStatus?: number;
  geminiErrorText?: string;
}

function mockEnv(options: MockOptions = {}) {
  const originalFetch = globalThis.fetch;
  const aiLogCalls: unknown[] = [];
  const geminiCalls: { url: string; init?: RequestInit }[] = [];

  globalThis.fetch =
    (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
      const method = init?.method ??
        (input instanceof Request ? input.method : "GET");

      if (url.startsWith("http://localhost:54321/auth/v1/user")) {
        if (options.authError || options.user === null) {
          return new Response(
            JSON.stringify({ msg: options.authError?.message ?? "no user" }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response(
          JSON.stringify(
            options.user ?? { id: "u1", app_metadata: { role: "admin" } },
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/rest/v1/ai_call_logs") && method === "POST") {
        aiLogCalls.push(init?.body ? JSON.parse(String(init.body)) : null);
        return new Response(JSON.stringify([{}]), { status: 201 });
      }

      if (url.startsWith("https://generativelanguage.googleapis.com/")) {
        geminiCalls.push({ url, init });
        if ((options.geminiStatus ?? 200) >= 400) {
          return new Response(options.geminiErrorText ?? "server error", {
            status: options.geminiStatus ?? 500,
          });
        }
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "ok" }] } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(`unhandled fetch: ${method} ${url}`, { status: 500 });
    }) as typeof fetch;

  return {
    aiLogCalls,
    geminiCalls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

Deno.test({
  name: "OPTIONS は CORS プリフライトとして 200 を返す",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const res = await handleRequest(buildRequest({ method: "OPTIONS" }));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("access-control-allow-origin"), "*");
  },
});

Deno.test({
  name: "Authorization 無しのリクエストは 401",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const res = await handleRequest(buildRequest({}));
    assertEquals(res.status, 401);
    const json = await res.json();
    assertEquals(json.error, "Unauthorized");
  },
});

Deno.test({
  name: "FR-126-13: 非 admin の JWT は 403 Forbidden",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const mock = mockEnv({
      user: { id: "u-normal", app_metadata: { role: "user" } },
    });
    try {
      const res = await handleRequest(
        buildRequest({ authHeader: "Bearer user-jwt" }),
      );
      assertEquals(res.status, 403);
      const json = await res.json();
      assertEquals(json.error, "Forbidden");
      assertEquals(mock.aiLogCalls.length, 0);
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name: "FR-126-13: app_metadata 未設定の JWT も 403",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const mock = mockEnv({ user: { id: "u-noroleinfo" } });
    try {
      const res = await handleRequest(
        buildRequest({ authHeader: "Bearer no-role-jwt" }),
      );
      assertEquals(res.status, 403);
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name: "FR-126-13: admin + Gemini 200 → { ok: true, latency_ms: number }",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const mock = mockEnv({
      user: { id: "admin-1", app_metadata: { role: "admin" } },
      geminiStatus: 200,
    });
    try {
      const res = await handleRequest(
        buildRequest({ authHeader: "Bearer admin-jwt" }),
      );
      assertEquals(res.status, 200);
      const json = await res.json();
      assertEquals(json.ok, true);
      assert(typeof json.model === "string");
      assert(typeof json.latency_ms === "number");
      // REQ-126: ai_call_logs に insert されない
      assertEquals(mock.aiLogCalls.length, 0);
      // Gemini への呼び出しは 1 回
      assertEquals(mock.geminiCalls.length, 1);
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name:
    "FR-126-13: admin + Gemini 400 → { ok: false, error_kind: 'gemini_auth' }",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const mock = mockEnv({
      user: { id: "admin-1", app_metadata: { role: "admin" } },
      geminiStatus: 400,
      geminiErrorText: "API key not valid. Please pass a valid API key.",
    });
    try {
      const res = await handleRequest(
        buildRequest({ authHeader: "Bearer admin-jwt" }),
      );
      assertEquals(res.status, 200);
      const json = await res.json();
      assertEquals(json.ok, false);
      assertEquals(json.status, 400);
      assertEquals(json.error_kind, "gemini_auth");
      assert(typeof json.message === "string");
      assertEquals(mock.aiLogCalls.length, 0);
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name:
    "FR-126-13: admin + Gemini 503 → { ok: false, error_kind: 'gemini_transient' }",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const mock = mockEnv({
      user: { id: "admin-1", app_metadata: { role: "admin" } },
      geminiStatus: 503,
      geminiErrorText: "Service Unavailable",
    });
    try {
      const res = await handleRequest(
        buildRequest({ authHeader: "Bearer admin-jwt" }),
      );
      assertEquals(res.status, 200);
      const json = await res.json();
      assertEquals(json.ok, false);
      assertEquals(json.status, 503);
      assertEquals(json.error_kind, "gemini_transient");
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name: "admin + GEMINI_API_KEY 未設定 → { ok: false, error_kind: 'gemini_auth' }",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    Deno.env.set("GEMINI_API_KEY", "");
    const mock = mockEnv({
      user: { id: "admin-1", app_metadata: { role: "admin" } },
    });
    try {
      const res = await handleRequest(
        buildRequest({ authHeader: "Bearer admin-jwt" }),
      );
      assertEquals(res.status, 200);
      const json = await res.json();
      assertEquals(json.ok, false);
      assertEquals(json.error_kind, "gemini_auth");
      // Gemini への呼び出しは行われない
      assertEquals(mock.geminiCalls.length, 0);
    } finally {
      mock.restore();
      Deno.env.set("GEMINI_API_KEY", "AIzaSyTEST");
    }
  },
});

Deno.test({
  name: "auth.getUser がエラーを返したら 401",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const mock = mockEnv({ authError: { message: "invalid jwt" } });
    try {
      const res = await handleRequest(
        buildRequest({ authHeader: "Bearer bogus" }),
      );
      assertEquals(res.status, 401);
    } finally {
      mock.restore();
    }
  },
});
