# AIは正規化した判定から審査状態を更新する

[analyze-image](../../supabase/functions/analyze-image/index.ts)と[analyze-audio](../../supabase/functions/analyze-audio/index.ts)は、メディアをGeminiへ渡して構造化した判定を作り、service-roleでpostsへ書き戻す。
**現行コードには自動承認・自動却下がある。** 手動審査の補助表示だけではない。以下の数値はコード上の既定で、本番環境の設定値は今回確認していない。

## 初回はDB起動、再分析は検証済みの本人か管理者

初回はINSERTトリガーから起動し、写真が無い・音声が無い・分析済みならスキップする。分析停止フラグや鍵未設定でも、既に保存された投稿は残る。
再分析は`reanalysis:true`を指定するが、ペイロードのメディアURLや種を信用しない。JWTの実ユーザーと所有者を確認し、DBから取得したURL・種を使う。管理者は他人の再分析と回数制限の例外になる。
この入口とservice-roleの責任は[Edge Functions](edge-functions.md)と[authorization](authorization.md)を参照する。

## 不明な値を承認に丸めない

[_shared/aiSchema](../../supabase/functions/_shared/aiSchema.ts)でモデル出力の真偽・信頼度・列挙値を正規化し、欠落や不正な値をnullとして扱う。
申告種は許可リストに限定し、プロンプト中でも「利用者の申告値」として指示から区別する。取得は `_shared/mediaFetch.ts` で許可ホストのStorage公開URLに限定し、リダイレクトを禁止する。Content-Lengthと逐次読みの上限で過大な本文を中止する。
画像の既定モデルは`gemini-2.5-flash-lite`、モデル名は環境で変更できる。JSONのresponseSchemaに加え、finishReasonとsafety拒否をパース前に確認する。

| 判定経路 | コード上の主な確定条件 |
| --- | --- |
| 画像による承認 | errorなし、適切性true、種一致true、信頼度が既定0.75以上、画質poor以外 |
| 画像による却下 | 承認条件を満たさず、高信頼の種不一致または不適切性false |
| 音声のみの承認 | 適切性true、種一致true、信頼度が既定0.85以上、音質poor以外 |
| 画像＋音声の統合 | 両方の適切性と種一致がtrue、各信頼度が既定0.75以上で承認。高信頼の相互矛盾は手動判断へ |
| 音声の却下 | 不適切性false、または高信頼の音声の種不一致。errorは却下に変換しない |

自動却下の信頼度既定は0.70。設定によるしきい値変更は許すが、承認・却下の下限0.5でクランプする。
複数画像はPromise.allSettledで分析し、成功分の多数決・画質の重み付き信頼度を使う。一部失敗は `failed_count` に残し、適切性を不明（明示的falseを除く）にして承認を止める。全件失敗ならerrorになる。
承認時は`auto_approved=true`、`reviewed_at`と`reviewed_by=null`を付ける。再分析で確定条件を満たさなければ、承認済み投稿をpendingへ戻す分岐もある。

## 画像と音声の保存は原子的な統合ではない

音声側はDBにある画像結果を読み、写真があるのにまだ無ければ`waiting_for_image_analysis`を残す。
画像側は画像単独の自動審査を持ち、dedup時には既存音声を使った統合判断も再計算する。
両関数は独立にai_resultとstatusを更新するため、全画像・音声が完了したあと1回だけ確定するトランザクションではない。処理順序や同時更新による結果の上書きを、今回の文書化で解消したとは扱わない。
`combined_decision`があることだけを根拠に、画像側のstatus更新も常に統合判断へ従うと説明しない。

## 重複結果の再利用と文脈キャッシュは目的が違う

[_shared/aiDedup](../../supabase/functions/_shared/aiDedup.ts)は原本からサーバーが計算したSHA-256と、既存postsの `ai_result.image_sha256s` / `audio_sha256` を照合して判定を再利用する。申告ハッシュ列は検索に使わず、検証済みハッシュのない旧投稿も流用しない。画像は申告種とhash配列の長さ・順序まで一致させ、画像スコープだけをコピーする。
音声と画像の結果を混ぜず、別投稿の統合判断をそのまま持ち込まない。再分析ではdedupを省略し、再計算する。
[_shared/aiCache](../../supabase/functions/_shared/aiCache.ts)は固定の判定基準をGemini Context Cacheへ置き、function＋modelのcache_idを`ai_cache_registry`に保存する。判定結果のキャッシュではない。
文脈キャッシュは既定OFF。作成・照会失敗は通常推論へ戻す。更新失敗時は旧cache_idを返す分岐があり、キャッシュ有効性そのものを成功保証にはしない。

## 再分析・retry・停止で課金を抑える

| 制御 | 実装と限界 |
| --- | --- |
| 同じ投稿の再分析 | [aiRateLimit](../../supabase/functions/_shared/aiRateLimit.ts)がAIログの24時間件数を集計。既定3回、集計失敗は拒否 |
| 利用者横断の連打 | 同じ共有部品がインメモリで既定20回／24時間。ワーカー間で共有されず、粗いバースト制御 |
| 限定retry | [aiRetryConfig](../../supabase/functions/_shared/aiRetryConfig.ts)を使いMAX_TOKENSだけ再試行。既定2回、出力上限を倍化、指数待機と揺らぎを追加 |
| 全体時間 | retryの次の試行へ進む前に既定120秒の予算を確認。実行中fetchをこの予算だけで強制中断する仕組みではない |
| 即時停止 | [aiKillSwitch](../../supabase/functions/_shared/aiKillSwitch.ts)の`AI_ANALYSIS_ENABLED=false`等で分析をskip。投稿は保存し手動確認へ |

モデルの一時障害すべてを成功するまでretryする設計にはしない。429・5xxと、鍵不備・safety・JSON失敗を分類し、分析失敗数とエラー情報を保存する。
`ai_failure_count`は失敗で加算し、成功時にリセットする。[_shared/aiLogging](../../supabase/functions/_shared/aiLogging.ts)は使用token・時間・dedup／cache状態を運用ログへ書き、記録失敗で本体を止めない。
回数制限はこのログに依存するため、ログが課金の完全な会計記録だとは扱わない。

検証の根拠は[画像テスト](../../supabase/functions/analyze-image/index.test.ts)・[音声テスト](../../supabase/functions/analyze-audio/__tests__/handler.test.ts)・[aiSchema](../../supabase/functions/_shared/__tests__/aiSchema.test.ts)・[dedup](../../supabase/functions/_shared/__tests__/aiDedup.test.ts)・[retry](../../supabase/functions/_shared/__tests__/aiRetryConfig.test.ts)・[停止](../../supabase/functions/_shared/__tests__/aiKillSwitch.test.ts)。
運用は[モデルrollback](../runbooks/ai-model-rollback.md)・[コスト停止手順](../runbooks/cloud-cost-guardrails.md)へ進む。今回、Geminiの実呼出・本番の分析率・設定しきい値は確認していない。
