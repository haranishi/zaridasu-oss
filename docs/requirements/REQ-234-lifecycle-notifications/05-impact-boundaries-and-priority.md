## 影響範囲

**本 REQ が担う範囲（ライフサイクル層の追加）:**
- `supabase/functions/_shared/`（メール送信共通ユーティリティ＝List-Unsubscribe / 購読ゲート / fail-soft）
- `supabase/functions/notify-research-adopted/`（新規、研究採用通知）ほかライフサイクル送信関数（休眠復帰・週次ダイジェストは独立関数 or 共通関数 + event_type 分岐のいずれか）
- `supabase/migrations/`（購読カテゴリ列・研究採用データ・最終活動日時ビュー/関数・pg_cron 定期ジョブ。新規連番。過去 migration は改変しない）＋ `supabase/schema.sql`（同期）
- `src/views/ProfilePage.tsx`（カテゴリ別購読トグル）、配信停止用の公開ルート（新設）、`src/locales/{ja,en,ko,zh}/translation.json`（UI＋メール文言キー）
- ダッシュボード設定（pg_cron / pg_net の有効化、Edge Function Secrets）= IaC 化不可のため runbook 管理

**本 REQ が担わない範囲（既存 REQ との境界＝重複回避）:**
- メール到達性（SPF/DKIM/DMARC）と From 統一は **REQ-219** が主管（本 REQ は List-Unsubscribe 付与のみ）。
- PII/位置情報の保護方針は **REQ-211**（および `reporter_ip` の REQ-179）が主管。本 REQ はそれに従いメール本文の掲載を最小化する。
- 既存の取引通知（`notify-post-status` / `notify-comment` / `notify-survey-request` / `notify-gemini-key-failure`）の振る舞いは変更しない。
- Web Push 通知チャネルは **REQ-237** に委ねる（メール＝本 REQ、Push＝REQ-237 の役割分担）。
- ガードレール指標の可視化は **REQ-233**（卒研 KPI ダッシュボード）/ **REQ-232**（GA4 イベント）と連携（本 REQ は指標を定義・記録し、ダッシュボード実装は渡す）。

**他機能への影響リスク:**
- 配信頻度の増加は、設計を誤ると配信停止率・苦情率を押し上げ、ドメインの送信レピュテーションを毀損し **既存取引通知（承認/コメント等）の到達性まで巻き添えにする**。必ず opt-in 既定の見直し・ガードレール（FR-234-10）・List-Unsubscribe（FR-234-01）をセットで入れる。
- pg_cron/pg_net・vault キーは本番ダッシュボード設定に依存するため、未設定だと黙って no-op になる。runbook で有効化を確認し、ステージングで実送信を 1 通検証してから本番投入する。
- 研究採用通知は「研究貢献の実感」を返す強いフックである反面、**採用判断が恣意的/不透明だと不信を招く**。採用基準を明確にし、`audit_logs` で追跡可能にする。

## 優先度

- **緊急度**: Medium / **重要度**: High
- **理由**: 市民科学 PF の生命線は「最初の 1 投稿」より **継続観察（リテンション）** であり（`04_デジタルマーケ.md` L252「Retention を最初の北極星に」）、現状はライフサイクルメールも定期実行の土台も無く、一度投稿したユーザーを呼び戻す術がメールに無い（最大のボトルネックが放置されている）。とりわけ **研究採用通知は卒研 PF だけが返せる「研究貢献の実感」という最強の継続動機**で、低コストで効果が大きい。一方、休眠判定の集約・pg_cron 土台・i18n メール・配信停止ページなど **新規実装の幅が広く**、到達性（REQ-219）・PII（REQ-211）・Push（REQ-237）との境界整理も要るため、緊急度は中程度。まず **研究採用通知＋購読管理＋List-Unsubscribe＋ガードレール**（最も効く + 安全弁）を先行し、休眠復帰・週次ダイジェスト（pg_cron 依存）を続く段で固めるのが現実的（卒研 PF の一人運用として）。
