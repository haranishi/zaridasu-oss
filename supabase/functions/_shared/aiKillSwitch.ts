// REQ-218 FR-218-03 / AC-02: AI 分析の即時停止フラグ（コスト kill switch）。
//
// 目的:
//   コスト暴走（リトライ事故・bot 大量投稿・鍵悪用）時に、**API キーを失効させずに**
//   AI 分析（Gemini 呼び出し）だけを env フラグで即停止できるようにする。停止中も投稿
//   自体は通常どおり保存され、AI 判定が付かないだけ（= 手動レビューへ回る）。
//
// 設計判断:
//   - DB migration 不要の env ベース。Supabase Dashboard → Edge Functions → Secrets で
//     `AI_ANALYSIS_ENABLED=false` を設定 → 反映（再デプロイ不要）で即停止できる。
//   - **後方互換**: 未設定時は既定で有効（true）。明示的に "false" のときだけ停止する。
//     これにより既存環境の挙動は変わらない（NFR-218-02）。
//   - 値の解釈は寛容にする: "false" / "0" / "no" / "off"（大小文字・前後空白無視）を
//     「停止」とみなす。それ以外（未設定含む）は「有効」。設定ミスで誤って止まり続ける
//     より、フラグを引いたつもりが止まっていない事故の方が安全側（= 課金は redaction /
//     ai_failure_count で観測可能、停止漏れはダッシュボードのコストアラートで検知できる）
//     という判断ではなく、ここでは「明示 false のみ停止」を厳密に守る（運用者が
//     `AI_ANALYSIS_ENABLED=false` と打てば確実に止まる）。
//
// 段階的 kill switch（docs/runbooks/cloud-cost-guardrails.md / incident/03）における
// 「段階 2: AI 機能」に対応する。利用者/IP（段階1・REQ-212）の次、Webhook/キー（段階3以降）
// の前に引く最小被害の停止手段。

// AI 分析停止時に Edge Function が返す skip 理由（AC-02）。
// GEMINI_API_KEY 未設定時の "no_api_key" と同じ早期 return 経路に並ぶ識別子。
export const AI_DISABLED_SKIP_REASON = "disabled" as const;

/**
 * AI 分析（Gemini 呼び出し）が有効かどうかを返す。
 *
 * - env `AI_ANALYSIS_ENABLED` が未設定 → true（後方互換・既定で有効）
 * - "false" / "0" / "no" / "off"（大小文字・前後空白無視）→ false（停止）
 * - それ以外（"true" 等）→ true
 *
 * 呼び出し側は false のとき Gemini を呼ばず `{ skipped: AI_DISABLED_SKIP_REASON }` を
 * 200 で返す（投稿は保存済み・手動レビューへ）。フェイルセーフは「自動承認しない」
 * （NFR-218-03）。
 */
export function isAiAnalysisEnabled(): boolean {
  const raw = Deno.env.get("AI_ANALYSIS_ENABLED");
  if (raw === undefined || raw === null) return true; // 未設定 = 既定で有効
  const v = raw.trim().toLowerCase();
  if (v === "") return true; // 空文字も既定扱い
  return !(v === "false" || v === "0" || v === "no" || v === "off");
}
