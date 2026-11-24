## 機能要件

### 共通化（REQ-287 パターンの適用範囲拡大）

- **FR-309-01（P1）**: `escapeHtml` を `_shared/mailer.ts` の単一実装に統一する。
  - 5関数（`notify-post-status` / `notify-comment` / `notify-survey-request` / `notify-ai-anomaly` / `notify-gemini-key-failure`）のローカル定義を削除し、`import { escapeHtml } from '../_shared/mailer.ts'` に置換する
  - `_shared/mailer.ts:37` のコメント（「既存 notify-* と同一実装」）を、集約後の実態に合わせて更新する
  - **不変条件テストを追加する**: `_shared/__tests__/supabaseAdmin.test.ts` が採用している「`supabase/functions/` から対象関数を自動導出して各 `index.ts` のソースを検査する」方式で、「`escapeHtml` をローカル定義していないこと」を検査する。固定リストではなく自動導出にすることで、後から追加された関数も自動的に対象になる（同テストのコメントが固定リストの陳腐化問題を明記している）
  - `_shared/mailer.ts` を import すると Resend 関連のコードも読み込まれる点が問題になる場合は、`escapeHtml` を `_shared/html.ts`（仮）へ切り出して mailer から re-export する構成も可（→ 未確定事項1）

- **FR-309-02（P1）**: ラベル定義を `_shared/labels.ts`（新規）へ集約する。
  - `SPECIES_LABELS`（posts 用・2値）と `SURVEY_SPECIES_LABELS`（survey_requests 用・`unknown` を含む3値）を**別の定数として明示的に分ける**。現在 `notify-survey-request:33` の `unknown: '不明'` によって暗黙表現されている仕様差を、名前で明示する
  - `INFO_TYPE_LABELS` も同ファイルへ集約し、`social-announce:49` / `notify-weekly-digest:37` から import する
  - 対象6関数（`social-announce` / `notify-post-status` / `notify-research-adopted` / `notify-weekly-digest` / `notify-survey-request` / `analyze-image`）のローカル定義を削除する。`analyze-image:231` はAIプロンプト用途のため、同じラベルで足りるか（プロンプト向けに別表現が必要か）を確認したうえで移行する（→ 未確定事項2）
  - `src/lib/constants.ts:126`（クライアント正本）との同期は、`scripts/check-schema-types-sync.ts` と同種の機械検証で担保する。少なくとも「クライアント側 `SPECIES` の全コードが `_shared/labels.ts` にラベルを持つ」ことを検査する
  - FR-309-01 と同方式の不変条件テストで「各関数が `SPECIES_LABELS` / `INFO_TYPE_LABELS` をローカル定義していないこと」を検査する

### 可観測性と外部呼び出しの堅牢化

- **FR-309-03（P1）**: `_shared/observability.ts`（新規）を設け、Edge Function から使える `captureMessage` / `captureException` 相当のヘルパを提供する。
  - 実装手段は (a) Sentry Deno SDK、または (b) Resend による管理者メール通知（`notify-gemini-key-failure` と同型のパターン）のいずれかを選ぶ（→ 未確定事項3）
  - 少なくとも次の2つをアラート化する:
    - `_shared/webhookAuth.ts:75-87` の `event=webhook_secret_unset_passthrough`（**認証なし通過**というセキュリティイベント）
    - Resend の連続失敗（閾値は実装時に決める）
  - ヘルパ自身が失敗してもハンドラ本体を止めないこと（fail-soft）。ただし「アラート送信に失敗したこと」自体は安定した event タグ付きで console に残す
  - 秘密値・PIIを載せないこと（REQ-211）。本文に含める値は redact を通す

- **FR-309-04（P1）**: `_shared/fetchWithTimeout.ts`（新規）を設け、Edge Function の**全外部呼び出しを統一する**。
  - 既定タイムアウト: Resend 10秒 / Web Push 10秒 / 集約SNS API 15秒（環境変数で上書き可能にする）
  - 適用先: `_shared/mailer.ts:164` / `_shared/webpush.ts:211` / `notify-survey-request:78` / `notify-post-status:220` / `notify-comment` / `social-announce:167`
  - Gemini系（`AbortSignal.timeout()` 既設）も同ヘルパへ寄せられるなら寄せる。既存のリトライ・バックオフ・全体デッドライン設計（監査でクリーン確認済み）を壊さないこと
  - バッチ送信を `Promise.allSettled` の**小並列（5〜10・定数化）**へ変更し、**バッチ全体のデッドライン**（Edge Function の実行上限より短く設定）を設ける。デッドライン到達時は残件を送らずに終了し、送信済み件数を戻り値・ログに残す
  - 並列化により Resend / Web Push のレート制限に触れないことを確認する（→ 要確認）
  - 対象バッチ: `notify-weekly-digest:91`（最大500件）/ `notify-dormant-reengage:63`（最大200件）。`send-push:120-121` は1ユーザーの端末数ぶんのため逐次のままでよい

### 秘密値・PII の漏出面を閉じる

- **FR-309-05（P1）**: `notify-post-status/index.ts:235-237` に `redactAiErrorMessage` を適用し、HTTP応答は**固定文言**にする。
  - ログ: `console.error('[notify-post-status] Resend エラー:', redactAiErrorMessage(err))`
  - 応答: `{ error: 'mail_send_failed' }`（生本文を返さない）
  - `notify-survey-request:83-86` の実装形に揃える

- **FR-309-06（P2）**: `analyze-image/index.ts:1249-1250` の最終catchに `redactAiErrorMessage` を適用する（`analyze-audio:848` / `health-gemini:118` と同形・実質1行）。

- **FR-309-07（P1）**: `_shared/mailer.ts:178-181` の throw を redact 済みメッセージに変更する。
  - `throw new Error(\`Resend ${res.status}: ${redactAiErrorMessage(err)}\`)`
  - **1箇所の修正で3関数**（`notify-dormant-reengage:111` / `notify-weekly-digest:177` / `notify-research-adopted`）の fail-soft catch のログ漏洩が解消される

### 依存と定期実行

- **FR-309-08（P2）**: Edge Function の Deno 依存に更新経路を設ける。
  - **月次の更新 workflow** を追加する: `deno cache --frozen=false` 相当でロックを更新し、`deno test` が通ることを確認して PR を作成する（Dependabot が Deno を扱えないための代替）
  - `esm.sh/@supabase/supabase-js@2` の指定を `@2.110` 程度に絞り、フロント（`package.json:36` の `^2.110.7`）とのメジャー・マイナー乖離を縮める
  - `deno.land/std@0.168.0` の更新可否を確認する（破壊的変更があるため、`assertEquals` 等の import 先変更が必要になる可能性がある）
  - フロントと Edge の supabase-js バージョン差を検知するチェックを追加するかは任意（→ 未確定事項4）

- **FR-309-09（P2）**: `.github/workflows/backup.yml:86-87` の Supabase CLI を `ci.yml` と**同一バージョンにピン**する（現行 2.106.0）。ピンの理由（`latest` は Gateway Time-out で落ちる既知問題）を `ci.yml:180` と同様にコメントで明記する。あわせてバックアップ失敗を FR-309-03 のアラート経路へ流し、GitHub 既定メールのみに依存しない状態にする。

- **FR-309-10（P2）**: `eval:ai` / `cost:ai` を配線する。
  - `cost:ai` を**週次 workflow** で実行し、閾値超過時に warning を出す。secrets 未設定時は notice + exit 0 とする既存方式（`backup.yml` と同じガード）に従う
  - `eval:ai` は実行コスト（実際にGemini APIを叩く場合）を踏まえ、**`workflow_dispatch` の手動実行**として整備し、「`GEMINI_MODEL` またはプロンプトを変更するPRでは eval:ai を実行して結果をPRに貼る」ことを運用台帳（`docs/runbooks/`）に記載する（→ 未確定事項5）
  - どちらのスクリプトも現状 `tsconfig.json` の `exclude` により型検査対象外である点は本要件のスコープ外とする（別途 `scripts/` の静的検査を扱う要件で対応する）
