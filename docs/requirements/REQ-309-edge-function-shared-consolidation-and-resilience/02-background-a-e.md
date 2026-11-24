## 背景

### 問題A: `escapeHtml` が `_shared` にあるのに5関数で再実装（計6実装） — Medium

正本は `supabase/functions/_shared/mailer.ts:38` の `export const escapeHtml`。しかし同じ関数がローカル定義として5関数に残っている（実測）。

| ファイル | 行 |
|---|---:|
| `_shared/mailer.ts`（正本） | 38 |
| `notify-post-status/index.ts` | 43 |
| `notify-comment/index.ts` | 18 |
| `notify-survey-request/index.ts` | 41 |
| `notify-ai-anomaly/index.ts` | 63 |
| `notify-gemini-key-failure/index.ts` | 49 |

`_shared/mailer.ts:37` のコメント自身が状況を自認している。

```ts
/** XSS 防止: メール本文に差し込む動的値をエスケープする（既存 notify-* と同一実装）。 */
```

つまり `_shared` 側は**既存関数からのコピーとして作られ、旧5関数は未移行**である。現時点では6実装すべて同一処理（`& < > " '` の5文字置換）だが、エスケープ対象の追加や不具合修正が5関数へ伝播しない。

これらのメール本文には**利用者入力がそのまま差し込まれる**（投稿コメント、通報内容、調査依頼の理由、AI異常検知の詳細）。HTMLインジェクション対策が6箇所で独立している状態は、セキュリティ関連コードの管理として不適切である。

REQ-287 で service-role 集約を完了した直後であり、**同じ整理が未完のまま残っている**。

### 問題B: `SPECIES_LABELS` が7箇所に分散し、すでに乖離している — Medium

`SPECIES_LABELS`（種コード → 日本語表示名）の定義箇所（実測）:

| ファイル | 行 | 内容 |
|---|---:|---|
| `social-announce/index.ts` | 45 | american / bullfrog |
| `notify-post-status/index.ts` | 38 | american / bullfrog |
| `notify-research-adopted/index.ts` | 36 | american / bullfrog |
| `notify-weekly-digest/index.ts` | 33 | american / bullfrog |
| `notify-survey-request/index.ts` | 30 | american / bullfrog / **unknown: '不明'** |
| `analyze-image/index.ts` | 231 | （AIプロンプト用） |
| `src/lib/constants.ts` | 126 | クライアント正本 |

`notify-survey-request:33` だけが `unknown: '不明'` を持ち、**すでに乖離している**。挙動としては妥当（`survey_requests.species` は3値、`posts.species` は2値）だが、その仕様差が**定義の分散によって暗黙に表現されている**だけで、どこにも明示されていない。

`INFO_TYPE_LABELS` も2箇所に重複している（`social-announce:49` / `notify-weekly-digest:37`）。

対象種を追加するとき（例: 別のザリガニ種を追加）、メール4本＋SNS投稿＋AIプロンプト＋クライアント定数の**7箇所以上**を直す必要がある。漏れると**利用者へのメールに生コード（`american` 等）がそのまま出る**。

### 問題C: Edge Function に集約監視が無く、障害はconsoleログのみ — Medium

Edge Function 14本に **Sentry の import は0件**である。メール送信・Web Push・Gemini課金という副作用と費用を持つ関数群の異常が、Supabase Edge ログの `console.error` にしか残らない。アプリ側は Sentry を3ランタイム（client / server / edge）で完備しており、**非対称**である。

`_shared/webhookAuth.ts:75-87` 自身が follow-up を明記している。

> NOTE(監視フック / follow-up): `_shared` に汎用 Sentry / メトリクスヘルパが無く（`aiLogging.logAiCall` は Supabase クライアント必須かつ `ai_call_logs` / AI 関数専用の型なので webhook 認証イベントには不適）、現状は安定した event タグ付き `console.warn` で代替する。……将来 `_shared` に Sentry 等を導入したら、ここに `captureMessage` / メトリクス計上を足すこと。

とくに問題なのが `event=webhook_secret_unset_passthrough` である。これは **`WEBHOOK_SECRET` が未設定で認証なしにリクエストが通過した**ことを示すセキュリティイベント（REQ-240 の grace period）だが、検知手段は Edge ログの目視のみである。

### 問題D: Resend / Web Push / 集約SNS API の呼び出しにタイムアウトが無い — Medium

Gemini系の呼び出しには `AbortSignal.timeout()` が付いている（`analyze-image/index.ts:442, 447, 512` 等）。一方、次の外部呼び出しには `signal` が無い。

| 呼び出し | 場所 |
|---|---|
| Resend（ライフサイクル共通） | `_shared/mailer.ts:164` |
| Web Push | `_shared/webpush.ts:211` |
| Resend（調査依頼通知） | `notify-survey-request/index.ts:78` |
| Resend（投稿ステータス通知） | `notify-post-status/index.ts:220` |
| Resend（コメント通知） | `notify-comment/index.ts` |
| 集約SNS API | `social-announce/index.ts:167` |

さらに送信はいずれも**逐次ループ**である。

- `send-push/index.ts:120-121` — 1ユーザーの端末数ぶん（コメントに「バッチ上限 = 1 ユーザの端末数で十分小さい」と明記。ここは影響が小さい）
- `notify-weekly-digest/index.ts:91` — `WEEKLY_BATCH_LIMIT` 既定 **500件**
- `notify-dormant-reengage/index.ts:63` — `DORMANT_BATCH_LIMIT` 既定 **200件**

タイムアウトが無く逐次であるため、**1件のTCPハングが Edge Function の wall-clock 上限まで占有する**。結果としてバッチが途中で打ち切られ、REQ-280 で既知の「非冪等」性質と組み合わさって、**cron の次回実行で先頭から再送＝重複送信**になる。

### 問題E: `notify-post-status` が Resend エラー本文をログと500応答に生出し — Medium

`supabase/functions/notify-post-status/index.ts:235-237`:

```ts
if (!res.ok) {
  const err = await res.text()
  console.error('[notify-post-status] Resend エラー:', err)
  return new Response(JSON.stringify({ error: err }), {
```

Resend のエラー本文には**宛先メールアドレスが含まれうる**ため、REQ-211（エラーログのPII・秘密値除去）違反である。ログと HTTP 応答の**両方**に出ている。

同じ処理の姉妹実装は対応済みで、`notify-post-status` だけが取り残されている。

| 関数 | ログ | 応答/throw |
|---|---|---|
| `notify-survey-request:83-86` | redact 済み | `redactAiErrorMessage(err)` を throw |
| `notify-comment` | redact 済み | — |
| **`notify-post-status:235-237`** | **未対応** | **未対応（生本文を500で返す）** |
