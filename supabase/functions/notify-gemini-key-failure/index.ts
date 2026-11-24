/**
 * notify-gemini-key-failure Edge Function (REQ-126 FR-126-09)
 *
 * 直近 1 時間に `ai_call_logs.error_kind='gemini_auth'` が
 * `GEMINI_AUTH_FAILURE_THRESHOLD` (既定 3) 件以上発生していて、
 * かつ過去 `GEMINI_AUTH_NOTIFY_INTERVAL_HOURS` (既定 24) 時間内に
 * 同種の通知を送っていなければ、`ADMIN_NOTIFY_EMAIL` 宛に Resend で送信する。
 *
 * 設計判断:
 *   - 通知済みフラグは admin_alerts.notified_at で管理（重複抑制）。
 *   - error_message を本文に貼る際は `redactAiErrorMessage` を必ず通す。
 *     ペイロード経由で API キー（AIza...）の漏えいを防ぐ。
 *   - `ADMIN_NOTIFY_EMAIL` 未設定 / `RESEND_API_KEY` 未設定は warn ログのみ
 *     を出して 200 fail-soft で返す（pg_cron で定期実行する想定なので失敗扱いにしない）。
 *
 * トリガ想定: pg_cron で 5 分ごと / または ai_call_logs INSERT webhook。
 *
 * 【必要な環境変数（Supabase Dashboard → Settings → Edge Functions → Secrets）】
 *   RESEND_API_KEY                       : Resend API キー
 *   ADMIN_NOTIFY_EMAIL                   : アラート送信先（カンマ区切り可）
 *   GEMINI_AUTH_FAILURE_THRESHOLD        : 閾値（既定 3）
 *   GEMINI_AUTH_NOTIFY_INTERVAL_HOURS    : 同種通知の最小間隔（既定 24）
 *   SITE_URL                             : 本文に貼る管理画面 URL
 *   SUPABASE_URL                         : 自動設定
 *   SUPABASE_SERVICE_ROLE_KEY            : 自動設定
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { redactAiErrorMessage } from "../_shared/aiLogging.ts";
import {
  requireWebhookSecret,
  WebhookAuthError,
} from "../_shared/webhookAuth.ts";
import { createServiceClient } from '../_shared/supabaseAdmin.ts'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const siteUrl = Deno.env.get("SITE_URL") ?? "https://zaridasu.com";
// REQ-219 FR-219-05: 送信元 From は環境変数で一元化する（既定は認証済みドメイン）。
// 送信ドメイン（zarigani-das.com）変更時は DNS の SPF/DKIM/DMARC と一括で整合させる。
// 詳細は docs/runbooks/email-authentication.md を参照。
const fromEmail = Deno.env.get("NOTIFY_FROM_EMAIL") ??
  "ザリダス <noreply@zarigani-das.com>";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseEnvNumber(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseEmailRecipients(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // REQ-270 FR-270-02: DB トリガ経由のみ叩かれる前提なので webhook secret を必須化する
  // （未設定は grace period。他の通知系関数と同型）。
  try {
    requireWebhookSecret(req);
  } catch (e) {
    if (e instanceof WebhookAuthError) {
      console.warn("[notify-gemini-key-failure] webhook secret mismatch");
      return jsonResponse(401, { error: "unauthorized" });
    }
    throw e;
  }

  try {
    const threshold = parseEnvNumber("GEMINI_AUTH_FAILURE_THRESHOLD", 3);
    const intervalHours = parseEnvNumber(
      "GEMINI_AUTH_NOTIFY_INTERVAL_HOURS",
      24,
    );
    const recipients = parseEmailRecipients(Deno.env.get("ADMIN_NOTIFY_EMAIL"));
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";

    if (recipients.length === 0) {
      // ADMIN_NOTIFY_EMAIL 未設定は明示的に warn のみ（fail-soft）。
      console.warn(
        "[notify-gemini-key-failure] ADMIN_NOTIFY_EMAIL が未設定のため通知を送信しません",
      );
      return jsonResponse(200, { skipped: "no_admin_notify_email" });
    }

    const supabase = createServiceClient();

    // 1. 直近 1 時間の gemini_auth 件数を取得
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from("ai_call_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "error")
      .eq("error_kind", "gemini_auth")
      .gte("created_at", oneHourAgo);

    if (countError) {
      console.error("[notify-gemini-key-failure] count error:", countError);
      return jsonResponse(500, { error: "count_failed" });
    }

    const failureCount = count ?? 0;
    if (failureCount < threshold) {
      return jsonResponse(200, {
        skipped: "below_threshold",
        failure_count: failureCount,
        threshold,
      });
    }

    // 2. 過去 intervalHours 内に同種通知を送っていないか確認
    const intervalCutoff =
      new Date(Date.now() - intervalHours * 60 * 60 * 1000).toISOString();
    const { data: recentAlerts, error: alertsError } = await supabase
      .from("admin_alerts")
      .select("id, notified_at")
      .eq("alert_type", "gemini_key_failure")
      .not("notified_at", "is", null)
      .gte("notified_at", intervalCutoff)
      .order("notified_at", { ascending: false })
      .limit(1);

    if (alertsError) {
      console.error(
        "[notify-gemini-key-failure] admin_alerts query error:",
        alertsError,
      );
      return jsonResponse(500, { error: "alerts_query_failed" });
    }

    if (recentAlerts && recentAlerts.length > 0) {
      return jsonResponse(200, {
        skipped: "already_notified",
        failure_count: failureCount,
        last_notified_at: recentAlerts[0].notified_at,
      });
    }

    // 3. RESEND_API_KEY が未設定なら fail-soft（admin_alerts への insert もしない）
    if (!resendApiKey) {
      console.warn(
        "[notify-gemini-key-failure] RESEND_API_KEY が未設定のため通知を送信しません",
      );
      return jsonResponse(200, {
        skipped: "no_resend_key",
        failure_count: failureCount,
      });
    }

    // 4. 直近のエラーメッセージサンプル（redaction 必須）を取得して本文に添える
    const { data: sampleLogs } = await supabase
      .from("ai_call_logs")
      .select("created_at, function_name, error_message")
      .eq("status", "error")
      .eq("error_kind", "gemini_auth")
      .gte("created_at", oneHourAgo)
      .order("created_at", { ascending: false })
      .limit(3);

    const samples = Array.isArray(sampleLogs) ? sampleLogs : [];
    const samplesHtml = samples.length === 0
      ? "<p style=\"font-size:12px;color:#9ca3af;\">直近サンプルなし</p>"
      : `<ul style="font-size:12px;color:#4b5563;line-height:1.6;">${
        samples.map((s) =>
          `<li><strong>${escapeHtml(s.function_name ?? "")}</strong> @ ${
            escapeHtml(s.created_at ?? "")
          }<br/><code style="word-break:break-all;">${
            // REQ-126 NFR-126-01: 二重防御として再 redaction を必ず通す
            escapeHtml(redactAiErrorMessage(String(s.error_message ?? "")))
          }</code></li>`
        ).join("")
      }</ul>`;

    const runbookUrl =
      "https://github.com/your-org/kenkyuu-app/blob/main/docs/runbooks/gemini-key-rotation.md";
    const adminUrl = `${siteUrl}/admin/posts`;

    const subject = "🦞 [ザリダス] Gemini API キー異常を検知しました";
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
        <h2 style="color:#dc2626;margin-bottom:4px;">⚠️ Gemini API キー異常検知</h2>
        <p style="color:#374151;font-size:14px;">
          直近 1 時間で <strong>${failureCount}</strong> 件の <code>gemini_auth</code> エラーを観測しました
          （閾値: ${threshold}）。
        </p>
        <p style="color:#374151;font-size:14px;">
          GEMINI_API_KEY が失効・無効化している可能性があります。
          下記 Runbook に従ってローテーションしてください。
        </p>
        <p style="margin:16px 0;">
          <a href="${escapeHtml(runbookUrl)}"
             style="display:inline-block;background:#dc2626;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;">
            Runbook を開く
          </a>
          <a href="${escapeHtml(adminUrl)}"
             style="display:inline-block;background:#6b7280;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;margin-left:8px;">
            管理画面を開く
          </a>
        </p>
        <h3 style="margin-top:20px;font-size:14px;color:#374151;">最近のエラーサンプル</h3>
        ${samplesHtml}
        <p style="margin-top:24px;font-size:12px;color:#9ca3af;">
          このメールは notify-gemini-key-failure Edge Function が自動送信しています。
          通知間隔: ${intervalHours} 時間。
        </p>
      </div>
    `;

    // 5. Resend にメール送信（既存 notify-post-status の呼び出しパターンを踏襲）
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipients,
        subject,
        html,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text().catch(() => "");
      console.error(
        "[notify-gemini-key-failure] Resend エラー:",
        err.slice(0, 300),
      );
      return jsonResponse(500, { error: "resend_failed" });
    }

    // 6. admin_alerts に notified_at 付きで insert（重複抑制の状態保持）
    const { error: insertError } = await supabase
      .from("admin_alerts")
      .insert({
        alert_type: "gemini_key_failure",
        triggered_at: new Date().toISOString(),
        notified_at: new Date().toISOString(),
        metadata: {
          failure_count: failureCount,
          threshold,
          interval_hours: intervalHours,
          window: "last_1_hour",
          recipients_count: recipients.length,
        },
      });

    if (insertError) {
      console.error(
        "[notify-gemini-key-failure] admin_alerts insert error:",
        insertError,
      );
      // メールは送れているので 200 で返すが、エラー内容は付与しておく。
      return jsonResponse(200, {
        sent: true,
        failure_count: failureCount,
        warning: "admin_alerts_insert_failed",
      });
    }

    console.log(
      `[notify-gemini-key-failure] sent → ${recipients.length} recipients, failure_count=${failureCount}`,
    );
    return jsonResponse(200, {
      sent: true,
      failure_count: failureCount,
      threshold,
      recipients_count: recipients.length,
    });
  } catch (e) {
    // REQ-270 FR-270-03: 内部例外メッセージを呼び出し元へ返さない（詳細はログのみ）。
    console.error(
      "[notify-gemini-key-failure] エラー:",
      redactAiErrorMessage(e instanceof Error ? e.message : String(e)),
    );
    return jsonResponse(500, { error: "internal_error" });
  }
}

if (import.meta.main) {
  serve(handleRequest);
}
