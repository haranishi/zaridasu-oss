# REQ-077: Phase 2 — クライアント事前ゲート + 入力圧縮

> **親要件**: REQ-074
> **位置づけ**: Phase 2 / **REQ-075（評価基盤）の完了が前提依存**。Phase 1 と並行可能
> **作成日**: 2026-04-22
> **ステータス**: TODO

---

## これは何か

AI 判定コスト削減の Phase 2。**投稿前にクライアントで明らかにダメな入力を弾き**（API 呼び出し回数削減）、**AI 判定用に縮小・圧縮した派生バリアントを別途生成して送る**（入力トークン削減）ための要件定義。本文は下記の部品ファイルに逐語のまま分割してある。

## 目的・背景の要約

現状、無音や極端なブレ写真でも投稿が成立して Gemini API が呼ばれる。さらに音声・画像は**本番アップロードサイズのまま** Edge Function から Gemini に送られており、入力トークン量が大きい。事前ゲートで API 呼び出しを 10〜20%、圧縮で入力トークンを 50〜70% 削り、Phase 1 残コストに対し **-30%** を狙う。

## 主要な決定事項の要点

- **ゲートは警告のみで強制弾きにしない。** 誤検知時のユーザー救済として「それでも投稿する」を必ず出す（無音 RMS < -45dBFS／1秒未満／解像度 200px 未満／Laplacian variance < 100）。
- **圧縮仕様**: 音声は 16kHz mono・Opus 32kbps、画像は長辺 1024px・JPEG q=85。モバイル実機で 3 秒以内。
- **元データは触らない。** AI バリアントは**同 bucket の別 path**（`{post_id}.ai.opus` / `{n}.ai.jpg`）に置く方式を第一候補とし、AI 専用 bucket 新設は代替案どまり。Edge Function は AI バリアントを優先 fetch し、404 なら元 URL に fallback（リトライしない）。
- **フィーチャーフラグ `AI_INPUT_COMPRESSION_ENABLED`** で段階ロールアウト。`shadow` 値でバリアント生成だけ先行できる。off 時は既存挙動と完全互換。
- **DB 変更なし・マイグレーション不要**（Storage path 規則の拡張のみ）。
- **技術的な要確認ポイントは Opus エンコードのモバイル Safari 互換性**。推奨ライブラリは `opus-recorder`（~30KB）、`@ffmpeg/ffmpeg.wasm`（~25MB）は重い。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-overview.md](REQ-077-ai-input-cascade-compression/01-overview.md) | 要件概要（背景・目的／スコープの含む・含まない／前提条件・制約） |
| [02-user-stories.md](REQ-077-ai-input-cascade-compression/02-user-stories.md) | US-077-01（投稿者の無駄投稿回避）・US-077-02（開発者の入力量最小化）と各受け入れ条件 |
| [03-functional-requirements.md](REQ-077-ai-input-cascade-compression/03-functional-requirements.md) | FR-077-01〜08（無音/長さ/解像度・blur チェック、音声・画像圧縮、AI バリアント保存、優先 fetch、フラグ） |
| [04-non-functional-requirements.md](REQ-077-ai-input-cascade-compression/04-non-functional-requirements.md) | 非機能要件（パフォーマンス／コスト削減目標／UX／セキュリティ／互換性） |
| [05-impact.md](REQ-077-ai-input-cascade-compression/05-impact.md) | 影響範囲（コード変更・新規ファイル・環境変数4本・Storage 構造・依存ライブラリ候補） |
| [06-screen-and-api-spec.md](REQ-077-ai-input-cascade-compression/06-screen-and-api-spec.md) | SC-077-01 投稿フォームの追加要素、API-077-01 バリアント参照規則、データモデル・マイグレーション |
| [07-acceptance-and-risks.md](REQ-077-ai-input-cascade-compression/07-acceptance-and-risks.md) | 受け入れ基準 AC-077-01〜07 と、リスク・トレードオフ5件の緩和策 |
| [08-plan-and-summary.md](REQ-077-ai-input-cascade-compression/08-plan-and-summary.md) | 実装優先度と計画（P1〜P3）、サマリーと次のアクション3件 |
