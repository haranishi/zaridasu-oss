## 背景
ザリダス (Next.js 15 / Supabase / Vercel) は、ユーザーが投稿した画像・音声を **Supabase Edge Functions（Deno）`analyze-image` / `analyze-audio` が Google Gemini に送信して種判定・品質・適切性を自動分析**し、その結果（`ai_result`）と判定（`status='approved'/'rejected'`・`auto_approved`）を **service_role で `posts` に書き戻す**設計になっている。Gemini の鍵検証用に `health-gemini`、失効検知通知に `notify-gemini-key-failure` も持つ。

この設計の肝は「**ユーザー投稿コンテンツを AI が自動判定し、人手レビュー無しで承認/却下という権威ある状態遷移を行う**」点にある。つまり Gemini のレスポンスは「外部 API かつユーザー入力が混ざった出力」であり、(1) 出力を無検証で信用すると不正な値が DB / UI / 自動承認に流れ込み、(2) 画像内の文字・ファイル名・音声内容などユーザー由来コンテンツがプロンプトに混ざるとプロンプトインジェクションで判定を誘導され得る。

本 REQ は、Obsidian ノート **05_AI_Security / 24_AI_Agent_Production_Governance / 04_API_Automation_Security** を下敷きに、OWASP API Security Top 10 の **API10:2023 Unsafe Consumption of APIs（外部 API 出力を無検証で信用しない）** と LLM プロンプトインジェクション対策の観点で、現状の AI パイプラインを堅牢化する。

既存の関連 REQ とは役割を分ける（重複させない）:
- REQ-079: 再分析（reanalysis）経路の**日次レート制限**（`AI_REANALYSIS_DAILY_LIMIT`）。
- REQ-126〜128: Gemini の **鍵失効検知・エラー分類・通知**（`gemini_auth` 集計、`notify-gemini-key-failure`、`health-gemini`）。
- REQ-127 / REQ-130: `responseSchema` 導入・`finishReason`/`blockReason` ハンドリング・MAX_TOKENS retry・`thinkingBudget`。
- REQ-129: dedup スコープ限定。
- REQ-131: webhook 共有秘密（`WEBHOOK_SECRET`）。

本 REQ はこれらの上に立ち、**「プロンプト堅牢化（システム指示とユーザーデータの分離・許可リスト/列挙型化）」「AI 出力のスキーマ事後検証（responseSchema を信用しきらない）」「AI 権威化（自動承認/却下）の濫用防止」「Gemini への送信データ最小化」** に集中する。

> 実装時の注意: Gemini の `responseSchema` は「Gemini 側が尽力する制約」であり、**出力が必ず schema 通りである保証は無い**（特に `finishReason=SAFETY/MAX_TOKENS` 時や schema 非対応のフォールバック時）。本 REQ の出力検証は responseSchema の有無に依存しない「受信後の防御層」として実装すること。Gemini レスポンス本文（`rawText`）はユーザー由来テキストとして扱い、ログ / 通知に貼る際は既存 `redactAiErrorMessage`（`_shared/aiLogging.ts:137`）を必ず通す。
