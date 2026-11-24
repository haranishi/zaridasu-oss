/**
 * health-gemini Edge Function (REQ-126 FR-126-07)
 *
 * GEMINI_API_KEY が有効か / モデルが生きているかを、最小コストで能動的に検証する
 * admin 限定の軽量 ping エンドポイント。
 *
 * - 認証: Authorization ヘッダーに含まれる JWT を verify し、
 *   `app_metadata.role === 'admin'` のみ通す（service role に頼らない）。
 * - Gemini 呼び出し: `gemini-2.5-flash-lite` に `maxOutputTokens: 1` で
 *   テキスト "ok" を投げる。コスト ≒ ¥0.01/回 を目安。
 * - ai_call_logs には記録しない: ヘルスチェックの試行がコスト集計や
 *   gemini_auth カウント（バナー / 通知用）に混入しないようにする。
 *
 * レスポンス形式:
 *   200 OK  → { ok: true,  model: 'gemini-2.5-flash-lite', latency_ms: 234 }
 *   200 OK  → { ok: false, status: 400, error_kind: 'gemini_auth', message: 'API key not valid' }
 *   401     → { error: 'Unauthorized' }     // JWT 無効 / 取得失敗
 *   403     → { error: 'Forbidden' }        // 非 admin
 *
 * 【必要な環境変数】
 *   GEMINI_API_KEY  : 検証対象キー（analyze-image/audio と共通）
 *   SUPABASE_URL    : 自動設定
 *   SUPABASE_ANON_KEY : 自動設定 (auth.getUser 用)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  classifyAiError,
  GeminiApiError,
  getThinkingBudget,
  redactAiErrorMessage,
  truncateAiErrorMessage,
} from "../_shared/aiLogging.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// REQ-076 と同じ既定モデル。analyze-image/audio とずれないようにしておく。
const GEMINI_MODEL = Deno.env.get("GEMINI_HEALTH_MODEL") ??
  Deno.env.get("GEMINI_IMAGE_MODEL") ??
  "gemini-2.5-flash-lite";

function getGeminiApiKey(): string {
  return Deno.env.get("GEMINI_API_KEY") ?? "";
}

function getGeminiEndpoint(): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${getGeminiApiKey()}`;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Gemini に最小プロンプトを 1 リクエスト投げ、結果を { ok, latency_ms } に整形する。
 * ai_call_logs には書き込まない（呼び出し側で logAiCall を呼ばない設計）。
 */
async function pingGemini(): Promise<
  | { ok: true; model: string; latency_ms: number }
  | {
    ok: false;
    status: number;
    error_kind: string;
    message: string;
    model: string;
    latency_ms: number;
  }
> {
  const startedAt = Date.now();
  try {
    const res = await fetch(getGeminiEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "ok" }] }],
        // REQ-130 FR-130-01: thinkingBudget を明示しないと
        //   gemini-2.5-flash の内部 reasoning が maxOutputTokens=1 を踏み潰し、
        //   キーが有効でも MAX_TOKENS で false negative になり得る。
        generationConfig: {
          maxOutputTokens: 1,
          temperature: 0,
          thinkingConfig: { thinkingBudget: getThinkingBudget() },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const latencyMs = Date.now() - startedAt;
    if (!res.ok) {
      const errBody = (await res.text().catch(() => "")).slice(0, 300);
      const err = new GeminiApiError(res.status, errBody);
      return {
        ok: false,
        status: res.status,
        error_kind: classifyAiError(err),
        message: truncateAiErrorMessage(err.message),
        model: GEMINI_MODEL,
        latency_ms: latencyMs,
      };
    }
    // 成功時はレスポンス body を読み捨て（JSON で来るが値は不要）。
    await res.json().catch(() => null);
    return { ok: true, model: GEMINI_MODEL, latency_ms: latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - startedAt;
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 0,
      error_kind: classifyAiError(e),
      message: redactAiErrorMessage(message),
      model: GEMINI_MODEL,
      latency_ms: latencyMs,
    };
  }
}

/**
 * Authorization: Bearer <jwt> をパースし、Supabase Auth で user を取得して
 * `app_metadata.role === 'admin'` を確認する。
 */
async function verifyAdmin(
  authHeader: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const token = authHeader.replace(/^\s*Bearer\s+/i, "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !anonKey) {
    // 設定不備は 500 ではなく 401 として返す（攻撃面を増やさない）。
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  try {
    const supabase = createClient(supabaseUrl, anonKey);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return { ok: false, status: 401, error: "Unauthorized" };
    }
    const role =
      (data.user.app_metadata as { role?: string } | undefined)?.role;
    if (role !== "admin") {
      return { ok: false, status: 403, error: "Forbidden" };
    }
    return { ok: true };
  } catch (_e) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  const authHeader = req.headers.get("Authorization") ??
    req.headers.get("authorization") ?? "";
  const verified = await verifyAdmin(authHeader);
  if (!verified.ok) {
    return jsonResponse(verified.status, { error: verified.error });
  }

  if (!getGeminiApiKey()) {
    // キー未設定は明確な失敗として返す（admin にだけ晒すので情報漏えいではない）。
    return jsonResponse(200, {
      ok: false,
      status: 0,
      error_kind: "gemini_auth",
      message: "GEMINI_API_KEY が設定されていません",
      model: GEMINI_MODEL,
      latency_ms: 0,
    });
  }

  const result = await pingGemini();
  return jsonResponse(200, result);
}

if (import.meta.main) {
  serve(handleRequest);
}
