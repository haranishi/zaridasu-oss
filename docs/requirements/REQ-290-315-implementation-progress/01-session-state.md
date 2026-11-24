---

## ⚡ 2026-08-03 セッション末の状態（最新・まずここ）

- **REQ-298 完了**（FR-298-01〜07/09。PG17統一のみ別PR）。**REQ-316 起票**。すべて PR #31 に push 済み・CI 全ジョブ green。
- 本セッションの本体5コミット（`09ec31e` fix(db) → `43f0ab7` feat(ci) → `e027940`/`c55566c` docs → `fff025c` REQ-316起票）。
- **実測で確定した本番の実在欠陥3件**（REQ-298要件書の実装記録に詳細）:
  1. `20260513000014` の内容ドリフト（本番だけ REQ-208 前の関数）→ 巻き戻し＋`20260803000001` で追随
  2. `ALTER DEFAULT PRIVILEGES` が no-op → 本番で `detect_ai_anomalies` が anon 実行可 → `20260803000002` で4関数是正
  3. `get_ai_cost_summary` の三値論理バイパス（anon がすり抜け・一般authは弾かれる）→ REQ-316 で本体修正予定
- **本番未適用 migration が3本**（`20260730000001`=REQ-292 / `20260803000001`・`20260803000002`=REQ-298）。この状態で main push すると migration-gate が deploy を止める（意図どおり）。手順は `docs/runbooks/migration-deploy-order.md`。
- ⚠️ **GitHub Actions に Supabase secrets が未登録**なので、migration-gate と deploy-lag は **CI 上では skip（exit0）**。ゲートのロジックはローカル本番接続で実証済みだが、CI で赤くする効果は secrets 登録後（本人判断で保留）。

### PR 運用方針（2026-08-03 本人指示）
- **今後は機能ごとに細かく PR を分け、こまめにコミット・push・マージする。** 巨大 PR #31 の反省。
- **決定（2026-08-03）**: 今回の REQ-298/316 は **PR #31 のまま分割しない**（force push しない・既存 PR を壊さない）。機能別の小 PR は**次の REQ-316 実装から**始める。
- ⚠️ **技術的制約**: REQ-298 以降は REQ-290〜315 の `ci.yml`/`schema.sql`/`migrations` に依存するため、`develop` 単独からは独立 PR にできない。base は PR #31 のブランチになる（スタックド PR）か、PR #31 マージ後に `develop` base で切る。
- **モデル運用**: Fable=要件定義・判断・再検証（メインループ）／Codex=実装第一（トークン0）／Opus=Docker・pgTAP・並列・MCP。`Explore`/`general-purpose` も `model` 明示必須（未指定だと Fable 継承）。

---
