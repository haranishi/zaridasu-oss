## 背景

2026-05-12 16:31 由利本荘市のテスト投稿（AI 生成画像のアメリカザリガニ）で `analyze-image` が `SyntaxError: Unterminated string in JSON at position 42 (line 1 column 43)` を吐いた。エラーメッセージ位置から、**Gemini が JSON を途中まで返した時点で `finishReason: "MAX_TOKENS"` でカットされている**ことが分かる。

加えて UI 上は「AI判定失敗（詳細不明）」となっており、REQ-125 で実装した `error_kind` 表示が機能していない。Supabase Functions の運用ログ (`supabase functions list --project-ref edxmkqmjzbarjdgnkcvc`) を確認したところ:

```
analyze-image  ACTIVE  version 19  UPDATED_AT 2026-05-08 13:35:01 UTC
```

REQ-125 を含むコミット `4d13ca5` (2026-05-12) より **4 日古い**ため、本番 Edge Function は `error_kind` を全く書いていない状態だった。

つまり今回の障害は次の 2 つが重なっている:

1. **デプロイラグ (運用課題)**: `git push` だけでは Supabase Edge Function は本番反映されない。`supabase functions deploy` を個別に走らせる手順がオペレータの記憶に依存している
2. **`analyzeWithGemini` の脆弱性 (実装課題)**: `maxOutputTokens=300` の壁・`finishReason` 未参照・JSON 抽出の単純さ・retry 不在のいずれもが Gemini 側の確率的事象に対して無防備
