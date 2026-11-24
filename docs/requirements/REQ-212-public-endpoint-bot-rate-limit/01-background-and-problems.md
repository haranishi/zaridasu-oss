## 背景

ザリダス（Next.js 15 App Router / Supabase SSR / Vercel）には、誰でも到達できる公開入力経路が多数ある（投稿フォーム、通報、コメント、いいね、調査依頼、認証 signin/signup/password-reset）。現状のレート制限は **DB トリガー中心**で、(1) 認証ユーザーの投稿（`check_post_rate_limit`、24h 5 件）、(2) 匿名投稿（1 分 3 件）、(3) 調査依頼（`check_survey_request_rate_limit`、24h 3 件）、(4) 管理者ログイン（`admin_login_check` / `admin_login_record`、IP+email_hash 単位 15 分 5 回）に限られる。クライアントの `checkSpamLimit` は localStorage 依存で容易にバイパス可能と本人もコメントしている。

この設計には次の構造的な穴がある。**通報・コメント・いいねには一切のレート制限が無く**、一般の認証フォーム（signin/signup/reset）にも bot 対策（CAPTCHA）が無い。さらに、すべての公開トラフィックは Vercel のオリジン（Next.js / Server Component / Edge Function）と Supabase に**そのまま到達**してから DB トリガーで弾かれるため、bot による大量リクエストは「弾かれる前」に Vercel Function 実行・Supabase 接続・Egress を消費する。LLM を呼ぶ AI 再分析（`analyze-image` / `analyze-audio` の reanalysis 経路）はフロントから直接 invoke 可能で、コスト直結の経路でもある。

本 REQ は、Obsidian ノート **10_Web_App_Security_Practical**（公開・認証・重い処理へのレート制限、入力サイズ/同時実行/キュー長の上限、サービス側クォータ + アプリ側制限の併用）、**25_Cloud_Cost_Abuse_Defense**（Egress / Function 課金の濫用防御、エッジで早期に弾く）、**03_Web_App_Security**（多層防御）、**12_Auth_Flows_Implementation**（ブルートフォースはアカウント単位でも計数・指数バックオフ・CAPTCHA）を下敷きに、**エッジ層の bot/レート制限と CAPTCHA を新規に追加**する。

> **重要（多層化であり重複ではない）**: 既存の DB トリガー / `admin_login_*` レート制限（REQ-001 / REQ-018 / REQ-079 / REQ-149 ほかで実装済み）は**維持・補完**する。本 REQ で足すのは「DB に到達する手前で弾くエッジ層」と「人間性を確認する CAPTCHA」であり、DB トリガーは最終防衛線として残す。前段（エッジ）で大量を間引き、後段（DB）で正確に上限を強制する役割分担にする。
>
> **一人運用の卒研 PF としての方針**: 大掛かりな WAF 製品ではなく、(a) Vercel Firewall の無料枠ルール（Vercel ダッシュボードの managed/custom rules・rate limiting）、(b) Supabase Auth 組み込み CAPTCHA（hCaptcha / Cloudflare Turnstile）、(c) 軽量な `@upstash/ratelimit` + Upstash Redis（無料枠）を優先する。コスト（Egress / Function 課金）の濫用観点（25 番ノート）を判断軸に含める。

## 現状の問題
（ファイルパス:行番号つき）

### 1. 通報・コメント・いいねにレート制限が一切ない
- **通報（匿名可）**: `src/components/modals/ReportModal.tsx:47-51` は未認証でも `supabase.from('reports').insert(...)` を直接実行できる。INSERT は RLS の `validated_insert_reports`（`supabase/schema.sql:278-284`）で **値のバリデーション（reason の列挙・comment ≤500 字・post_id NOT NULL）のみ**を行い、**頻度の上限が無い**。`reporter_ip` は `set_post_reporter_ip` 相当ではなく posts 側のトリガーで扱われ（reports 表は `reporter_ip TEXT`・`schema.sql:259`）、IP 単位の通報スロットルにも使われていない。結果、bot が 1 投稿に通報を連打すれば `flag_post_on_reports`（3 件で `is_flagged=TRUE`・`schema.sql:292-305`）を悪用して**任意の投稿を不正フラグ**できる（通報スパムによる検閲攻撃）。
- **コメント**: `src/components/features/posts/CommentSection.tsx:83-92` の `comments` INSERT は RLS `auth_insert_comments`（`schema.sql:325`、`auth.uid() = user_id`）で所有者判定するのみ。**頻度上限が無く**、認証済み bot アカウント 1 つでコメント連投（スパム / 通知 flooding。INSERT 後に `notify-comment` Edge Function を invoke する `CommentSection.tsx:99-101` 経由でメール送信コストも誘発）が可能。`comments` テーブルにレート制限トリガーは存在しない（`grep` で `check_post_rate_limit` / `check_survey_request_rate_limit` のみ・他テーブル該当なし）。
- **いいね**: `src/hooks/useLike.ts:87` の `likes` INSERT も頻度上限が無い。UNIQUE 制約で二重 like は防げても、多数 post への like 連打は抑止されない。

### 2. 一般認証フォーム（signin/signup/reset）に bot 対策（CAPTCHA）が無い
- `src/components/modals/AuthModal.tsx` は CAPTCHA を一切持たない（`grep -ni "captcha\|turnstile\|hcaptcha"` が 0 件）。
  - signin: `AuthModal.tsx:127` `supabase.auth.signInWithPassword({ email, password })`
  - signup: `AuthModal.tsx:156` `supabase.auth.signUp({ email, password })`
  - reset: `AuthModal.tsx:183` `supabase.auth.resetPasswordForEmail(...)`
  - resend: `AuthModal.tsx:95` `supabase.auth.resend(...)`
- ブルートフォース / クレデンシャルスタッフィングや、大量サインアップ・確認メール送信濫用（メール送信クォータの枯渇・コスト）を抑える仕組みが**アプリ側に無い**。reset / signup の cooldown は `RESEND_COOLDOWN_MS`（resend のみ、`AuthModal.tsx:97,181`）に限られ、IP / アカウント単位の計数は無い。
- 対照的に**管理者ログインだけ**は `admin_login_check` / `admin_login_record`（`schema.sql:1022-1071`）で IP+email_hash 単位 15 分 5 回・15 分ロック・`audit_logs` 記録を持つ（`AdminLoginPage.tsx:112,122,132`）。一般ユーザー認証は同等の保護が無く、**保護レベルが不揃い**。
  - **【訂正 2026-07-30 / REQ-292 問題B】** この「管理者ログインには保護がある」という前提は誤りだった。カウンタが増えるのはフロントが失敗を自発的に申告したときだけで、`/auth/v1/token` 直叩きでは記録されず**ロックは一度も発火しなかった**。さらに `admin_login_record` は anon に GRANT されていたため `p_success=true` を 1 回投げるだけでカウンタを自己解除できた。REQ-292 で anon GRANT 剥奪＋Password Verification Attempt Hook によるサーバー側記録に置き換えた。したがって本 REQ の「保護レベルが不揃い」という指摘は正しいが、不揃いの実態は「管理者=保護あり／一般=なし」ではなく**両方とも実効的な保護が無かった**である。
  - なお **FR-212-04（認証フォームへの Turnstile 付与）の主張はこの範囲では正しい**。Turnstile が効くのは `options.captchaToken` を渡す Auth SDK 呼び出し（`/auth/v1/*`）だけで、PostgREST の RPC / テーブル直 INSERT には介在しない。この境界を受容根拠に流用しないこと（詳細: `docs/security/captcha-setup.md`「Turnstile がカバーする範囲」）。

### 3. すべての公開リクエストがエッジで間引かれずオリジン / Supabase に到達する
- `src/middleware.ts:8-13` の `matcher` は `/dashboard/:path*` と `/admin/:path*` のみ。**公開ページ・公開 API 経路（投稿・通報・コメント・いいね・調査依頼）にミドルウェアが走らない**。
- `src/lib/supabase/middleware.ts` の `updateSession` も**認証ゲート（getUser リダイレクト）と Cookie 属性付与のみ**で、レート制限・bot 判定は行わない（`middleware.ts:36-61`）。
- `vercel.json`（全 6 行）に Firewall / rate limiting の設定が無い（`firewall` キー無し）。`package.json` に `@upstash/ratelimit` / `@upstash/redis` が無い（`package-lock.json` の該当ヒット 0）。
- すなわち bot の大量アクセスは **Vercel Function 実行・Supabase REST/Realtime 接続・DB トリガー評価・Egress を消費してから**弾かれる。DB トリガーは「正しく上限を強制」はするが「コストを発生させない」防御にはならない（25 番ノートの Egress/Function 課金濫用の観点で不十分）。

### 4. コスト直結の AI 再分析がフロントから invoke 可能で、エッジの絞り込みが無い
- AI 再分析（LLM コール）はフロントから直接 invoke される: `src/views/admin/AdminPostsPage.tsx:179-182`（`functions.invoke('analyze-image'/'analyze-audio', { reanalysis: true })`）、`src/hooks/useEditPost.ts:92`。
- 既存の絞り込みは `supabase/functions/_shared/aiRateLimit.ts`（`checkReanalysisRateLimit`、`AI_REANALYSIS_DAILY_LIMIT` 既定 3、**post_id 単位**・24h・取得失敗時 fail-closed・`aiRateLimit.ts:15-47`）**のみ**。
- post_id 単位なので、**多数の post に対する横断的な reanalysis 連打**（caller/IP 単位の上限が無い）に対しては素通りしうる。reanalysis 経路は webhook 共有秘密を要求しない設計（`analyze-audio/index.ts:476-479`、reanalysis=true はフロント invoke 前提）なので、認証付き利用者が大量呼び出しで LLM コストを膨らませる余地がある(推測：実害は呼び出し元の権限・UI 制約に依存)。
