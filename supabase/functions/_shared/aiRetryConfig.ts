// REQ-218 FR-218-01 / AC-01: AI 分析リトライの「課金増幅器化」を防ぐ共通設定・ヘルパ。
//
// 背景（REQ-215 が指摘）:
//   analyze-image / analyze-audio の MAX_TOKENS 限定リトライは、attempt ごとに
//   maxOutputTokens を base*2 / base*4 と倍化する（REQ-127/130）。これは 1 枚あたりの
//   出力トークン課金をむしろ増やす方向で、しかも従来は backoff / jitter / 全体タイムアウト
//   が無く、即座に連続実行されていた。MAX_TOKENS が多発する入力では 1 リクエストで
//   base*(1+2+4)=base*7 相当の出力課金が連鎖し得る = 「課金増幅器」。
//
// 本モジュールの方針:
//   - **最大試行回数を env 化**（`AI_MAX_RETRY`）し、既定は現状維持（後方互換）。
//     コスト逼迫時に 0 へ下げて「初回のみ・リトライ無効」にできる。
//   - **指数バックオフ + ジッタ**（attempt ごとに base_delay*2^attempt、±20% 揺らぎ、上限あり）。
//     即時連続リトライをやめ、瞬間的な集中課金 / 上流 429 の悪化を避ける。
//   - **1 リクエスト全体の最大経過時間**（`AI_REQUEST_TOTAL_TIMEOUT_MS`）。retry を含む
//     総時間がこれを超えたら、次の試行に入らず打ち切る（呼び出し側で error 記録 →
//     ai_failure_count 加算 → 手動レビュー。新たな自動再投入はしない）。
//
// 注意（二重リトライ防止）:
//   既存の MAX_TOKENS リトライ・個別 fetch の AbortSignal.timeout（画像/音声取得・Gemini
//   呼び出し）はそのまま活かす。本モジュールは「既存ループに backoff / 回数上限 / 全体
//   タイムアウトを足す」だけで、新しいリトライループや「成功するまで再試行」は追加しない。

// ===== env 化された設定値 =====

// 既定の最大リトライ回数（= 初回を除く再試行回数）。
// 従来は for (attempt < 3) かつ attempt < 2 のときだけ continue で「初回 + 最大 2 retry」
// だったため、後方互換の既定値は 2。
export const DEFAULT_MAX_RETRY = 2;

// 既定のバックオフ基準遅延（ms）。attempt=1 で約 0.5s から始める。
export const DEFAULT_BASE_DELAY_MS = 500;

// 既定のバックオフ上限（ms）。指数増加が暴れないよう 1 回の待機を上限で頭打ちにする。
export const DEFAULT_MAX_DELAY_MS = 8_000;

// 既定の「1 リクエスト全体（retry 含む）」の最大経過時間（ms）。
// 個別 fetch タイムアウト（画像取得 8–15s + Gemini 30s）× 試行回数の最悪値を緩く包む値。
// 既定では実質ほぼ打ち切らない大きさ（= 後方互換）にし、コスト逼迫時に env で短縮する。
export const DEFAULT_REQUEST_TOTAL_TIMEOUT_MS = 120_000;

// ジッタ幅（±20%）。
const JITTER_RATIO = 0.2;

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  const n = raw ? Number(raw) : NaN;
  // 0 は「リトライ無効」「タイムアウト無効」など意味を持たせるため別途許可する関数で扱う。
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * 最大リトライ回数（初回を除く再試行回数）。env `AI_MAX_RETRY` で上書き。
 * - 未設定 / 非数値 → 既定 2（後方互換）。
 * - 0 を明示 → 0（= リトライ無効・初回のみ）。コスト逼迫時の絞り込み用。
 * - 負値 / NaN → 既定 2。
 */
export function getMaxRetryAttempts(): number {
  const raw = Deno.env.get("AI_MAX_RETRY");
  if (raw !== undefined && raw !== null && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return DEFAULT_MAX_RETRY;
}

/**
 * 1 リクエスト全体（retry 含む）の最大経過時間（ms）。env `AI_REQUEST_TOTAL_TIMEOUT_MS`。
 * - 未設定 / 非数値 → 既定。
 * - 0 を明示 → 0（= 全体タイムアウトを無効化）。
 */
export function getRequestTotalTimeoutMs(): number {
  const raw = Deno.env.get("AI_REQUEST_TOTAL_TIMEOUT_MS");
  if (raw !== undefined && raw !== null && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return DEFAULT_REQUEST_TOTAL_TIMEOUT_MS;
}

/** バックオフ基準遅延（ms）。env `AI_RETRY_BASE_DELAY_MS` で上書き可。 */
export function getBaseDelayMs(): number {
  return readPositiveIntEnv("AI_RETRY_BASE_DELAY_MS", DEFAULT_BASE_DELAY_MS);
}

/** バックオフ上限遅延（ms）。env `AI_RETRY_MAX_DELAY_MS` で上書き可。 */
export function getMaxDelayMs(): number {
  return readPositiveIntEnv("AI_RETRY_MAX_DELAY_MS", DEFAULT_MAX_DELAY_MS);
}

/**
 * 指数バックオフ + ジッタの待機時間（ms）を計算する。
 *
 * - attempt は「次に行う再試行のインデックス」（1 始まり）。attempt=1 が初回失敗後の
 *   1 回目のリトライ前の待機。
 * - 基本値 = baseDelay * 2^(attempt-1) を maxDelay で頭打ち。
 * - そこに ±jitterRatio のランダム揺らぎを加える（同時多発時の同期再試行=thundering herd 回避）。
 * - 返り値は 0 以上に丸める。
 *
 * 純粋関数として `rng`（既定 Math.random）を注入可能にし、テストで決定的に検証できる。
 */
export function computeBackoffDelayMs(
  attempt: number,
  opts?: {
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitterRatio?: number;
    rng?: () => number;
  },
): number {
  const baseDelay = opts?.baseDelayMs ?? getBaseDelayMs();
  const maxDelay = opts?.maxDelayMs ?? getMaxDelayMs();
  const jitterRatio = opts?.jitterRatio ?? JITTER_RATIO;
  const rng = opts?.rng ?? Math.random;

  const safeAttempt = attempt < 1 ? 1 : Math.floor(attempt);
  const exp = baseDelay * Math.pow(2, safeAttempt - 1);
  const capped = Math.min(exp, maxDelay);
  // rng() ∈ [0,1) を [-1,1) にマップして ±jitterRatio の揺らぎにする。
  const jitter = capped * jitterRatio * (rng() * 2 - 1);
  const delay = capped + jitter;
  return delay > 0 ? Math.round(delay) : 0;
}

/** Promise ベースの sleep。ms<=0 は即 resolve。 */
export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * retry の全体タイムアウト超過で打ち切ったことを表す専用 Error（AC-01）。
 * 呼び出し側はこれを通常の失敗（ai_failure_count 加算 + error 記録）として扱い、
 * 新たな自動再投入はしない（FR-218-02）。
 */
export class RetryDeadlineError extends Error {
  readonly elapsedMs: number;
  readonly timeoutMs: number;
  constructor(elapsedMs: number, timeoutMs: number, cause?: unknown) {
    super(`AI request total timeout exceeded: ${elapsedMs}ms (limit ${timeoutMs}ms)`);
    this.name = "RetryDeadlineError";
    this.elapsedMs = elapsedMs;
    this.timeoutMs = timeoutMs;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * 全体タイムアウトの残り時間が、これから入る待機 + 1 回の試行に足りるかを判定する。
 *
 * - timeoutMs<=0 → 常に true（全体タイムアウト無効）。
 * - 経過 + 予定待機（plannedDelayMs）が timeoutMs を超えるなら false（= もう次の試行に
 *   入らず打ち切る）。「待ってから試したら確実に超過する」ケースで無駄な待機 + 課金を避ける。
 */
export function hasBudgetForNextAttempt(
  startedAtMs: number,
  timeoutMs: number,
  plannedDelayMs: number,
  nowMs: number = Date.now(),
): boolean {
  if (timeoutMs <= 0) return true;
  const elapsed = nowMs - startedAtMs;
  return elapsed + Math.max(0, plannedDelayMs) < timeoutMs;
}
