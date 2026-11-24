# REQ-078: Phase 3 — Gemini Context Caching の導入

これは何か: 固定プロンプト部分を Gemini の Cached Content として登録し、入力トークンを75%割引にするコスト削減要件（親要件 REQ-074 / Phase 3 / **REQ-076 完了が前提依存** / 作成日 2026-04-22 / ステータス TODO）。本文は分割ファイルに逐語で保管し、ここは入口（索引）。

## 目的・背景（要約）

`analyze-audio` / `analyze-image` のプロンプトには判定基準・出力フォーマット等の**完全に固定な長文部分（~500 tokens）**が毎回含まれ、毎リクエスト同じトークンを送り続けている。Gemini の Context Caching API に固定部分を事前登録すれば入力トークンが75%割引になるため、これを導入してさらなるコスト削減を行う。プロンプト内容の改善・参照音声の Few-Shot 化はスコープ外（精度要件で別途扱う）。

## 主要な決定事項（要点）

- **cache ID の保管先は案A＝新規テーブル `ai_cache_registry`**（TTL管理と監査が容易）。`function_name + model` のユニーク制約で refresh は UPSERT。
- **TTL 管理は Edge Function 内のチェック方式**を採用（cron 不要）。残り時間が `GEMINI_CACHE_REFRESH_MARGIN_SECONDS`（例300秒）を切ったら**非同期で**再作成し、呼び出し本体はブロックしない。
- **フェイルオープン必須**。cache miss / API エラー / cache ID 取得失敗時は cache 無しの通常リクエストにフォールバックし、判定処理は必ず完了させる。
- **フィーチャーフラグ `GEMINI_CACHE_ENABLED`（既定 false）**。off 時は既存挙動と完全互換。
- `analyze-audio` と `analyze-image` は**別々の cache ID**を持つ。モデル切替（REQ-076）時は cache を再作成する。
- **最大のリスクは最低トークン数の制約**（モデル別に 1024〜32768）。現行プロンプトは ~500 tokens で満たさない可能性があり、参照音声/画像で底上げする必要があるかもしれない。**着手前の実測が鍵**。
- 目標: cache hit 率 90% 以上、入力トークンに対し実効 -67% 程度、入力トークン量は施策前比 -50% 以上。

## 分割ファイル

- [01-overview.md](REQ-078-ai-context-caching/01-overview.md) — 親要件・位置づけ・ステータス ＋ 要件概要（背景・目的、スコープの含む/含まない、前提条件・制約）
- [02-stories-and-functional-requirements.md](REQ-078-ai-context-caching/02-stories-and-functional-requirements.md) — ユーザーストーリー US-078-01 ＋ 機能要件 FR-078-01〜05（cache 作成・ID保管・推論呼び出し・TTL refresh・統計ロギング）
- [03-non-functional-and-impact.md](REQ-078-ai-context-caching/03-non-functional-and-impact.md) — 非機能要件（コスト削減目標・料金・レイテンシ・可用性・互換性）＋ 影響範囲（コード変更・環境変数・DBスキーマ）
- [04-api-spec.md](REQ-078-ai-context-caching/04-api-spec.md) — API 仕様 API-078-01/02（Gemini Context Caching API のリクエスト/レスポンス、推論時の参照方法）
- [05-data-model-and-migration.md](REQ-078-ai-context-caching/05-data-model-and-migration.md) — `ai_cache_registry` のカラム定義・インデックス・RLS ＋ Migration-078-01 のSQL（Up/Down）
- [06-acceptance-and-risks.md](REQ-078-ai-context-caching/06-acceptance-and-risks.md) — 受け入れ基準 AC-078-01〜06 ＋ リスク・トレードオフ5件と緩和策
- [07-plan-and-summary.md](REQ-078-ai-context-caching/07-plan-and-summary.md) — 実装優先度と計画（P1〜P3）＋ サマリーと次のアクション3件
