# REQ-149: 管理者ログインのサーバーサイド レート制限＋監査ログ

## 背景

`/admin/login`（`src/views/admin/AdminLoginPage.tsx`）は管理者専用のログイン画面で、`supabase.auth.signInWithPassword()` を直接呼び出して認証する。現状のブルートフォース対策は **クライアント側の `sessionStorage` だけ** で実装されており、サーバー側にレート制限が存在しない。また、ログインの成功・失敗が `audit_logs` テーブルに一切記録されていないため、不正アクセスの試行や成功を後から追跡できない。

`audit_logs` は既に admin の状態変更操作（投稿削除・通報解決・admin 権限付与など）を記録する仕組み（`src/lib/auditLog.ts`、DB 側 `supabase/migrations/20240101000001_rls_and_audit_triggers.sql` ほか）として運用されているが、ログイン系イベントは対象外になっている。

## 現状の問題

（ファイルパス:行番号と現コードの実態）

- `src/views/admin/AdminLoginPage.tsx:10-12` — `MAX_ATTEMPTS = 5` / `LOCKOUT_MS = 15分` / `STORAGE_KEY = 'admin_login_attempts'` を定義し、試行回数を **`sessionStorage`** に保持している。
- `src/views/admin/AdminLoginPage.tsx:19-35` — `getAttempts()` / `saveAttempts()` / `clearAttempts()` がすべて `sessionStorage` 読み書き。**クライアント側のストレージのみ** が判定根拠になっている。
- `src/views/admin/AdminLoginPage.tsx:83-93` — `recordFailedAttempt()` が失敗回数をカウントし、5 回で `lockedAt` をセットしてロックする。しかしこのカウンタは:
  - DevTools コンソールから `sessionStorage.removeItem('admin_login_attempts')` で即リセット可能
  - シークレットウィンドウ / 別ブラウザ / `fetch` 直叩き / Supabase SDK 直接呼び出しで完全に迂回可能
  - 別 IP・別端末からの分散試行を一切検知できない
- `src/views/admin/AdminLoginPage.tsx:95-115` — `handleSubmit()` が `supabase.auth.signInWithPassword({ email, password })` を呼び、成否に応じて `recordFailedAttempt()` / `clearAttempts()` するのみ。**成功・失敗のいずれも `audit_logs` に記録していない**（`writeAuditLog()` の呼び出しが無い）。
- `src/middleware.ts:8-13` — `matcher` は `/dashboard/:path*` と `/admin/:path*` のみ。ログイン試行そのものに対するレート制限ロジックは middleware に存在しない。
- `src/lib/supabase/middleware.ts:5-88` — `updateSession()` はセッション検証とルートガードのみを行い、ログイン試行のカウント・IP ベースのスロットリングは行っていない。
- `src/lib/auditLog.ts:8-27` — `AuditLogParams.action` の型は `'delete_post' | 'delete_comment' | 'resolve_report' | 'grant_admin' | 'revoke_admin' | 'toggle_official' | 'approve_post' | 'reject_post'` のみで、`login_success` / `login_failed` 系のアクションが定義されていない。

### 緩和要因（既存の防御）

- **Supabase Auth 自体がサーバー側でレート制限を持つ**。Supabase の GoTrue は同一 IP・同一エンドポイントに対する認証リクエストにサーバー側スロットリングを適用しており、クライアント `sessionStorage` を迂回しても無制限のブルートフォースが即座に成立するわけではない。
- middleware（`src/lib/supabase/middleware.ts:41-52`）と admin layout 側で admin role を検証しているため、ログイン突破後も admin 権限が無ければ `/admin/*` には到達できない。
- そのため本件は「認証バイパス」ではなく **「観測性の欠如（監査ログ無し）」と「アプリ層のレート制限がクライアント任せで実効性が無い」** という多層防御の不足が主眼。

## 目的

1. ログイン試行（成功・失敗）のレート制限を **サーバー側で実効性のある形** に補強し、クライアント `sessionStorage` への依存を解消する。
2. ログインの成功・失敗を `audit_logs` に記録し、不正アクセスの試行・成功を後から追跡・アラート可能にする。
3. Supabase Auth のサーバー側レート制限を一次防御として活かしつつ、アプリ独自の監査・スロットリングを二次防御として追加する（多層防御）。

## 要件

### 機能要件

- [ ] **FR-149-01: サーバーサイドのレート制限**
  ログイン試行のカウントとロックアウト判定を **サーバー側（Edge Function / Route Handler / Postgres RPC のいずれか）** に移す。識別子は `(email, IP)` の組み合わせを基本とし、`src/utils/extractRequestIp`（REQ-139 で導入された IP 抽出ロジック）を再利用してスプーフィング耐性のある IP を取得する。閾値は現状踏襲で **同一識別子につき 15 分以内 5 回失敗で 15 分ロック**。
- [ ] **FR-149-02: ログイン失敗の監査記録**
  ログイン失敗時に `audit_logs` へ `action='login_failed'` を記録する。`target_type='user'`、`target_id` は試行された email のハッシュ（または email そのもの。PII ポリシーに従う）、`details` に `{ ip, attempt_count, reason }` を含める。`adminId` が確定しない失敗時のスキーマ上の扱い（`admin_id` を nullable にするか、システム用 sentinel ID にするか）を DB 制約と整合させる。
- [ ] **FR-149-03: ログイン成功の監査記録**
  ログイン成功時（`signInWithPassword` が `error` を返さなかった場合）に `audit_logs` へ `action='login_success'` を記録する。`details` に `{ ip, user_agent }` を含める。
- [ ] **FR-149-04: auditLog アクション種別の拡張**
  `src/lib/auditLog.ts:10` の `AuditLogParams.action` ユニオン型に `'login_success' | 'login_failed'` を追加する。DB 側の `audit_logs.action` の CHECK 制約（`supabase/migrations/20260513000003_audit_logs_check_extend_and_delete_trigger_defensive.sql` で拡張されたもの）にも同じ値を追加するマイグレーションを作成する。
- [ ] **FR-149-05: クライアント側 sessionStorage ロジックの位置づけ変更**
  `AdminLoginPage.tsx` の `sessionStorage` ベースのロックアウト表示は **UX 用の即時フィードバック** として残してよいが、認可・レート制限の根拠にはしない。サーバー側がロック中を返したら、その結果に従って UI をロック表示する（サーバーが真実の源）。
- [ ] **FR-149-06: ロック時のレスポンス**
  サーバー側がロック中と判定した場合、`signInWithPassword` を呼ばずにロック状態を返し、UI は既存の `t('admin.login.rateLimited', { minutes })` メッセージ（`AdminLoginPage.tsx:105,139`）を表示する。残り時間はサーバー応答の値を使う。

### 非機能要件（該当する場合）

- [ ] **NFR-149-01: 監査ログの完全性**
  `audit_logs` への書き込みは `writeAuditLog`（`src/lib/auditLog.ts:16-27`）と同様に fire-and-forget でログイン処理をブロックしないが、失敗時は `logError` で Sentry に送ること。ログイン成否の判定そのものは監査書き込みの成否に依存しないこと。
- [ ] **NFR-149-02: PII / 秘匿情報**
  `audit_logs.details` に **パスワードを絶対に記録しない**。email の取り扱いは既存 PII ポリシーに従い、必要ならハッシュ化する。IP は調査目的で保持する。
- [ ] **NFR-149-03: 可観測性**
  短時間に同一 IP / email から `login_failed` が閾値超過した場合に Sentry / アラートで観測できるよう、`details` に集計可能なキー（`ip`, `email_hash`, `attempt_count`）を含める。

## 受入条件

- [ ] **AC-149-01**: **Given** 攻撃者が DevTools で `sessionStorage.removeItem('admin_login_attempts')` を実行、**When** 同一 email/IP から 6 回目のログインを試行、**Then** サーバー側のロック判定により `signInWithPassword` が実行されず、ロックメッセージが返る（クライアントストレージのリセットで迂回できない）。
- [ ] **AC-149-02**: **Given** 正しい資格情報、**When** 管理者がログイン成功、**Then** `audit_logs` に `action='login_success'` の行が 1 件記録され、`details` に `ip` が含まれる。
- [ ] **AC-149-03**: **Given** 誤った資格情報、**When** ログインを 1 回失敗、**Then** `audit_logs` に `action='login_failed'` の行が記録され、`details` に `ip` と `attempt_count` が含まれ、`details` に password は含まれない。
- [ ] **AC-149-04**: **Given** 同一 email/IP で 15 分以内に 5 回失敗、**When** 6 回目を試行、**Then** サーバーがロック状態を返し、UI に `admin.login.rateLimited` メッセージと残り分数が表示される。
- [ ] **AC-149-05**: **Given** `src/lib/auditLog.ts` の型、**When** `writeAuditLog({ action: 'login_failed', ... })` を呼ぶ、**Then** TypeScript の型エラーが出ず、DB の CHECK 制約にも違反しない。
- [ ] **AC-149-06**: **Given** Supabase Auth 自体のサーバー側レート制限、**When** アプリ側レート制限を追加、**Then** 二重に発火しても正規ユーザーの正常ログイン（1〜2 回のリトライ）はブロックされない。

## 影響範囲

（変更対象ファイル一覧、他機能への影響）

| ファイル | 変更内容 |
|---|---|
| `src/views/admin/AdminLoginPage.tsx` | `sessionStorage` を UX 用に降格、サーバー側レート制限結果に従うよう変更。成功/失敗時のサーバー呼び出し追加 |
| `src/lib/auditLog.ts` | `action` ユニオン型に `login_success` / `login_failed` を追加 |
| 新規: ログイン試行のレート制限 + 監査記録を行う Route Handler / Edge Function / RPC | サーバー側でカウント・ロック判定・`audit_logs` 書き込み |
| 新規マイグレーション `supabase/migrations/*` | `audit_logs.action` CHECK 制約に `login_success` / `login_failed` を追加。必要なら `admin_id` の nullable 化 |
| `src/utils/extractRequestIp`（REQ-139） | 変更なし。IP 抽出に再利用 |

### 他機能への影響

- **REQ-018B（admin login lockout）**: 本要件は REQ-018B のクライアント側ロックアウトを **サーバー側へ昇格** させる延長線上の改善。`AdminLoginPage.tsx` のコメント `REQ-018B` 部分が対象。
- **REQ-139（extract-request-ip-spoofing）**: IP 抽出ロジックを再利用するため整合させる。
- **`audit_logs` 関連の RLS / トリガー**: `supabase/migrations/20260513000003_*` の CHECK 制約、`supabase/tests/rls_audit_logs.sql` のテストを更新する必要がある。
- **AdminLogsPage（`src/views/admin/AdminLogsPage.tsx`）**: 新しい `login_success` / `login_failed` アクションが一覧に表示されるため、ラベル定義（i18n）の追加が必要。

## 優先度

- **緊急度**: Medium（Supabase Auth のサーバー側レート制限が一次防御として効いているため、即時の認証バイパスリスクは低い）
- **重要度**: High（管理者ログインの監査ログが存在しないことは、インシデント対応・コンプライアンス上の重大な欠落。不正アクセスの成功すら検知できない）
- **理由**: クライアント `sessionStorage` のみのレート制限は実質ノーガードに等しく、容易に迂回できる。ただし Supabase Auth 自体のレート制限が緩和要因として働くため即時の致命傷ではない。一方で「ログイン成否が一切記録されない」という観測性の欠如は、攻撃の検知・事後追跡を不可能にしており、監査ログの追加（FR-149-02/03/04）が本件で最も価値の高い部分。実装コストは中程度。
