## 目的
- 公開入力経路（投稿・通報・コメント・いいね・調査依頼）と認証系（signin/signup/reset/resend）に、**エッジ層のレート制限**と**bot 対策（CAPTCHA）**を多層で追加する。
- 既存の DB トリガー / `admin_login_*` レート制限を**最終防衛線として維持**しつつ、その手前で大量・自動化トラフィックを間引き、Vercel Function / Supabase Egress / LLM のコスト濫用（25 番ノート）を抑止する。
- ブルートフォースを **IP 単位だけでなくアカウント（email）単位でも計数**し、一般認証の保護レベルを管理者ログインと揃える。
- 利用者 / IP / トークン単位の上限、最大入力サイズ・同時実行・キュー長の上限（10 番ノート）を、サービス側クォータ + アプリ側制限の併用で担保する。

## 要件

### 機能要件

- [ ] FR-212-01: **エッジ rate limit 基盤の導入**。`@upstash/ratelimit` + `@upstash/redis`（Upstash 無料枠）を `package.json` に追加し、Next.js Middleware（`src/middleware.ts`）の `matcher` を拡張して公開 API 経路にもミドルウェアを通す。固定ウィンドウまたはスライディングウィンドウで **IP 単位**（`extract_request_ip` と同じ優先順＝`cf-connecting-ip` → `x-forwarded-for` 末尾 → `x-real-ip`、`schema.sql:100-124` に合わせる）に制限する。上限超過時は HTTP 429 + `Retry-After` を返す。Upstash 接続不可時は **fail-open（閲覧可用性優先）/ fail-closed（書き込み経路）を経路別に判断**して明記する。
  - 代替案（推奨度: 併用可）: Vercel ダッシュボードの **Firewall（managed rules + custom rate limiting rules、無料枠）**で、攻撃 IP / 地域 / 高頻度パスをエッジでブロックする。Middleware による細粒度制限と Firewall の粗い前段ブロックを**併用**する（25 番ノート: エッジで早期に弾く）。`vercel.json` または Vercel ダッシュボードのいずれで管理するかを決め、本 REQ に記録する。
- [ ] FR-212-02: **通報のレート制限**。reports INSERT に頻度上限を追加する。実装は次のいずれか / 併用：
  - (a) **DB トリガー**（既存 `check_*_rate_limit` と同設計・推奨）: reports の BEFORE INSERT で、`reporter_ip`（INSERT 前に `extract_request_ip()` で設定）または `post_id` 単位に「同一 IP からの通報 N 件 / 時間」「同一 post への同一 IP 通報は 1 回」等を強制し、`flag_post_on_reports`（`schema.sql:292-305`）の不正フラグ悪用を防ぐ。`SECURITY DEFINER` + `SET search_path = public`。
  - (b) **エッジ**（FR-212-01）: 通報送信経路を Route Handler 化（または既存経路の前段）で IP 単位スロットル。
  - 少なくとも「**同一 IP / 同一 post への通報の連打で容易に is_flagged を立てられない**」状態にする。
- [ ] FR-212-03: **コメント・いいねのレート制限**。comments / likes の INSERT に user_id 単位（および IP 単位）の頻度上限を、posts と同設計の DB トリガー（`SECURITY DEFINER` + `SET search_path = public`、admin 素通り）で追加する。目安は本 REQ 内で決める（例: コメント 1 分 N 件・24h M 件、like 1 分 N 件）。コメントは `notify-comment` のメール送信コスト（`CommentSection.tsx:99-101`）も誘発するため、過剰送信を抑える水準にする。
- [ ] FR-212-04: **認証フォームの CAPTCHA**。Supabase Auth 組み込みの CAPTCHA（hCaptcha または Cloudflare Turnstile）を有効化し、`AuthModal.tsx` の signin / signup / reset / resend（`AuthModal.tsx:95,127,156,183`）で captcha token を `options: { captchaToken }` として送る。Supabase ダッシュボードで CAPTCHA provider と secret を設定する手順を記録する。site key は公開（`NEXT_PUBLIC_*`）、secret は Supabase 側に保持する。
  - 代替 / 補完: bot が顕著な経路（signup・reset・resend）を優先適用し、通常 signin は「失敗 N 回後にのみ CAPTCHA を出す」段階適用も検討可（UX 配慮）。本 REQ 内で適用範囲を確定する。
- [ ] FR-212-05: **一般認証のブルートフォース計数（アカウント単位 + IP 単位）と指数バックオフ**。管理者ログイン（`admin_login_*`）と同様の保護を一般 signin にも広げる。実装は次のいずれか：
  - (a) Supabase Auth + CAPTCHA（FR-212-04）+ エッジ IP rate limit（FR-212-01）の組合せで、IP 単位の連続失敗を抑える。
  - (b) 加えて **email（アカウント）単位**の失敗計数を追加し（分散 IP からの単一アカウント狙いを検知。12 番ノート: IP だけだと分散攻撃をすり抜ける）、しきい値超過で**指数バックオフ**（待機時間を回数に応じて増やす）。`admin_login_record` の (email_hash, ip) 設計（`schema.sql:1055-1071`）を一般ログインに転用するか、Supabase の組み込み保護 + CAPTCHA で代替するかを判断・記録する。
  - email enumeration を誘発しないエラーメッセージ（既存 `AUTH_ERROR_MAP` の汎用化方針・`AuthModal.tsx:16-22`、REQ-018D）は維持する。
- [ ] FR-212-06: **重い / コスト直結処理（AI 再分析）の caller 単位スロットル**。`checkReanalysisRateLimit`（`aiRateLimit.ts`）の post_id 単位に加え、**caller（user_id）/ IP 単位の日次上限**を Edge Function 側に追加し、横断的 reanalysis 連打による LLM コスト膨張を抑える。fail-closed（取得失敗時は拒否）は維持。`AI_REANALYSIS_DAILY_LIMIT` と同様に環境変数で調整可能にする。
- [ ] FR-212-07: **入力サイズ / 同時実行 / キュー長の上限**（10 番ノート）。投稿の写真枚数・サイズ（既存 `MAX_PHOTOS` / `MAX_FILE_SIZE`・`usePostForm.ts:5-8`）に加え、(a) 公開 Route Handler / Edge Function のリクエストボディ最大サイズ、(b) 同一 IP / user の同時実行（in-flight）上限、(c) 非同期処理（AI 解析）のキュー長上限が、サービス側クォータ（Supabase Storage / Edge Function、Vercel Function）+ アプリ側制限の併用で担保されていることを確認・補強する。不足分のみ追加する。

### 非機能要件

- [ ] NFR-212-01: **多層性の保持**。本 REQ の追加（エッジ / CAPTCHA）導入後も、既存 DB トリガー（`check_post_rate_limit`・`check_survey_request_rate_limit`・`admin_login_*`）は**削除せず最終防衛線として残す**。エッジ層が無効化 / バイパスされても DB 側で上限が強制されること。
- [ ] NFR-212-02: **可用性とのトレードオフ**。閲覧系（公開 GET / 地図・トレンド表示）はレート制限で巻き込まないか、十分に高いしきい値にする。Upstash / CAPTCHA provider 障害時の挙動（書き込みは fail-closed、閲覧は fail-open）を経路別に定義し、正規ユーザーの締め出しを避ける。
- [ ] NFR-212-03: **コスト（一人運用の卒研 PF）**。導入する手段は無料枠 / 低コストを優先（Vercel Firewall 無料ルール、Supabase 組み込み CAPTCHA、Upstash 無料枠）。レート制限自体が高コストにならないこと（25 番ノート: 防御がコスト濫用にならない）。
- [ ] NFR-212-04: **観測性**。429 / CAPTCHA 失敗 / バックオフ発火を集計（Sentry または `audit_logs`）し、しきい値調整と攻撃検知に使えること。`admin_login_record` が `audit_logs` に `login_failed` を残す（`schema.sql:1066-1067`）方式に倣う。PII（生 IP・email 平文）は残さない（IP は必要なら hash、email は `md5` 化＝既存方針・`schema.sql:1026`）。
- [ ] NFR-212-05: **CSP との整合**。CAPTCHA（hCaptcha / Turnstile）のスクリプト・iframe・接続先を `next.config.ts` の CSP（`script-src` / `frame-src` / `connect-src`・`next.config.ts:64-73`）に追加する必要があるため、許可ドメインを最小で追記し、既存ディレクティブを壊さないこと。
