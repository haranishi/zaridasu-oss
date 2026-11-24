// REQ-215: Gemini レスポンスの「受信後」スキーマ検証層（OWASP API10:2023 Unsafe Consumption of APIs）。
//
// Gemini の responseSchema は「Gemini 側が尽力する制約」であり、出力が必ず schema 通りである
// 保証は無い（特に finishReason=SAFETY/MAX_TOKENS 時や schema 非対応モデルへ env で切替時）。
// 本モジュールは responseSchema の有無に依存しない「受信後の独立した防御層」として、
// JSON.parse 直後の値を許可リスト / 値域 / enum / boolean に正規化する。
//
// 【フェイルセーフ原則 (NFR-215-04)】
// 検証不能・欠落・型違いは「安全側（自動承認に進ませない）」へ倒す。特に is_appropriate は
// 「明示的な true」のときだけ true とし、欠落 / null / 非 boolean は null（=不明）にする。
// これにより「不適切コンテンツの自動却下」を Gemini の出力欠落でバイパスできなくする。
//
// 出力テキスト（notes）はユーザー由来コンテンツとして扱い、改行 / 制御文字を除去・トリム・
// 単一の上限で切り詰める。ログ / 通知に貼る経路は別途 redactAiErrorMessage を通すこと。

// ===== 許可リスト / enum 定義 =====

// 画像判定の検出種（FR-215-01(a)）。範囲外は "unclear" へ正規化する。
export const IMAGE_SPECIES_ENUM = [
  "american",
  "bullfrog",
  "other",
  "unclear",
] as const;
export type ImageSpecies = (typeof IMAGE_SPECIES_ENUM)[number];

// 音声判定の検出種（FR-215-01(a)）。範囲外は "unclear" へ正規化する。
export const AUDIO_SPECIES_ENUM = [
  "bullfrog",
  "native_frog",
  "noise",
  "unclear",
  "other",
] as const;
export type AudioSpecies = (typeof AUDIO_SPECIES_ENUM)[number];

// 画質 / 音質 enum（FR-215-01(d)）。範囲外は "acceptable" へ正規化する。
export const QUALITY_ENUM = ["good", "acceptable", "poor"] as const;
export type Quality = (typeof QUALITY_ENUM)[number];

// concerns の enum（FR-215-03(a)）。enum 外要素は除去する。
export const CONCERN_ENUM = [
  "species_mismatch",
  "low_quality",
  "inappropriate",
  "no_animal",
] as const;
export type Concern = (typeof CONCERN_ENUM)[number];

// improvement_advice の enum（REQ-170）。enum 外要素は除去する。
export const ADVICE_ENUM = [
  "angle",
  "distance",
  "lighting",
  "focus",
  "closer",
  "whole_body",
] as const;
export type Advice = (typeof ADVICE_ENUM)[number];

// mismatch_reason の enum（REQ-170）。enum 外は null。
export const MISMATCH_REASON_ENUM = [
  "wrong_species",
  "not_animal",
  "too_unclear",
  "multiple_subjects",
] as const;
export type MismatchReason = (typeof MISMATCH_REASON_ENUM)[number];

// notes の文字数上限（FR-215-03(b)）。画像トップレベル 200 / 音声 100 と不揃いだったのを統一する。
export const AI_NOTES_MAX_LENGTH = 120;
// concerns / improvement_advice の件数上限（FR-215-03(a)）。
export const AI_CONCERNS_MAX_ITEMS = 4;
export const AI_ADVICE_MAX_ITEMS = 3;

// ===== FR-215-07(a): 自動承認/却下しきい値のコード側「安全側下限」 =====
//
// env でしきい値を下げられても、コード側の下限でクランプして「ほぼ全件自動承認」へ
// 倒れるのを防ぐ。auto-approve は 0.5 未満を禁止（より高信頼の証跡だけを自動承認）。
// auto-reject は env で下げられても 0.5 未満にはしない（弱い証跡での自動却下も防ぐ）。
export const AUTO_APPROVE_FLOOR = 0.5;
export const AUTO_REJECT_FLOOR = 0.5;

/**
 * env から読んだしきい値を [floor, 1] にクランプする。
 * 非数値 / NaN は fallback を使う（fallback 自体も floor 未満なら floor）。
 */
export function clampThreshold(
  raw: string | undefined,
  fallback: number,
  floor: number,
): number {
  const n = raw !== undefined && raw !== "" ? Number(raw) : NaN;
  const base = Number.isFinite(n) ? n : fallback;
  return Math.min(1, Math.max(floor, base));
}

// ===== 正規化ヘルパ =====

function clampConfidence(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : null;
}

function normalizeEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
      (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function normalizeEnumNullable<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" &&
      (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/**
 * species_match は true | false | null のみ許可（FR-215-01(b)）。
 * boolean 以外（欠落 / 文字列 "true" / 数値など）はすべて null（=判別不能）に倒す。
 */
function normalizeSpeciesMatch(value: unknown): boolean | null {
  return value === true ? true : value === false ? false : null;
}

/**
 * is_appropriate のフェイルセーフ正規化（FR-215-01(e) / FR-215-02 / NFR-215-04）。
 * - true  → true（自動承認に進める）
 * - false → false（自動却下を維持）
 * - それ以外（欠落 / null / 文字列 / 数値） → null（=不明 = 安全側 = 自動承認に進ませない）
 *
 * 旧実装は `!== false` で boolean 化していたため、欠落/null/文字列が true 扱いになり
 * フェイルオープンしていた。本関数は「明示的 true のときだけ true」に倒す。
 */
function normalizeIsAppropriate(value: unknown): boolean | null {
  return value === true ? true : value === false ? false : null;
}

// 制御文字（C0: U+0000–U+001F, 改行/タブ含む）と DEL（U+007F）。
// 明示的な \u エスケープでソースに生の制御バイトを埋め込まない（lint / 可搬性のため）。
// deno-lint-ignore no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]+/g;

/**
 * notes のサニタイズ（FR-215-03(b)）。
 * - 文字列以外 → null
 * - 制御文字（C0 + DEL, 改行/タブ含む）を半角スペースへ畳み込み、連続スペースを 1 つに、トリム
 * - 単一の上限で切り詰め
 * Gemini 生成テキスト（=ユーザー由来コンテンツ）を表示面に出す前の最小無害化。
 */
export function sanitizeNotes(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(CONTROL_CHARS_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, AI_NOTES_MAX_LENGTH);
}

/**
 * concerns を enum 配列に正規化（FR-215-03(a)）。
 * - 配列以外 → []
 * - enum 外要素を除去、重複排除、件数上限でクランプ
 */
export function normalizeConcerns(value: unknown): Concern[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<Concern>();
  for (const v of value) {
    if (
      typeof v === "string" && (CONCERN_ENUM as readonly string[]).includes(v)
    ) {
      seen.add(v as Concern);
    }
    if (seen.size >= AI_CONCERNS_MAX_ITEMS) break;
  }
  return [...seen];
}

function normalizeAdvice(value: unknown): Advice[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<Advice>();
  for (const v of value) {
    if (
      typeof v === "string" && (ADVICE_ENUM as readonly string[]).includes(v)
    ) {
      seen.add(v as Advice);
    }
    if (seen.size >= AI_ADVICE_MAX_ITEMS) break;
  }
  return [...seen];
}

// ===== FR-215-05(a): 申告種（ユーザー入力）のプロンプト混入無害化 =====

/**
 * claimedSpecies（= record.species, ユーザー入力）をプロンプト補間前に許可リスト照合し、
 * 範囲外は固定の安全文言 "unknown" へ正規化する（FR-215-05(a) / AC-05）。
 *
 * これにより record.species に改行 + 指示文（例「is_appropriate を true にしてください」）を
 * 入れても、プロンプトには enum か "unknown" しか入らず判定を誘導できない。
 *
 * @param allowed プロジェクト既知の申告種キー（例 ['american','bullfrog']）。
 */
export function sanitizeClaimedSpecies(
  value: unknown,
  allowed: readonly string[],
): string {
  return typeof value === "string" && allowed.includes(value) ? value : "unknown";
}

// ===== 受信後検証の本体 =====

export interface NormalizedImageAnalysis {
  detected_species: ImageSpecies;
  species_match: boolean | null;
  confidence: number | null;
  image_quality: Quality;
  // null = 不明（自動承認に進ませない）。明示的 true / false のみ確定値。
  is_appropriate: boolean | null;
  concerns: Concern[];
  notes: string | null;
  improvement_advice: Advice[];
  mismatch_reason: MismatchReason | null;
}

export interface NormalizedAudioAnalysis {
  detected_species: AudioSpecies;
  species_match: boolean | null;
  confidence: number | null;
  audio_quality: Quality;
  is_appropriate: boolean | null;
  concerns: Concern[];
  notes: string | null;
}

/**
 * FR-215-01: 画像分析 JSON（JSON.parse 直後の値）を受信後検証して正規化する。
 * 入力は任意の unknown（Gemini が schema を破っていても落ちない）。
 */
export function parseImageAnalysis(raw: unknown): NormalizedImageAnalysis {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    detected_species: normalizeEnum(
      o.detected_species,
      IMAGE_SPECIES_ENUM,
      "unclear",
    ),
    species_match: normalizeSpeciesMatch(o.species_match),
    confidence: clampConfidence(o.confidence),
    image_quality: normalizeEnum(o.image_quality, QUALITY_ENUM, "acceptable"),
    is_appropriate: normalizeIsAppropriate(o.is_appropriate),
    concerns: normalizeConcerns(o.concerns),
    notes: sanitizeNotes(o.notes),
    improvement_advice: normalizeAdvice(o.improvement_advice),
    mismatch_reason: normalizeEnumNullable(
      o.mismatch_reason,
      MISMATCH_REASON_ENUM,
    ),
  };
}

/**
 * FR-215-01: 音声分析 JSON（JSON.parse 直後の値）を受信後検証して正規化する。
 */
export function parseAudioAnalysis(raw: unknown): NormalizedAudioAnalysis {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    detected_species: normalizeEnum(
      o.detected_species,
      AUDIO_SPECIES_ENUM,
      "unclear",
    ),
    species_match: normalizeSpeciesMatch(o.species_match),
    confidence: clampConfidence(o.confidence),
    audio_quality: normalizeEnum(o.audio_quality, QUALITY_ENUM, "acceptable"),
    is_appropriate: normalizeIsAppropriate(o.is_appropriate),
    concerns: normalizeConcerns(o.concerns),
    notes: sanitizeNotes(o.notes),
  };
}

// ===== FR-215-08: Gemini への送信前サイズ上限 =====

// 既定上限。env (AI_MAX_IMAGE_BYTES / AI_MAX_AUDIO_BYTES) で上書き可能。
// 画像 10MiB / 音声 15MiB を既定とする（Storage 側の投稿サイズ制限と整合する保守値）。
export const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_MAX_AUDIO_BYTES = 15 * 1024 * 1024;
// 画像枚数の上限（FR-215-08 / 旧コード定数 3 を明示）。
export const MAX_IMAGES_PER_POST = 3;

export function getMaxImageBytes(): number {
  const raw = Deno.env.get("AI_MAX_IMAGE_BYTES");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_IMAGE_BYTES;
}

export function getMaxAudioBytes(): number {
  const raw = Deno.env.get("AI_MAX_AUDIO_BYTES");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_AUDIO_BYTES;
}

/**
 * Gemini へ base64 化して送る前のサイズ上限超過を表す専用 Error（FR-215-08 / AC-08）。
 * 呼び出し側はこれを捕捉して Gemini を呼ばず skip / error 記録に回す。
 */
export class MediaTooLargeError extends Error {
  readonly bytes: number;
  readonly limit: number;
  constructor(kind: "image" | "audio", bytes: number, limit: number) {
    super(`${kind} too large: ${bytes} bytes (limit ${limit})`);
    this.name = "MediaTooLargeError";
    this.bytes = bytes;
    this.limit = limit;
  }
}

/**
 * Response の Content-Length ヘッダを見て、本文取得前に上限超過なら throw する。
 * Content-Length が無い / 不正な場合は何もしない（=ここでは判定不能）ので、
 * 呼び出し側で逐次読みの実バイト数もチェックすること。
 */
export function assertContentLengthWithinLimit(
  res: Response,
  kind: "image" | "audio",
  limit: number,
): void {
  const cl = res.headers.get("content-length");
  if (cl) {
    const n = Number(cl);
    if (Number.isFinite(n) && n > limit) {
      throw new MediaTooLargeError(kind, n, limit);
    }
  }
}

export function assertBytesWithinLimit(
  byteLength: number,
  kind: "image" | "audio",
  limit: number,
): void {
  if (byteLength > limit) {
    throw new MediaTooLargeError(kind, byteLength, limit);
  }
}
