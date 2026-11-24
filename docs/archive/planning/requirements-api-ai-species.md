> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# 要件定義: API-003 Claude Vision API 種別自動判定

- **ID**: API-003
- **優先度**: 🟠 中（Phase C 実装）
- **使用API**: Anthropic Claude API（`claude-3-5-haiku-20241022`）有料
- **作成日**: 2026-03-15

---

## これは何か

投稿写真から生物の種別（アメリカザリガニ／ウシガエル）を Claude Vision で自動判定する構想を 2026-03-15 に検討した当時の要件定義。本ファイルを入口とし、本文は同名ディレクトリ配下の部品に逐語で分割している。

## 目的・背景

投稿者に専門知識がないと種別を誤って選んでしまい、データの精度が落ちる。写真を追加した時点でAIが「アメリカザリガニ（87%）」のように候補と確信度を提示できれば、現場で撮影するだけで正しい種別を付けられ、低信頼度の投稿を管理者が後から確認する道も開ける。

## 主要な決定事項（要点）

- 判定は写真の**1枚目のみ・1投稿1回**、非同期かつ非ブロッキング。**認証ユーザー限定**（匿名投稿はスキップ）。
- UIは確信度で出し分ける：80%以上=緑バナー＋採用ボタン／50〜79%=黄の参考表示／50%未満=グレーの「判定困難」／**失敗はサイレント無視**（バナーを出さない）。
- AI判定は提案にとどめ、採用/無視をユーザーが選ぶ。採用後も手動変更は可能。
- 実体は Edge Function `classify-species`（`notify-comment` の構造を踏襲、JWT認証必須）。`ANTHROPIC_API_KEY` はクライアントに出さず Edge Function シークレットで保持。
- モデルは `claude-3-5-haiku-20241022`。レスポンスは JSON スキーマでバリデートし、想定外の `species` は `unknown` にフォールバック（プロンプトインジェクション対策も兼ねる）。
- タイムアウトは10秒。写真なし投稿は機能スキップ。
- コストは約 $0.0004/回（月1,000投稿で約$0.40）。Anthropic コンソールで月次上限アラート $5 を推奨。
- 判定結果を残す `ai_species` / `ai_confidence` カラム追加は**任意**扱い。

## 部品

- [01-user-stories.md](requirements-api-ai-species/01-user-stories.md) — 投稿者・駆除作業者・データ品質管理者のユーザーストーリー。
- [02-functional-requirements.md](requirements-api-ai-species/02-functional-requirements.md) — F1 自動判定 〜 F5 フォールバックと制限（Claude へのリクエスト例のコード込み）。
- [03-nonfunctional-and-implementation.md](requirements-api-ai-species/03-nonfunctional-and-implementation.md) — 非機能要件（コスト・鍵の扱い・インジェクション対策）と新規/変更ファイル、DB追加のDDL。
- [04-cost-and-test-perspectives.md](requirements-api-ai-species/04-cost-and-test-perspectives.md) — 初期/成長期/拡大期のコスト試算とテスト観点5点。
