### 問題B: 到達した攻撃者が起こせること — High

| 関数 | 具体的な影響 |
|---|---|
| `notify-post-status` | **任意の投稿所有者へのメール爆撃**。`{record:{id:'<任意のapproved投稿ID>'}, old_record:{status:'pending'}}` を投げると `index.ts:75` の「status 変化あり」判定を通り、`:95-99` で DB から実レコードを再 fetch、`:134` の `supabase.auth.admin.getUserById(record.user_id)` で所有者のメールを取得して送信する。payload の `record` を信用せず再 fetch する設計（REQ-131）は**文面細工は防ぐが連投は防がない**。REQ-280（通知の冪等性）が未実装のため**送信済みマーカーもレート制限も無い**ので、1 投稿あたり無制限に送れる。Resend の送信枠も消費される |
| `notify-weekly-digest` / `notify-dormant-reengage` / `notify-research-adopted` | ライフサイクルメールを**任意タイミングで全ユーザーに一斉送信**できる（pg_cron のスケジュールを無視できる） |
| `send-push` | Web Push を任意に配信できる |
| `enrich-place` | 外部ジオコーディングの従量枠を消費させられる |
| `analyze-image` / `analyze-audio`（webhook 経路） | Gemini 課金を消費させられる |
| `social-announce` | SNS 自動投稿を強制起動できる |

### 問題C: 失敗時に内部エラー文字列が無認可の呼び出し元へ露出する — Medium

上記の関数群は catch 節で `String(e)` をそのまま応答本文に載せる。

- `supabase/functions/notify-post-status/index.ts:251`
- `supabase/functions/send-push/index.ts:149`
- `supabase/functions/notify-weekly-digest/index.ts:185`
- `supabase/functions/notify-survey-request/index.ts:277`
- `supabase/functions/enrich-place/index.ts:212`
- `supabase/functions/notify-research-adopted/index.ts:124`
- `supabase/functions/notify-dormant-reengage/index.ts:119`
- `supabase/functions/social-announce/index.ts:280`

問題A により呼び出し元が「認可されていない任意の第三者」になり得るため、内部エラー文字列（DB のエラーメッセージ、外部 API の応答断片など）がそのまま外部へ渡る。同種の指摘は REQ-270 FR-270-03（`notify-gemini-key-failure` を `{error:'internal_error'}` に一般化）で既に方針が決まっており、**同じ処理が他の 8 本に適用されていない**という不統一である。

### 問題D: grace period 通過は warn ログに出ているが、誰も見ていない — Medium

`webhookAuth.ts:83-87` は `event=webhook_secret_unset_passthrough` という安定タグ付きで警告を出す設計になっており（REQ-240 FR-240-02）、コード側のコメントも「Supabase Edge のログドリブンなアラートがこの行を拾う」ことを前提にしている。しかし**そのアラートが設定されていない**ため、実際には「本番で無防備な呼び出しが起きている」ことが半年近く検知されていない。設計の意図が運用側で受け取られていない状態である。
