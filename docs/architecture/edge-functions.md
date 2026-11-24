# 外部連携はEdge Functionsで非同期に進める

写真・音声の分析、地名付与、通知はフロントの応答と切り離す。投稿の保存後に失敗しても、保存済みの観察記録を取り消さない構成である。
対象は[supabase/functions](../../supabase/functions)の14関数と共有部品。実際の配信設定・cron・秘密情報の登録状態は今回確認していない。

## 14関数の入口と責任

| 関数 | 主な入口 | 実行すること |
| --- | --- | --- |
| [analyze-image](../../supabase/functions/analyze-image/index.ts) | posts INSERT／本人・管理者の再分析 | 写真の種・品質・適切性を判定し、AI結果と審査状態を更新 |
| [analyze-audio](../../supabase/functions/analyze-audio/index.ts) | 音声付きINSERT／音声URL変更／再分析 | 鳴き声を判定し、画像との統合判断と審査状態を更新 |
| [enrich-place](../../supabase/functions/enrich-place/index.ts) | posts INSERTのDBトリガー | 字名・水系名・任意の水辺判定／標高を付与 |
| [health-gemini](../../supabase/functions/health-gemini/index.ts) | 管理者JWT | Geminiへ最小のリクエストを送り、鍵・モデルの疎通を診断 |
| [notify-comment](../../supabase/functions/notify-comment/index.ts) | コメント作成者のJWT | 実在する自分のコメントを読み直し、投稿者へメール |
| [notify-post-status](../../supabase/functions/notify-post-status/index.ts) | status変更のWebhook | 最新の承認・却下状態を読み直し、投稿者へメール |
| [notify-survey-request](../../supabase/functions/notify-survey-request/index.ts) | 依頼・状態・依頼コメントのDBトリガー | 新規依頼・結果・終了・会話のイベント別メール |
| [notify-research-adopted](../../supabase/functions/notify-research-adopted/index.ts) | 管理者の研究採用RPC | 研究採用を本人に知らせ、成功履歴を記録 |
| [notify-dormant-reengage](../../supabase/functions/notify-dormant-reengage/index.ts) | DBの日次バッチ | 休眠対象を抽出し、地域の活動を知らせるメール |
| [notify-weekly-digest](../../supabase/functions/notify-weekly-digest/index.ts) | DBの週次バッチ | 市区町村別の週間集計と任意の進行情報をメール |
| [notify-gemini-key-failure](../../supabase/functions/notify-gemini-key-failure/index.ts) | 運用の定期起動 | 認証系AIエラーを集計し、管理者へ警告 |
| [notify-ai-anomaly](../../supabase/functions/notify-ai-anomaly/index.ts) | DBの異常監視バッチ | 呼出急増・自動承認率などの異常を管理者へ警告 |
| [send-push](../../supabase/functions/send-push/index.ts) | DBの通知ラッパー | 1人の有効端末購読へWeb Push、失効購読の無効化 |
| [social-announce](../../supabase/functions/social-announce/index.ts) | 秘密付き運用POST／cron構成 | 注目投稿を選び、markerで重複を抑えてSNS集約APIへ告知 |

AIの細かな判断は[AI分析](notifications-ai-analysis.md)、宛先と配信条件は[通知](notifications-ai.md)に分けて説明する。

## DBからの起動と再分析では認証方法が異なる

初回AIは[AIトリガーmigration](../../supabase/migrations/20260421000001_ai_analysis_webhooks.sql)の`private.call_ai_edge_function`からpg_netで起動する。
Vaultの鍵と[共有Webhookヘッダー](../../supabase/migrations/20260717000001_webhook_secret_headers.sql)を使う。古いダッシュボード由来の画像トリガーは[追補migration](../../supabase/migrations/20260728000001_drop_legacy_analyze_image_webhook.sql)で削除する。
ブラウザが初回分析を二重invokeする設計にはしない。非同期呼び出しの警告・設定不足は投稿INSERTの失敗へ波及させない。

[webhookAuth](../../supabase/functions/_shared/webhookAuth.ts)は秘密が設定済みなら一致を要求する。未設定時は`WEBHOOK_SECRET_ENFORCE`が有効なら拒否し、無効なら警告を出して通過する移行用分岐が残る。
コードに検証ヘルパーがあるだけで「本番は必ず秘密で保護される」と断定できない。登録・ヘッダー付与・enforceの状態は[デプロイ手順](../runbooks/edge-function-deploy.md)で別に確かめる。
再分析は秘密を持たないクライアント経路なのでJWTを検証し、本人または管理者に限定する。`notify-comment`もJWTとコメント所有者を確認し、`health-gemini`は管理者JWTを要求する。
通知起動RPCの公開権限は[REQ-316](../../supabase/migrations/20260926175847_req316_notification_rpc_and_admin_guard.sql)でservice-roleへ絞る（[authorization](authorization.md)）。

## 共通部品は認証・コスト・配信を分担する

| 共有ファイル群 | まとめている判断 |
| --- | --- |
| [supabaseAdmin](../../supabase/functions/_shared/supabaseAdmin.ts)・[webhookAuth](../../supabase/functions/_shared/webhookAuth.ts) | RLSを迂回するクライアント生成、Webhookのアプリ層認証 |
| [aiSchema](../../supabase/functions/_shared/aiSchema.ts)・[aiLogging](../../supabase/functions/_shared/aiLogging.ts) | AI出力の正規化・上限、エラー分類・秘匿化・token使用量 |
| [aiDedup](../../supabase/functions/_shared/aiDedup.ts)・[aiCache](../../supabase/functions/_shared/aiCache.ts) | 同一メディアの結果再利用とGemini文脈キャッシュを別々に管理 |
| [aiRateLimit](../../supabase/functions/_shared/aiRateLimit.ts)・[aiRetryConfig](../../supabase/functions/_shared/aiRetryConfig.ts)・[aiKillSwitch](../../supabase/functions/_shared/aiKillSwitch.ts) | 再分析回数、限定retry、分析の停止 |
| [geocodeProvider](../../supabase/functions/_shared/geocodeProvider.ts)・[geocodeThrottle](../../supabase/functions/_shared/geocodeThrottle.ts) | 地名提供者の切替、外部取得と同一インスタンス内の間隔制御 |
| [mailer](../../supabase/functions/_shared/mailer.ts)・[webpush](../../supabase/functions/_shared/webpush.ts) | ライフサイクルメール3種の配信、VAPID署名・暗号化とPush送信 |

## 地名付与は取得不能と付与済みを区別して読む

`enrich-place`は小数3桁のgrid_keyで`geo_cache`を参照し、未期限切れなら再利用する。外部提供者はNominatimを既定に、OpenCage／Geoapifyへ設定で切り替える。
水辺判定と標高は既定OFF。`GEO_ENRICH_ENABLED=false`なら全体を止める。外部API失敗でも投稿は成立し、付与できない値はNULLで残る。
何も取れなかった結果はキャッシュしないが、postsには`geo_enriched_at`を付ける。再起動の無限ループを避けるためで、通常の再呼出はalready_enrichedで止まる。再付与には運用上の状態整理が必要になる。
スロットラーはPromiseチェーンによる同一Edgeインスタンス内の直列化で、複数インスタンス全体の1req/秒を保証するものではない。
地図用水域検索とこの逆ジオコーディングは別経路である（[water-geometry](water-geometry.md)）。

## SNS告知のmarkerは送信完了の証明とは限らない

`social-announce`は承認済みの候補から座標・個人情報を取らず、非公開Storageのmarkerを`upsert:false`で先取りする。
既定のdry-runでもmarkerを作り、その投稿は次回の候補から除外される。実送信へ切り替えるときは、この履歴を確認する必要がある。
実送信が失敗するとmarkerを解放して再試行を許す。一方、先取り後のプロセス停止や成功応答の紛失まで含む「厳密に1回の配信」は保証しない。

Edgeのデプロイはフロントと別で、共有部品の変更は複数関数へ波及する。[operations-ci](operations-ci.md)と[edge-function-deploy](../runbooks/edge-function-deploy.md)を使う。
根拠となる検査は各関数の`__tests__`／`index.test.ts`、[_sharedのテスト](../../supabase/functions/_shared/__tests__)、[通知入口のSQLテスト](../../supabase/tests/req316_notification_rpc_admin_guard.sql)。実配信・鍵・cronの状態はこれらの単体テストの検証範囲外である。
