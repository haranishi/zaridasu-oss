/**
 * notify-ai-anomaly Edge Function (REQ-215 FR-215-07(b) / AC-07)
 *
 * ザリダスは「ユーザー投稿を AI が人手レビュー無しで自動承認/却下する」点が設計の肝。
 * その権威化された自動判定の**濫用/暴走**（異常に高い auto-approve 率・単一ユーザー/IP からの
 * AI 呼び出し集中・窓内 AI 呼び出し総数の急増）を、既存 ai_call_logs / posts を `detect_ai_anomalies`
 * RPC で定期集計（pg_cron 起動）して検知し、閾値超過時に `ADMIN_NOTIFY_EMAIL` 宛へ Resend で通知する。
 *
 * 設計判断（notify-gemini-key-failure の作法を踏襲）:
 *   - 集計は DB 側 RPC detect_ai_anomalies() に閉じる（analyze-image/analyze-audio にフックを足さない
 *     = 事後集計方式 / REQ-215 制約 1）。
 *   - 閾値は env で調整可能・安全側の既定。AI_COST_ALERT_CALLS_PER_HOUR は REQ-218 と共有し、
 *     コスト観点の「総呼び出し数」閾値として二重定義しない（cloud-cost-guardrails.md の指示）。
 *   - 重複通知抑制は admin_alerts(alert_type='ai_anomaly').notified_at で管理（gemini と同設計）。
 *   - 本文に metric / signals を貼る際も redactAiErrorMessage を通す（REQ-211 / NFR-215-03。
 *     RPC は平文 IP/メールを返さない設計だが、通知経路は必ず redaction を通す二重防御）。
 *   - ADMIN_NOTIFY_EMAIL / RESEND_API_KEY 未設定や RPC 失敗は warn のみで 200 fail-soft
 *     （pg_cron 定期実行のため失敗扱いにしない）。
 *
 * トリガ想定: pg_cron で 15 分ごと（run_ai_anomaly_check() → pg_net）。
 *
 * 【必要な環境変数（Supabase Dashboard → Settings → Edge Functions → Secrets）】
 *   RESEND_API_KEY                       : Resend API キー
 *   ADMIN_NOTIFY_EMAIL                   : アラート送信先（カンマ区切り可）
 *   NOTIFY_FROM_EMAIL                    : 送信元 From（既定は認証済みドメイン）
 *   SITE_URL                             : 本文に貼る管理画面 URL
 *   AI_ANOMALY_WINDOW_MINUTES            : 集計窓（分・既定 60）
 *   AI_ANOMALY_MIN_SAMPLES               : auto-approve 率を評価する最小標本数（既定 20）
 *   AI_ANOMALY_AUTO_APPROVE_RATE         : auto-approve 率の異常閾値 0..1（既定 0.90）
 *   AI_ANOMALY_PER_ACTOR_CALLS           : 単一ユーザー/IP の呼び出し回数 異常閾値（既定 50）
 *   AI_ANOMALY_NOTIFY_INTERVAL_HOURS     : 同種通知の最小間隔（時間・既定 6）
 *   AI_COST_ALERT_CALLS_PER_HOUR         : 窓内 AI 呼び出し総数の異常閾値（REQ-218 と共有・既定 500）
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY : 自動設定
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
// REQ-219 FR-219-05: 送信元 From は環境変数で一元化（既定は認証済みドメイン）。
const fromEmail = Deno.env.get("NOTIFY_FROM_EMAIL") ??
  "ザリダス <noreply@zarigani-das.com>";

// 安全側の既定（aiSchema.ts の AUTO_APPROVE_FLOOR=0.5 と整合する高さ）。
const DEFAULT_WINDOW_MINUTES = 60;
const DEFAULT_MIN_SAMPLES = 20;
const DEFAULT_AUTO_APPROVE_RATE = 0.90;
const DEFAULT_PER_ACTOR_CALLS = 50;
const DEFAULT_TOTAL_CALLS = 500; // = REQ-218 AI_COST_ALERT_CALLS_PER_HOUR の既定
const DEFAULT_NOTIFY_INTERVAL_HOURS = 6;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 正の数だけ採用（0 や負・非数は fallback）。auto-approve 率は 0<r<=1 を別途検証。 */
function parseEnvNumber(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** auto-approve 率の閾値は (0, 1] にクランプ。範囲外/非数は fallback。 */
function parseRateThreshold(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(1, parsed);
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

// detect_ai_anomalies RPC の返り値（必要な部分のみ）。
interface AnomalyResult {
  window_minutes: number;
  since: string;
  thresholds: Record<string, unknown>;
  metrics: {
    total_calls?: number;
    analyzed_posts?: number;
    auto_approved?: number;
    auto_approve_rate?: number | null;
    max_user_calls?: number;
    top_user_id?: string | null;
    max_ip_posts?: number;
  };
  signals: string[];
  anomaly: boolean;
}

// signals コードの人間向けラベル（本文表示用・固定文言＝ユーザー由来でない）。
const SIGNAL_LABELS: Record<string, string> = {
  high_auto_approve_rate: "auto-approve 率が異常に高い（誤承認/濫用の疑い）",
  user_call_spike: "単一ユーザーからの AI 呼び出しが集中",
  ip_call_spike: "単一 IP（ハッシュ）からの AI 分析が集中",
  high_call_volume: "窓内 AI 呼び出し総数が急増（コスト暴走の疑い）",
};

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // REQ-270 FR-270-02: pg_cron (run_ai_anomaly_check) 経由のみ叩かれる前提なので
  // 他の通知系10関数と同様に webhook secret を必須化する（未設定は grace period）。
  try {
    requireWebhookSecret(req);
  } catch (e) {
    if (e instanceof WebhookAuthError) {
      console.warn("[notify-ai-anomaly] webhook secret mismatch");
      return jsonResponse(401, { error: "unauthorized" });
    }
    throw e;
  }

  try {
    const windowMinutes = parseEnvNumber(
      "AI_ANOMALY_WINDOW_MINUTES",
      DEFAULT_WINDOW_MINUTES,
    );
    const minSamples = parseEnvNumber(
      "AI_ANOMALY_MIN_SAMPLES",
      DEFAULT_MIN_SAMPLES,
    );
    const autoApproveRate = parseRateThreshold(
      "AI_ANOMALY_AUTO_APPROVE_RATE",
      DEFAULT_AUTO_APPROVE_RATE,
    );
    const perActorCalls = parseEnvNumber(
      "AI_ANOMALY_PER_ACTOR_CALLS",
      DEFAULT_PER_ACTOR_CALLS,
    );
    // 総呼び出し数の閾値は REQ-218 の AI_COST_ALERT_CALLS_PER_HOUR を共有（二重定義しない）。
    const totalCalls = parseEnvNumber(
      "AI_COST_ALERT_CALLS_PER_HOUR",
      DEFAULT_TOTAL_CALLS,
    );
    const intervalHours = parseEnvNumber(
      "AI_ANOMALY_NOTIFY_INTERVAL_HOURS",
      DEFAULT_NOTIFY_INTERVAL_HOURS,
    );

    const recipients = parseEmailRecipients(Deno.env.get("ADMIN_NOTIFY_EMAIL"));
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";

    const supabase = createServiceClient();

    // 1. 集計 RPC を実行（閾値は env から渡す。安全側の既定は RPC 側にもある）。
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "detect_ai_anomalies",
      {
        p_window_minutes: windowMinutes,
        p_min_samples: minSamples,
        p_auto_approve_rate_threshold: autoApproveRate,
        p_per_actor_call_threshold: perActorCalls,
        p_total_call_threshold: totalCalls,
      },
    );

    if (rpcError) {
      // RPC 失敗は warn のみで fail-soft（pg_cron 定期実行のため）。
      console.warn(
        "[notify-ai-anomaly] detect_ai_anomalies RPC エラー:",
        redactAiErrorMessage(String(rpcError.message ?? rpcError)),
      );
      return jsonResponse(200, { skipped: "rpc_failed" });
    }

    const result = rpcData as AnomalyResult | null;
    if (!result || result.anomaly !== true) {
      // REQ-270 FR-270-03: metrics（top_user_id 等の内部運用情報）・signals は
      // レスポンスに載せない（ログ/メールのみに閉じる）。
      return jsonResponse(200, { skipped: "no_anomaly" });
    }

    // 2. 通知先未設定は warn のみ（fail-soft）。RPC は呼べているので no_anomaly とは区別する。
    if (recipients.length === 0) {
      console.warn(
        "[notify-ai-anomaly] ADMIN_NOTIFY_EMAIL が未設定のため通知を送信しません",
      );
      return jsonResponse(200, { skipped: "no_admin_notify_email" });
    }

    // 3. 過去 intervalHours 内に同種通知を送っていないか確認（重複抑制）。
    const intervalCutoff =
      new Date(Date.now() - intervalHours * 60 * 60 * 1000).toISOString();
    const { data: recentAlerts, error: alertsError } = await supabase
      .from("admin_alerts")
      .select("id, notified_at")
      .eq("alert_type", "ai_anomaly")
      .not("notified_at", "is", null)
      .gte("notified_at", intervalCutoff)
      .order("notified_at", { ascending: false })
      .limit(1);

    if (alertsError) {
      console.error(
        "[notify-ai-anomaly] admin_alerts query error:",
        redactAiErrorMessage(String(alertsError.message ?? alertsError)),
      );
      return jsonResponse(500, { error: "alerts_query_failed" });
    }

    if (recentAlerts && recentAlerts.length > 0) {
      return jsonResponse(200, {
        skipped: "already_notified",
        last_notified_at: recentAlerts[0].notified_at,
      });
    }

    // 4. RESEND_API_KEY 未設定は fail-soft（admin_alerts への insert もしない）。
    if (!resendApiKey) {
      console.warn(
        "[notify-ai-anomaly] RESEND_API_KEY が未設定のため通知を送信しません",
      );
      return jsonResponse(200, { skipped: "no_resend_key" });
    }

    // 5. 本文を組み立てる（metric / signals。redaction を必ず通す二重防御）。
    const m = result.metrics ?? {};
    const signalsHtml = result.signals.length === 0
      ? ""
      : `<ul style="font-size:13px;color:#b91c1c;line-height:1.7;">${
        result.signals.map((s) =>
          `<li><strong>${escapeHtml(s)}</strong>: ${
            escapeHtml(SIGNAL_LABELS[s] ?? s)
          }</li>`
        ).join("")
      }</ul>`;

    const ratePct = typeof m.auto_approve_rate === "number"
      ? `${Math.round(m.auto_approve_rate * 100)}%`
      : "—（標本不足で未評価）";

    const adminUrl = `${siteUrl}/admin/posts`;
    const costUrl = `${siteUrl}/admin/ai-cost`;
    const runbookUrl =
      "https://github.com/your-org/kenkyuu-app/blob/main/docs/runbooks/ai-anomaly-detection.md";

    const subject = "🦞 [ザリダス] AI 自動判定の異常を検知しました";
    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="color:#dc2626;margin-bottom:4px;">⚠️ AI 自動承認/却下の異常検知</h2>
        <p style="color:#374151;font-size:14px;">
          直近 <strong>${escapeHtml(String(result.window_minutes))}</strong> 分の AI 自動判定に異常の兆候があります。
          誤承認・濫用・コスト暴走の可能性があるため確認してください。
        </p>
        <h3 style="margin-top:16px;font-size:14px;color:#374151;">検知した signal</h3>
        ${signalsHtml}
        <h3 style="margin-top:16px;font-size:14px;color:#374151;">メトリクス</h3>
        <ul style="font-size:13px;color:#4b5563;line-height:1.7;">
          <li>auto-approve 率: <strong>${escapeHtml(ratePct)}</strong>
            （分母 ${escapeHtml(String(m.analyzed_posts ?? 0))} 件 / 自動承認 ${
      escapeHtml(String(m.auto_approved ?? 0))
    } 件）</li>
          <li>窓内 AI 呼び出し総数: <strong>${
      escapeHtml(String(m.total_calls ?? 0))
    }</strong></li>
          <li>単一ユーザー最大 呼び出し回数: <strong>${
      escapeHtml(String(m.max_user_calls ?? 0))
    }</strong></li>
          <li>単一 IP(ハッシュ)最大 AI 分析件数: <strong>${
      escapeHtml(String(m.max_ip_posts ?? 0))
    }</strong></li>
          ${
      m.top_user_id
        ? `<li>最多呼び出しユーザー（集計キー）: <code>${
          escapeHtml(String(m.top_user_id))
        }</code></li>`
        : ""
    }
        </ul>
        <p style="margin:16px 0;">
          <a href="${escapeHtml(adminUrl)}"
             style="display:inline-block;background:#dc2626;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;">
            管理画面（投稿）を開く
          </a>
          <a href="${escapeHtml(costUrl)}"
             style="display:inline-block;background:#6b7280;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;margin-left:8px;">
            AI コストを確認
          </a>
        </p>
        <p style="font-size:12px;color:#6b7280;">
          対応の目安は Runbook（<a href="${
      escapeHtml(runbookUrl)
    }">ai-anomaly-detection.md</a>）を参照。
          コスト暴走が疑われる場合は <code>AI_ANALYSIS_ENABLED=false</code> で AI 分析だけ即停止できます
          （投稿は保存され手動レビューへ）。
        </p>
        <p style="margin-top:20px;font-size:12px;color:#9ca3af;">
          このメールは notify-ai-anomaly Edge Function が自動送信しています。通知間隔: ${
      escapeHtml(String(intervalHours))
    } 時間。
          しきい値: auto-approve 率 ${
      escapeHtml(String(autoApproveRate))
    } / 単一 actor ${escapeHtml(String(perActorCalls))} 回 / 総数 ${
      escapeHtml(String(totalCalls))
    } 回。
        </p>
      </div>
    `;
    // 二重防御: 本文全体を redaction（万一 metric に平文が混ざっても鍵/IP/メールを伏字化）。
    const safeHtml = redactAiErrorMessage(html);

    // 6. Resend にメール送信。
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
        html: safeHtml,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text().catch(() => "");
      console.error(
        "[notify-ai-anomaly] Resend エラー:",
        redactAiErrorMessage(err).slice(0, 300),
      );
      return jsonResponse(500, { error: "resend_failed" });
    }

    // 7. admin_alerts に notified_at 付きで insert（重複抑制の状態保持）。
    //    metadata は集計値のみ（PII を含めない）。
    const { error: insertError } = await supabase
      .from("admin_alerts")
      .insert({
        alert_type: "ai_anomaly",
        triggered_at: new Date().toISOString(),
        notified_at: new Date().toISOString(),
        metadata: {
          signals: result.signals,
          window_minutes: result.window_minutes,
          auto_approve_rate: m.auto_approve_rate ?? null,
          analyzed_posts: m.analyzed_posts ?? 0,
          total_calls: m.total_calls ?? 0,
          max_user_calls: m.max_user_calls ?? 0,
          max_ip_posts: m.max_ip_posts ?? 0,
          recipients_count: recipients.length,
        },
      });

    if (insertError) {
      console.error(
        "[notify-ai-anomaly] admin_alerts insert error:",
        redactAiErrorMessage(String(insertError.message ?? insertError)),
      );
      // メールは送れているので 200 で返す。
      return jsonResponse(200, {
        sent: true,
        warning: "admin_alerts_insert_failed",
      });
    }

    console.log(
      `[notify-ai-anomaly] sent → ${recipients.length} recipients, signals=${
        result.signals.join(",")
      }`,
    );
    return jsonResponse(200, {
      sent: true,
      recipients_count: recipients.length,
    });
  } catch (e) {
    console.error(
      "[notify-ai-anomaly] エラー:",
      redactAiErrorMessage(e instanceof Error ? e.message : String(e)),
    );
    return jsonResponse(500, {
      error: e instanceof Error
        ? redactAiErrorMessage(e.message)
        : "unknown_error",
    });
  }
}

if (import.meta.main) {
  serve(handleRequest);
}
