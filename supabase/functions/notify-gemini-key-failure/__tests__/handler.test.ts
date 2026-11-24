// REQ-126 FR-126-14: notify-gemini-key-failure Edge Function のハンドラユニットテスト
//
// テスト方針:
//   - globalThis.fetch をモックして以下を verify する:
//     * 直近 1 時間に gemini_auth が閾値未満 → 通知しない (skipped: below_threshold)
//     * 閾値以上だが 24h 以内に通知済み → 通知しない (skipped: already_notified)
//     * 閾値以上 + 未通知 → Resend に POST + admin_alerts に insert
//     * ADMIN_NOTIFY_EMAIL 未設定 → warn ログのみで fail-soft (skipped: no_admin_notify_email)
//     * RESEND_API_KEY 未設定 → 通知しないが skipped を返す
//   - メール本文中に redaction が効いていること (AIza... が出現しない)
//
// 注意: Supabase JS は内部で setTimeout を使う関係で sanitizeOps/Resources を false にする
//       (analyze-image/index.test.ts と同方針)。
//
// 実行: deno test --allow-env --allow-net --allow-read supabase/functions/notify-gemini-key-failure/

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_ANON_KEY", "test-anon");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
Deno.env.set("SITE_URL", "https://zaridasu.test");
Deno.env.set("GEMINI_AUTH_FAILURE_THRESHOLD", "3");
Deno.env.set("GEMINI_AUTH_NOTIFY_INTERVAL_HOURS", "24");

const { handleRequest } = await import("../index.ts");

function buildRequest(): Request {
  return new Request(
    "http://localhost/functions/notify-gemini-key-failure",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
}

interface MockOptions {
  countResponse?: {
    count?: number | null;
    error?: { message: string } | null;
    status?: number;
  };
  recentAlertsResponse?: {
    data?: unknown[];
    error?: { message: string } | null;
  };
  sampleLogsResponse?: {
    data?: unknown[];
  };
  insertResponse?: {
    error?: { message: string } | null;
    status?: number;
  };
  resendStatus?: number;
  resendError?: string;
}

function mockEnv(options: MockOptions = {}) {
  const originalFetch = globalThis.fetch;
  const resendCalls: { body: unknown }[] = [];
  const insertCalls: { body: unknown }[] = [];
  const countCalls: string[] = [];

  globalThis.fetch =
    (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
      const method = init?.method ??
        (input instanceof Request ? input.method : "GET");

      // ai_call_logs クエリ
      if (
        url.includes("/rest/v1/ai_call_logs") &&
        (method === "HEAD" || method === "GET")
      ) {
        const preferHeader = init?.headers
          ? new Headers(init.headers).get("prefer") ?? ""
          : "";
        if (preferHeader.includes("count=")) {
          countCalls.push(url);
          const count = options.countResponse?.count ?? 0;
          const err = options.countResponse?.error;
          if (err) {
            return new Response(JSON.stringify({ message: err.message }), {
              status: options.countResponse?.status ?? 500,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Content-Range": `0-0/${count}`,
            },
          });
        }
        // sample logs（count 取得ではない GET）
        return new Response(
          JSON.stringify(options.sampleLogsResponse?.data ?? []),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // admin_alerts 検索
      if (
        url.includes("/rest/v1/admin_alerts") &&
        (method === "GET" || method === "HEAD")
      ) {
        if (options.recentAlertsResponse?.error) {
          return new Response(
            JSON.stringify({
              message: options.recentAlertsResponse.error.message,
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify(options.recentAlertsResponse?.data ?? []),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // admin_alerts insert
      if (url.includes("/rest/v1/admin_alerts") && method === "POST") {
        insertCalls.push({
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        if (options.insertResponse?.error) {
          return new Response(
            JSON.stringify({
              message: options.insertResponse.error.message,
            }),
            {
              status: options.insertResponse.status ?? 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response(JSON.stringify([{}]), { status: 201 });
      }

      // Resend
      if (url === "https://api.resend.com/emails" && method === "POST") {
        resendCalls.push({
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        if ((options.resendStatus ?? 200) >= 400) {
          return new Response(options.resendError ?? "resend error", {
            status: options.resendStatus ?? 500,
          });
        }
        return new Response(JSON.stringify({ id: "msg_123" }), { status: 200 });
      }

      return new Response(`unhandled fetch: ${method} ${url}`, { status: 500 });
    }) as typeof fetch;

  return {
    resendCalls,
    insertCalls,
    countCalls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

Deno.test({
  name: "OPTIONS は CORS プリフライトとして 200",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const res = await handleRequest(
      new Request("http://localhost/functions/notify-gemini-key-failure", {
        method: "OPTIONS",
      }),
    );
    assertEquals(res.status, 200);
  },
});

Deno.test({
  name: "FR-126-14: ADMIN_NOTIFY_EMAIL 未設定は warn ログのみ (fail-soft)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const prev = Deno.env.get("ADMIN_NOTIFY_EMAIL");
    Deno.env.delete("ADMIN_NOTIFY_EMAIL");
    Deno.env.set("RESEND_API_KEY", "rs_test");
    const mock = mockEnv({ countResponse: { count: 99 } });
    try {
      const res = await handleRequest(buildRequest());
      assertEquals(res.status, 200);
      const json = await res.json();
      assertEquals(json.skipped, "no_admin_notify_email");
      assertEquals(mock.resendCalls.length, 0);
      assertEquals(mock.insertCalls.length, 0);
    } finally {
      mock.restore();
      if (prev !== undefined) Deno.env.set("ADMIN_NOTIFY_EMAIL", prev);
    }
  },
});

Deno.test({
  name: "FR-126-14: 直近 1 時間に gemini_auth が 3 件未満 → 通知しない",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    Deno.env.set("ADMIN_NOTIFY_EMAIL", "admin@example.com");
    Deno.env.set("RESEND_API_KEY", "rs_test");
    const mock = mockEnv({ countResponse: { count: 2 } });
    try {
      const res = await handleRequest(buildRequest());
      assertEquals(res.status, 200);
      const json = await res.json();
      assertEquals(json.skipped, "below_threshold");
      assertEquals(json.failure_count, 2);
      assertEquals(json.threshold, 3);
      assertEquals(mock.resendCalls.length, 0);
      assertEquals(mock.insertCalls.length, 0);
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name:
    "FR-126-14 / AC-126-08: 3 件以上だが 24h 以内に通知済み → 通知しない",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    Deno.env.set("ADMIN_NOTIFY_EMAIL", "admin@example.com");
    Deno.env.set("RESEND_API_KEY", "rs_test");
    const mock = mockEnv({
      countResponse: { count: 5 },
      recentAlertsResponse: {
        data: [
          {
            id: "a1",
            notified_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          },
        ],
      },
    });
    try {
      const res = await handleRequest(buildRequest());
      assertEquals(res.status, 200);
      const json = await res.json();
      assertEquals(json.skipped, "already_notified");
      assertEquals(mock.resendCalls.length, 0);
      assertEquals(mock.insertCalls.length, 0);
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name:
    "FR-126-14 / AC-126-07: 3 件以上 + 未通知 → Resend 送信 + admin_alerts insert",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    Deno.env.set("ADMIN_NOTIFY_EMAIL", "admin@example.com,ops@example.com");
    Deno.env.set("RESEND_API_KEY", "rs_test");
    const mock = mockEnv({
      countResponse: { count: 5 },
      recentAlertsResponse: { data: [] },
      sampleLogsResponse: {
        data: [
          {
            created_at: "2026-05-12T10:00:00Z",
            function_name: "analyze-image",
            error_message: "Gemini API エラー (400): API key not valid",
          },
        ],
      },
    });
    try {
      const res = await handleRequest(buildRequest());
      assertEquals(res.status, 200);
      const json = await res.json();
      assertEquals(json.sent, true);
      assertEquals(json.failure_count, 5);
      assertEquals(mock.resendCalls.length, 1);
      const resendBody = mock.resendCalls[0].body as {
        to: string[];
        subject: string;
        html: string;
      };
      assertEquals(resendBody.to.length, 2);
      assertEquals(resendBody.to[0], "admin@example.com");
      assertEquals(resendBody.to[1], "ops@example.com");
      assert(resendBody.subject.includes("Gemini"));
      assertEquals(mock.insertCalls.length, 1);
      const insertBody = mock.insertCalls[0].body as {
        alert_type: string;
        notified_at: string;
        metadata: Record<string, unknown>;
      };
      assertEquals(insertBody.alert_type, "gemini_key_failure");
      assert(typeof insertBody.notified_at === "string");
      assertEquals(insertBody.metadata.failure_count, 5);
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name: "AC-126-10: メール本文中の API key 文字列は redaction されている",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    Deno.env.set("ADMIN_NOTIFY_EMAIL", "admin@example.com");
    Deno.env.set("RESEND_API_KEY", "rs_test");
    const mock = mockEnv({
      countResponse: { count: 4 },
      recentAlertsResponse: { data: [] },
      sampleLogsResponse: {
        data: [
          {
            created_at: "2026-05-12T10:00:00Z",
            function_name: "analyze-image",
            error_message:
              "bad URL https://generativelanguage.googleapis.com/v1beta/models/x?key=AIzaSyXXXXSECRET",
          },
        ],
      },
    });
    try {
      const res = await handleRequest(buildRequest());
      assertEquals(res.status, 200);
      assertEquals(mock.resendCalls.length, 1);
      const html = (mock.resendCalls[0].body as { html: string }).html;
      // 生 API キー文字列が混入していない
      assert(!html.includes("AIzaSyXXXXSECRET"), `生キーが含まれている: ${html}`);
      assert(html.includes("key=[REDACTED]"));
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name: "FR-126-14: RESEND_API_KEY 未設定 → 通知しないが fail-soft 200",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    Deno.env.set("ADMIN_NOTIFY_EMAIL", "admin@example.com");
    Deno.env.delete("RESEND_API_KEY");
    const mock = mockEnv({
      countResponse: { count: 9 },
      recentAlertsResponse: { data: [] },
    });
    try {
      const res = await handleRequest(buildRequest());
      assertEquals(res.status, 200);
      const json = await res.json();
      assertEquals(json.skipped, "no_resend_key");
      assertEquals(mock.resendCalls.length, 0);
      assertEquals(mock.insertCalls.length, 0);
    } finally {
      mock.restore();
    }
  },
});


// ─────────────────────────────────────────────────────────────────────────────
// REQ-270 FR-270-02 / AC-03: WEBHOOK_SECRET 設定時、x-webhook-secret 欠落/不一致は 401
// ─────────────────────────────────────────────────────────────────────────────
Deno.test("REQ-270: WEBHOOK_SECRET 設定時、ヘッダ欠落は 401 unauthorized", async () => {
  Deno.env.set("WEBHOOK_SECRET", "test-webhook-secret");
  try {
    const res = await handleRequest(buildRequest());
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "unauthorized");
  } finally {
    Deno.env.delete("WEBHOOK_SECRET");
  }
});
