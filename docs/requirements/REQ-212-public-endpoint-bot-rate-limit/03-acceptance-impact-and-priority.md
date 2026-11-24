## 受入条件

- [ ] AC-01: 同一 IP から公開書き込み経路（通報 / コメント / いいね / 投稿のいずれか）へしきい値超の連続リクエストを送ると、**DB に到達する前にエッジ（Middleware または Vercel Firewall）で 429 + `Retry-After`** が返る。しきい値内は通る。
- [ ] AC-02: 未認証で同一 post / 同一 IP から通報を連打しても、`flag_post_on_reports` の 3 件しきい値（`schema.sql:296-297`）を**通報スパムだけでは満たせない**（FR-212-02 の上限で弾かれる）。正規の別ユーザー 3 名の通報では従来どおりフラグが立つ。
- [ ] AC-03: comments / likes に user_id（+IP）単位のレート制限が存在し、認証済み 1 アカウントからのコメント / like 連投が上限で拒否される（DB トリガーで強制。エッジ無効でも DB で止まる）。
- [ ] AC-04: `AuthModal` の signup / reset（および適用範囲とした経路）で CAPTCHA token 無し / 不正 token の場合に Supabase Auth がリクエストを拒否し、bot による自動サインアップ / 確認メール濫用が成立しない。site key は `NEXT_PUBLIC_*`、secret はクライアントに露出しない。
- [ ] AC-05: 単一アカウント（email）に対し**複数 IP**から連続ログイン失敗を行うと、IP 単位ではすり抜ける攻撃が **email（アカウント）単位の計数 + 指数バックオフ or CAPTCHA** で抑止される（FR-212-05）。エラーメッセージは email enumeration を誘発しない汎用文言のまま。
- [ ] AC-06: AI 再分析を**多数の異なる post に対して**短時間に連打すると、post_id 単位は抜けても **caller/IP 単位の日次上限**で拒否される（FR-212-06）。取得失敗時は従来どおり fail-closed。
- [ ] AC-07: 既存の DB トリガー（`check_post_rate_limit`・`check_survey_request_rate_limit`・`admin_login_*`）と pgTAP / 既存テストが**回帰なく通る**。エッジ層を一時的に無効化しても、これらの DB 上限が依然として強制される（多層性の確認）。
- [ ] AC-08: CAPTCHA / Upstash 導入後も、`next.config.ts` の CSP 配下で CAPTCHA ウィジェットが正常表示・送信でき、既存ページ（地図・投稿・認証）の CSP 違反コンソールエラーが出ない。閲覧系は 429 で巻き込まれない（NFR-212-02）。

## 影響範囲

**変更 / 追加対象（想定）:**
- `package.json` / `package-lock.json`（`@upstash/ratelimit`・`@upstash/redis` 追加。FR-212-01 の選択次第）
- `src/middleware.ts`（`matcher` 拡張・エッジ rate limit）／必要に応じ公開書き込み用 Route Handler
- `vercel.json` または Vercel ダッシュボード（Firewall / rate limiting rules）
- `src/components/modals/AuthModal.tsx`（CAPTCHA ウィジェット・`captchaToken` 送出）
- `supabase/migrations/` + `supabase/schema.sql`（reports / comments / likes のレート制限トリガー追加。posts 同設計）
- `supabase/functions/_shared/aiRateLimit.ts` ほか AI 関数（caller/IP 単位スロットル追加）
- `next.config.ts`（CSP に CAPTCHA ドメイン追記）
- `supabase/tests/`（新規レート制限トリガーの pgTAP。`rls_posts.sql` のレート制限テスト書式を踏襲）
- Supabase ダッシュボード設定（Auth CAPTCHA provider / secret）・環境変数（Upstash URL/token、CAPTCHA site/secret key、`AI_REANALYSIS_*` 系の追加変数）

**他機能への影響:**
- 既存 DB トリガー / `admin_login_*` レート制限（REQ-001 / REQ-018 / REQ-079 / REQ-149）は維持・補完（多層化）。重複ではない。
- 認証 UX（CAPTCHA 追加・段階適用の検討）、通報 / コメント / いいねの正規利用上限（しきい値設計が UX を左右）。
- 閲覧可用性（NFR-212-02 のしきい値・fail-open 設計に依存）。
- コスト（Vercel Function / Supabase Egress / LLM の濫用抑止＝意図どおりの削減方向。25 番ノート）。

## 優先度
- **緊急度**: Medium〜High / **重要度**: High
- **理由**: 通報・コメント・いいねの**完全な無制限**（特に通報スパムによる任意投稿の不正フラグ化＝検閲攻撃、AC-02）と、一般認証の **CAPTCHA / アカウント単位バックオフ欠如**（ブルートフォース・サインアップ濫用・確認メールコスト）は、公開市民科学 PF として実害が出やすい穴。さらに全公開トラフィックがオリジン / Supabase に到達してから弾かれる構造は、bot 流入時に Vercel Function / Egress / LLM のコスト濫用（25 番ノート）に直結する。一方で、Vercel Firewall 無料ルール・Supabase 組み込み CAPTCHA・Upstash 無料枠・posts と同設計の DB トリガーという**既存資産の延長で低コストに多層化**でき、費用対効果が高い。
