# REQ-074: AI 判定 API コスト削減 — 全体概要

> **位置づけ**: 親ドキュメント / 個別 Phase は REQ-075 〜 REQ-079 を参照
> **作成日**: 2026-04-22
> **ステータス**: TODO（実装未着手・要件定義のみ）

---

## これは何か

Gemini API を使う AI 判定のコストを、精度を保ったまま段階的に削減するための**親要件**。
Phase ごとの詳細は REQ-075〜079 にあり、本ファイル自体の詳細は
`REQ-074-ai-cost-reduction-overview/` 配下に分割している。

## 目的・背景（要約）

posts の INSERT/UPDATE トリガーから `analyze-image` / `analyze-audio` が呼ばれ、
**全投稿に対して画像 1 回 + 音声 1 回（最大）**の API 呼び出しが発生している。投稿数の増加に対して
月額料金が線形に増えるため、精度を維持しつつ段階的に削減する。目標は現状比 **0.10〜0.15 倍（80〜90% 減）**。

## 主要な決定事項（要点）

- **5 Phase 構成**: Phase 0 評価基盤（REQ-075）→ 1 モデル切替（REQ-076）→ 2 入力ゲート+圧縮（REQ-077）
  → 3 Context Caching（REQ-078）→ 4 hash dedup + rate limit（REQ-079）。
- **Phase 0 が全 Phase の前提依存**。**精度低下の評価無しに Phase 1 のモデル切り替えを進めることは禁止**。
- 許容する精度低下は recall -3pt / precision -2pt / 自動却下の false positive +1pt 以内（誤却下を最も避ける）。
- クライアント側ゲートは**警告に留め強制弾きはしない**（誤検知時の救済を残す）。
- レイテンシは現状維持（P50 10 秒以内 / P95 15 秒以内）。ロールアウトはフラグ or 環境変数で段階的に行い即時ロールバック可能にする。
- DB スキーマ変更（`audio_hash` / `image_hash`）は Phase 4 のみ。AI 判定**精度の向上そのもの**は本要件の対象外。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-overview-and-scope.md](REQ-074-ai-cost-reduction-overview/01-overview-and-scope.md) | 要件概要（背景・目的・目標削減率）、スコープの含む/含まない、前提条件・制約（現行モデル・閾値） |
| [02-user-stories.md](REQ-074-ai-cost-reduction-overview/02-user-stories.md) | ユーザーストーリー US-001〜003（コスト抑制・投稿前ゲート・コスト可視化） |
| [03-functional-requirements.md](REQ-074-ai-cost-reduction-overview/03-functional-requirements.md) | 機能要件の俯瞰表 FR-074-01〜10（Phase と担当ドキュメントの対応） |
| [04-non-functional-requirements.md](REQ-074-ai-cost-reduction-overview/04-non-functional-requirements.md) | 非機能要件（コスト削減目標・精度許容範囲・レイテンシ・セキュリティ・可用性） |
| [05-impact.md](REQ-074-ai-cost-reduction-overview/05-impact.md) | 影響範囲（Phase 別のコード変更想定・追加する環境変数・DB スキーマ変更） |
| [06-acceptance.md](REQ-074-ai-cost-reduction-overview/06-acceptance.md) | プロジェクト全体の受け入れ基準 AC-074-01〜05 |
| [07-roadmap.md](REQ-074-ai-cost-reduction-overview/07-roadmap.md) | 実装ロードマップと依存関係の図、Phase 別の優先度・工数・想定削減効果 |
| [08-risks.md](REQ-074-ai-cost-reduction-overview/08-risks.md) | リスク・トレードオフ（精度低下・preview 依存・キャッシュ料金・hash 誤再利用など）と緩和策 |
| [09-summary.md](REQ-074-ai-cost-reduction-overview/09-summary.md) | サマリーと次のアクション |
