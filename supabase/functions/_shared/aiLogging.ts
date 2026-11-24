// REQ-075 Phase 0: AI 呼び出しログを ai_call_logs に記録する共通ユーティリティ。
// 失敗しても本体処理を止めない（フェイルオープン）。

// deno-lint-ignore no-explicit-any
export type SupabaseLike = any;

export type AiCallStatus =
  | "success"
  | "error"
  | "skipped"
  | "dedup_hit"
  | "rate_limited"
  | "cache_hit"
  | "cache_miss";

export interface AiCallLogInput {
  postId?: string | null;
  functionName: "analyze-audio" | "analyze-image";
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  status: AiCallStatus;
  reanalysis?: boolean;
  dedupStatus?: "hit" | "miss" | "skipped" | null;
  cacheStatus?: "hit" | "miss" | "refresh" | "error" | null;
  errorMessage?: string | null;
  // REQ-126: 分類済みエラー種別を ai_call_logs.error_kind に書き戻す。
  // バナー / 通知の集計（gemini_auth に対する直近 1 時間カウント）を高速化するため。
  errorKind?: AiErrorKind | null;
}

// REQ-126: gemini_auth / gemini_transient を追加。
// - gemini_auth: 400/401/403 (API キー失効・無効化など、再判定では復旧しない設定エラー)
// - gemini_transient: 5xx / 429 (一時的不具合、再判定で復旧見込みあり)
// - gemini_api: 上記以外の HTTP 失敗、または HTTP status 不明な後方互換ケース
// REQ-127: gemini_truncated / gemini_safety を追加。
// - gemini_truncated: finishReason === 'MAX_TOKENS' (出力切れ、retry で復旧の可能性あり)
// - gemini_safety: finishReason === 'SAFETY' | 'RECITATION' / promptFeedback.blockReason
//   (safety filter で確定的に判定拒否、再判定では復旧しない)
export type AiErrorKind =
  | "image_fetch"
  | "gemini_auth"
  | "gemini_transient"
  | "gemini_truncated"
  | "gemini_safety"
  | "gemini_api"
  | "json_parse"
  | "unknown";

/**
 * REQ-126: Gemini API の HTTP エラーを構造化して伝播するための専用 Error。
 * `classifyAiError` がインスタンス受け取りで `status` を見て分類できるようにする。
 */
export class GeminiApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`Gemini API エラー (${status}): ${body}`);
    this.name = "GeminiApiError";
    this.status = status;
    this.body = body;
  }
}

// REQ-127: Gemini の finishReason 値。未知の値も握りつぶさないため string union。
export type GeminiFinishReason =
  | "STOP"
  | "MAX_TOKENS"
  | "SAFETY"
  | "RECITATION"
  | "OTHER"
  | string;

/**
 * REQ-127: Gemini レスポンスの異常 (finishReason / blockReason / JSON parse 失敗) を
 * 構造化して伝播するための専用 Error。
 *
 * - finishReason === 'MAX_TOKENS' → classifyAiError は 'gemini_truncated' を返す
 * - finishReason === 'SAFETY' | 'RECITATION' → 'gemini_safety'
 * - blockReason が非 null → 'gemini_safety'
 * - それ以外（STOP + JSON.parse 失敗 / OTHER / 未知） → 'json_parse'
 *
 * `rawText` には Gemini が返した生テキスト先頭 200 文字程度を保持する想定で、
 * 上位で redact / truncate されてから ai_call_logs.error_message に書き出される。
 */
export class GeminiResponseError extends Error {
  readonly finishReason: GeminiFinishReason | null;
  readonly blockReason: string | null;
  readonly rawText: string;
  // REQ-130 FR-130-06: 失敗時の usage を保持して ai_call_logs に書き出す。
  // MAX_TOKENS で finishReason が立った場合でも、Gemini は usageMetadata を返している
  // ため、上位の catch ブロックが logAiCall に input_tokens / output_tokens を渡せるよう
  // ここで一緒に伝播させる。
  readonly usage: { input?: number; output?: number } | null;
  constructor(opts: {
    finishReason: GeminiFinishReason | null;
    blockReason: string | null;
    rawText: string;
    usage?: { input?: number; output?: number } | null;
    cause?: string;
  }) {
    super(
      `Gemini レスポンス異常 (finishReason=${opts.finishReason ?? "null"}, blockReason=${
        opts.blockReason ?? "null"
      }): ${opts.cause ?? ""}`,
    );
    this.name = "GeminiResponseError";
    this.finishReason = opts.finishReason;
    this.blockReason = opts.blockReason;
    this.rawText = opts.rawText;
    this.usage = opts.usage ?? null;
  }
}

/**
 * REQ-130 FR-130-02: Gemini 2.5 Flash の "thinking tokens" (内部 reasoning) を
 * maxOutputTokens から消費させないための共通ヘルパ。
 *
 * - 既定 0: thinking 完全無効。実テキストだけが maxOutputTokens を消費するようになり、
 *   80〜100 トークン程度の小さな JSON でも MAX_TOKENS を踏まなくなる。
 * - env `GEMINI_THINKING_BUDGET=128` 等で部分的に thinking を許可することも可能。
 *   推論精度を上げたい場合の switch として残す。
 * - 不正値 (NaN / 負数 / 非数字) は黙って 0 にフォールバック。
 *
 * 仕様の根拠: Google AI Studio "Thinking models" セクション (gemini-2.5-flash)。
 * thinkingConfig.thinkingBudget を 0 に明示しない限り内部 reasoning が
 * maxOutputTokens を食い尽くし、実テキスト 0 文字でも finishReason=MAX_TOKENS が返る。
 */
export function getThinkingBudget(): number {
  const raw = Deno.env.get("GEMINI_THINKING_BUDGET");
  if (raw === undefined || raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function redactAiErrorMessage(message: string): string {
  return message
    .replace(/key=[A-Za-z0-9_-]+/g, "key=[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/Authorization:\s*[^\s,}]+/gi, "Authorization: [REDACTED]")
    // REQ-211 FR-211-02: メール・IP も Edge ログ / ai_call_logs に残さない。
    // 正規表現はいずれも単一文字クラスの 1 回量化のみで ReDoS 安全（線形）。
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]")
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[REDACTED_IP]")
    .replace(
      /\b(?:[A-Fa-f0-9]{1,4}:){2,7}[A-Fa-f0-9]{1,4}\b/g,
      "[REDACTED_IP]",
    );
}

/**
 * REQ-211 FR-211-06: メールアドレスをログ用にマスクする（`a***@example.com`）。
 * ローカル部の先頭 1 文字のみ残し、ドメインは保持（配信先ドメインの確認はできるが
 * 個人特定はできない程度）。空・不正値はマスク不要トークンを返す。
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email || typeof email !== "string") return "[no-email]";
  const at = email.indexOf("@");
  if (at <= 0) return "[redacted]";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = local.slice(0, 1);
  return `${head}***@${domain}`;
}

export function truncateAiErrorMessage(
  message: string,
  maxLength = 300,
): string {
  const redacted = redactAiErrorMessage(message);
  return redacted.length > maxLength
    ? `${redacted.slice(0, maxLength)}...`
    : redacted;
}

/**
 * REQ-126: Error / 文字列の両方を受け付ける overload。
 * - `GeminiApiError` インスタンスは `status` を見て gemini_auth / gemini_transient / gemini_api に細分化
 * - 文字列 or 通常 Error は従来の正規表現ベース判定（後方互換）
 */
export function classifyAiError(err: unknown): AiErrorKind {
  if (err instanceof GeminiApiError) {
    if (err.status === 400 || err.status === 401 || err.status === 403) {
      return "gemini_auth";
    }
    if (err.status === 429 || err.status >= 500) {
      return "gemini_transient";
    }
    return "gemini_api";
  }

  // REQ-127: finishReason / blockReason を保持した構造化 Error を細分化する。
  if (err instanceof GeminiResponseError) {
    if (err.finishReason === "MAX_TOKENS") return "gemini_truncated";
    if (err.finishReason === "SAFETY" || err.finishReason === "RECITATION") {
      return "gemini_safety";
    }
    if (err.blockReason) return "gemini_safety";
    // それ以外 (STOP + JSON.parse 失敗 / OTHER / 未知の finishReason) は
    // 旧来の JSON parse 失敗扱いと同列に json_parse に丸める。
    return "json_parse";
  }

  const message = err instanceof Error
    ? err.message
    : typeof err === "string"
    ? err
    : err == null
    ? ""
    : String(err);

  if (
    /画像の取得に失敗しました|image fetch failed|audio fetch failed/i.test(
      message,
    )
  ) {
    return "image_fetch";
  }
  if (/Gemini API エラー|gemini\s+\d{3}|gemini api/i.test(message)) {
    return "gemini_api";
  }
  if (
    /JSON\.parse|SyntaxError|Unexpected token|Unexpected end|non-JSON/i.test(
      message,
    )
  ) {
    return "json_parse";
  }
  return "unknown";
}

export async function logAiCall(
  supabase: SupabaseLike,
  input: AiCallLogInput,
): Promise<void> {
  try {
    await supabase.from("ai_call_logs").insert({
      post_id: input.postId ?? null,
      function_name: input.functionName,
      model: input.model,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      latency_ms: input.latencyMs ?? null,
      status: input.status,
      reanalysis: input.reanalysis ?? false,
      dedup_status: input.dedupStatus ?? null,
      cache_status: input.cacheStatus ?? null,
      error_message: input.errorMessage
        ? redactAiErrorMessage(input.errorMessage)
        : null,
      // REQ-126: error_kind を NULL 許容で保存。Migration 適用前の環境では
      // Postgres が unknown column を返すケースを避けるため、未指定時は明示的に null を入れる。
      error_kind: input.errorKind ?? null,
    });
  } catch (e) {
    console.warn("[ai_call_logs] insert failed (non-fatal):", e);
  }
}

// Gemini API のレスポンスから usageMetadata を抽出
export function extractUsage(
  resBody: unknown,
): { input?: number; output?: number } {
  const meta = (resBody as {
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  })?.usageMetadata;
  return {
    input: typeof meta?.promptTokenCount === "number"
      ? meta.promptTokenCount
      : undefined,
    output: typeof meta?.candidatesTokenCount === "number"
      ? meta.candidatesTokenCount
      : undefined,
  };
}
