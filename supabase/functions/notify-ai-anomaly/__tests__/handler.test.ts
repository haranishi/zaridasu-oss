// REQ-215 FR-215-07(b) / AC-07: notify-ai-anomaly Edge Function のハンドラユニットテスト
//
// テスト方針（notify-gemini-key-failure/__tests__/handler.test.ts と同方針）:
//   - globalThis.fetch をモックして detect_ai_anomalies RPC / admin_alerts / Resend を差し替え:
//     * anomaly=false → 通知しない (skipped: no_anomaly)
//     * anomaly=true だが ADMIN_NOTIFY_EMAIL 未設定 → fail-soft (skipped: no_admin_notify_email)
//     * anomaly=true + 通知間隔内に通知済み → 通知しない (skipped: already_notified)
//     * anomaly=true + 未通知 → Resend に POST + admin_alerts(alert_type='ai_anomaly') insert
//     * RPC エラー → fail-soft (skipped: rpc_failed)
//     * RESEND_API_KEY 未設定 → 通知しないが fail-soft 200 (skipped: no_resend_key)
//   - メール本文に万一混入した API キー文字列が redaction されること
//
// 注意: Supabase JS は内部で setTimeout を使うため sanitizeOps/Resources を false にする。
//
// 実行: deno test --allow-env --allow-net --allow-read \
//   --lock=supabase/functions/deno.lock --cached-only --no-check \
//   supabase/functions/notify-ai-anomaly/

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_ANON_KEY", "test-anon");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
Deno.env.set("SITE_URL", "https://zaridasu.test");
Deno.env.set("AI_ANOMALY_NOTIFY_INTERVAL_HOURS", "6");

const { handleRequest } = await import("../index.ts");

function buildRequest(): Request {
  return new Request("http://localhost/functions/notify-ai-anomaly", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

interface AnomalyMetrics {
  total_calls?: number;
  analyzed_posts?: number;
  auto_approved?: number;
  auto_approve_rate?: number | null;
  max_user_calls?: number;
  top_user_id?: string | null;
  max_ip_posts?: number;
}

interface MockOptions {
  rpcResult?: {
    anomaly: boolean;
    signals: string[];
    window_minutes?: number;
    metrics?: AnomalyMetrics;
  } | null;
  rpcError?: { message: string };
  recentAlerts?: unknown[];
  recentAlertsError?: { message: string };
  resendStatus?: number;
  insertError?: { message: string };
}

function mockEnv(options: MockOptions = {}) {
  const originalFetch = globalThis.fetch;
  const resendCalls: { body: unknown }[] = [];
  const insertCalls: { body: unknown }[] = [];
  const rpcCalls: { body: unknown }[] = [];

  globalThis.fetch =
    (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
      const method = init?.method ??
        (input instanceof Request ? input.method : "GET");

      // detect_ai_anomalies RPC
      if (url.includes("/rest/v1/rpc/detect_ai_anomalies")) {
        rpcCalls.push({
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        if (options.rpcError) {
          return new Response(
            JSON.stringify({ message: options.rpcError.message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify(options.rpcResult ?? null),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // admin_alerts 検索（GET/HEAD）
      if (
        url.includes("/rest/v1/admin_alerts") &&
        (method === "GET" || method === "HEAD")
      ) {
        if (options.recentAlertsError) {
          return new Response(
            JSON.stringify({ message: options.recentAlertsError.message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify(options.recentAlerts ?? []),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // admin_alerts insert（POST）
      if (url.includes("/rest/v1/admin_alerts") && method === "POST") {
        insertCalls.push({
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        if (options.insertError) {
          return new Response(
            JSON.stringify({ message: options.insertError.message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
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
          return new Response("resend error", {
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
    rpcCalls,
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
      new Request("http://localhost/functions/notify-ai-anomaly", {
        method: "OPTIONS",
      }),
    );
    assertEquals(res.status, 200);
  },
});

Deno.test({
  name: "FR-215-07(b): anomaly=false なら通知しない (no_anomaly)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    Deno.env.set("ADMIN_NOTIFY_EMAIL", "admin@example.com");
    Deno.env.set("RESEND_API_KEY", "rs_test");
    const mock = mockEnv({
      rpcResult: { anomaly: false, signals: [], metrics: {} },
    });
    try {
      const res = await handleRequest(buildRequest());
      assertEquals(res.status, 200);
      const json = await res.json();
      assertEquals(json.skipped, "no_anomaly");
      assertEquals(mock.resendCalls.length, 0);
      assertEquals(mock.insertCalls.length, 0);
      // RPC には env 由来のしきい値が渡る。
      assertEquals(mock.rpcCalls.length, 1);
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name: "FR-215-07(b): RPC エラーは fail-soft (rpc_failed)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    Deno.env.set("ADMIN_NOTIFY_EMAIL", "admin@example.com");
    Deno.env.set("RESEND_API_KEY", "rs_test");
    const mock = mockEnv({ rpcError: { message: "boom" } });
    try {
      const res = await handleRequest(buildRequest());
      assertEquals(res.status, 200);
      const json = await res.json();
      assertEquals(json.skipped, "rpc_failed");
      assertEquals(mock.resendCalls.length, 0);
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name: "FR-215-07(b): anomaly だが ADMIN_NOTIFY_EMAIL 未設定は fail-soft",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const prev = Deno.env.get("ADMIN_NOTIFY_EMAIL");
    Deno.env.delete("ADMIN_NOTIFY_EMAIL");
    Deno.env.set("RESEND_API_KEY", "rs_test");
    const mock = mockEnv({
      rpcResult: {
        anomaly: true,
        signals: ["high_auto_approve_rate"],
        metrics: { auto_approve_rate: 0.97, analyzed_posts: 40 },
      },
    });
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
  name: "AC-07: anomaly + 通知間隔内に通知済み → 通知しない (already_notified)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    Deno.env.set("ADMIN_NOTIFY_EMAIL", "admin@example.com");
    Deno.env.set("RESEND_API_KEY", "rs_test");
    const mock = mockEnv({
      rpcResult: {
        anomaly: true,
        signals: ["user_call_spike"],
        metrics: { max_user_calls: 99 },
      },
      recentAlerts: [
        {
          id: "a1",
          notified_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        },
      ],
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
  name: "AC-07: anomaly + 未通知 → Resend 送信 + admin_alerts(ai_anomaly) insert",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    Deno.env.set("ADMIN_NOTIFY_EMAIL", "admin@example.com,ops@example.com");
    Deno.env.set("RESEND_API_KEY", "rs_test");
    const mock = mockEnv({
      rpcResult: {
        anomaly: true,
        signals: ["high_auto_approve_rate", "high_call_volume"],
        window_minutes: 60,
        metrics: {
          total_calls: 800,
          analyzed_posts: 50,
          auto_approved: 49,
          auto_approve_rate: 0.98,
          max_user_calls: 12,
          max_ip_posts: 3,
        },
      },
      recentAlerts: [],
    });
    try {
      const res = await handleRequest(buildRequest());
      assertEquals(res.status, 200);
      const json = await res.json();
      assertEquals(json.sent, true);
      assertEquals(mock.resendCalls.length, 1);
      const resendBody = mock.resendCalls[0].body as {
        to: string[];
        subject: string;
        html: string;
      };
      assertEquals(resendBody.to.length, 2);
      assert(resendBody.subject.includes("AI"));
      // 本文に率と signal ラベルが入る。
      assert(resendBody.html.includes("98%"));
      assertEquals(mock.insertCalls.length, 1);
      const insertBody = mock.insertCalls[0].body as {
        alert_type: string;
        notified_at: string;
        metadata: Record<string, unknown>;
      };
      assertEquals(insertBody.alert_type, "ai_anomaly");
      assert(typeof insertBody.notified_at === "string");
      assertEquals(
        (insertBody.metadata.signals as string[]).length,
        2,
      );
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name: "AC-07: RESEND_API_KEY 未設定 → 通知しないが fail-soft 200",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    Deno.env.set("ADMIN_NOTIFY_EMAIL", "admin@example.com");
    Deno.env.delete("RESEND_API_KEY");
    const mock = mockEnv({
      rpcResult: {
        anomaly: true,
        signals: ["ip_call_spike"],
        metrics: { max_ip_posts: 80 },
      },
      recentAlerts: [],
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

Deno.test({
  name: "NFR-215-03: メール本文中の API キー文字列は redaction される",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    Deno.env.set("ADMIN_NOTIFY_EMAIL", "admin@example.com");
    Deno.env.set("RESEND_API_KEY", "rs_test");
    // RPC が返した metric に万一鍵様の文字列が混ざっても本文 redaction で伏字化されることを確認
    // （二重防御 / NFR-215-03）。top_user_id は通常 uuid だが、ここでは鍵様文字列を流し込む。
    const mock = mockEnv({
      rpcResult: {
        anomaly: true,
        signals: ["high_call_volume"],
        metrics: {
          total_calls: 900,
          top_user_id: "https://x?key=AIzaSyLEAKSECRET",
        },
      },
      recentAlerts: [],
    });
    try {
      const res = await handleRequest(buildRequest());
      assertEquals(res.status, 200);
      assertEquals(mock.resendCalls.length, 1);
      const html = (mock.resendCalls[0].body as { html: string }).html;
      assert(!html.includes("AIzaSyLEAKSECRET"), `生キーが含まれている: ${html}`);
      assert(html.includes("key=[REDACTED]"));
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

// REQ-270 FR-270-03 / AC-04: no_anomaly 応答に metrics / signals / top_user_id を含めない
Deno.test({
  name: "REQ-270: no_anomaly 応答が内部メトリクスを露出しない",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input: URL | RequestInfo, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/rest/v1/rpc/detect_ai_anomalies")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              anomaly: false,
              signals: [],
              metrics: { top_user_id: "secret-uuid", total_calls: 1 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    };
    try {
      const res = await handleRequest(buildRequest());
      assertEquals(res.status, 200);
      const text = await res.text();
      const body = JSON.parse(text);
      assertEquals(body.skipped, "no_anomaly");
      assert(!("metrics" in body));
      assert(!("signals" in body));
      assert(!text.includes("secret-uuid"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
});
