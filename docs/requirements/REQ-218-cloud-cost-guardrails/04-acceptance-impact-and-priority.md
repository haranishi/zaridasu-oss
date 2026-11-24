## 受入条件
- [ ] AC-01: `analyze-image` / `analyze-audio` の retry に**指数バックオフ + ジッタと全体タイムアウト**が入り、単体テストで (a) MAX_TOKENS で待機を挟んで retry する、(b) 全体経過時間 / 最大試行回数超過で打ち切り `ai_failure_count` 加算 + error 記録になる、ことが確認できる。SAFETY / 認証 / 入力不正は従来どおり即 throw（retry しない）。
- [ ] AC-02: `AI_ANALYSIS_ENABLED=false`（または相当フラグ）のとき、`analyze-image` / `analyze-audio` が **Gemini を呼ばずに `skipped: disabled` を返し**、投稿は保存され手動レビューへ回る（キー失効なしで AI 停止できる）。既定 `true` で現行どおり動作する。
- [ ] AC-03: 二重配信 / 二重 invoke で同一投稿が**二重に Gemini 課金されない**（`ai_analyzed_at` / `audio_analysis.analyzed_at` の冪等性ガードがテストで確認でき、新規の自動再投入ループが存在しない）。
- [ ] AC-04: 段階的 kill switch 手順（利用者 → AI 機能 → Webhook → API 入口 → キー → billing）が、各段階の停止対象 / リスク / 操作場所つきで文書化され、**billing 無効化の破壊性（復旧不能の可能性・専用プロジェクト + バックアップ前提）が明記**されている。
- [ ] AC-05: 予算アラート（GCP 実績 / 予測）・Vercel Spend Management・Supabase / Vercel 週次使用量確認の運用が文書化され、**「予算アラートはハード上限ではない」**ことが明記されている。`cost:ai` / `/admin/ai-cost` が週次レビューに組み込まれている。
- [ ] AC-06: AI 利用量 / コストの**異常検知経路**（呼び出し回数 / 失敗率 / 推定コストの閾値 → 通知 または 週次手動確認）が定義され、通知 / ログに鍵が露出しない（redaction 確認）。REQ-215 と二重に同じアラートを実装していない。
- [ ] AC-07: 開発 / 本番の分離方針が文書化され、(a) `.env.example` に本番鍵の使い回し禁止 + Gemini のプロジェクト単位課金の注記がある、(b) 現状の分離有無が確認・記録され、(c) CI が本番 ref のみで動きテストが本番に書かないことが確認されている。
- [ ] AC-08: `AI_ANALYSIS_ENABLED` 既定 `true` / `AI_MAX_RETRY` 既定 = 現状値で、既存テスト（dedup / rate limit / webhook secret / MAX_TOKENS retry）が**全件パス**し、Deno / TypeScript 型チェックが通る（NFR-218-02）。
- [ ] AC-09: 送信前サイズ上限が REQ-215 の主担当である旨と、クライアント側上限（`MAX_FILE_SIZE`/`MAX_PHOTOS`/`MAX_AUDIO_SIZE`）がバイパス可能でサーバー上限が必要である根拠が、本 REQ に記録されている（重複実装なし）。

## 影響範囲
- `supabase/functions/analyze-image/index.ts` / `analyze-audio/index.ts`（retry のバックオフ + 全体タイムアウト + 最大試行回数 env 化、`AI_ANALYSIS_ENABLED` の skip 分岐、冪等性ガードのコメント / 位置づけ明確化）
- `supabase/functions/_shared/`（kill switch フラグ / リトライ設定の共通ヘルパ、必要ならバックオフユーティリティ。`aiRateLimit.ts` / `webhookAuth.ts` / `aiLogging.ts` と共存）
- `supabase/functions/_shared/__tests__/` / `analyze-image/__tests__` / `analyze-audio/__tests__`（バックオフ / 全体タイムアウト / disabled skip / 冪等性の単体テスト）
- `.env.example`（`AI_ANALYSIS_ENABLED` / `AI_MAX_RETRY` / `AI_REQUEST_TOTAL_TIMEOUT_MS` / コスト異常検知の閾値 env、開発 / 本番分離・プロジェクト単位課金の注記）
- `scripts/calc-ai-cost.ts` / `src/app/admin/ai-cost/page.tsx`（週次レビューへの組み込み・必要なら異常閾値の参照。コード変更は最小）
- フロント再分析経路（`src/views/admin/AdminPostsPage.tsx:179-182`・`src/hooks/useEditPost.ts:92`）（停止中のコスト発生前ガード。最小範囲）
- ドキュメント（本 REQ + 課金 kill switch / 予算運用手順。REQ-220 のインシデント runbook と相互参照）
- **ダッシュボード設定（コード外）**: Google Cloud 予算 / Cost Anomaly / クォータ、Vercel Spend Management / Firewall、Supabase 使用量確認、開発 / 本番プロジェクト分離。

## 優先度
- **緊急度**: Medium / **重要度**: High / **理由**: 通常運用では費用は小さいが、本 REQ が対象とするのは「**事故 1 回で月額枠を大きく超え得る**」テールリスク（再試行ループ・bot 大量投稿による AI / Storage / Egress・鍵漏えい）であり、一人運用の卒研 PF では支払い能力に直結する。予算アラートは自動停止しないため、**「即座に止める手段（kill switch）」と「暴走しないリトライ設計」が無い現状は穴**。一方、大半は env フラグ追加・retry の堅牢化・ダッシュボード設定 + 文書化で対応でき、無料〜低額枠で完結する。入口防御は REQ-212、AI 出力 / サイズ検証は REQ-215 に委ね、本 REQ は「コストを止める / 検知する / 説明できる」ガードレールに集中することで、低コストかつ高い保険効果を得る。
