# REQ-283: ザリダス・フィールド探索モード（位置ベース探索・現地スキャン・検証連動ゲームループ）

作成日: 2026-07-25  
更新日: 2026-07-25（通信圏外対応・Offline Outboxを追加）  
状態: **提案 / 未実装**  
Figma: [ザリダス・フィールド探索モード｜UI・UX要件 v1](#private-link-removed)

## これは何か

既存の地図を「結果を見る地図」から「安全な水辺ミッションを選び、現地で観察・撮影し、検証後に地図・図鑑・地域進捗が変化する探索ゲーム」へ拡張する要件定義。全文は本ファイルと同名ディレクトリの部品ファイルに逐語で分割してある（入口のみ新規要約）。

## 目的・背景の要約

投稿・地図・調査依頼・XP・段階解放・クエスト・図鑑・水槽・管理者審査は置き換えず、「探索セルを選ぶ → 安全確認してミッション開始 → 3枠スキャン → 通常の投稿として提出 → 仮発見フィードバック → AI補助判定・管理者審査 → 承認後にXP・図鑑・セル・地域進捗へ反映」という接続ループを追加する。通信圏外の現場でも観察を失わないことを前提条件に置く。

## 主要な決定事項の要点

- 「今ここにいる」と断言するリアルタイム捕獲ゲームにはしない。公開画面は検証済み記録の鮮度・確度・公開レベルに基づく侵入シグナル／探索候補を示す。要求する行動は観察・撮影のみで、捕獲・持ち帰り・移動をゲーム条件にしない。
- オフライン「送信」は端末内Outboxへの確実な保存＋復帰後の重複なし自動送信を意味する。サーバー確認応答を受けるまで端末データを削除しない。
- 公開位置は二層構造（公開用の粗い位置／研究用の精密位置）とし、正式な報酬は管理者承認後にのみ確定する。
- MVP既定は秋田県内の管理者確認済み8〜12地点・市町村単位・日中限定・前景位置取得・3枠推奨（最低1枚）・フィールドパック24時間・Outbox最低10件・初回に自動送信方針を選択。
- 段階公開は `field_exploration_v1` を5% → 20% → 50%、品質低下・同期消失・危険報告増加時は0%へ即時ロールバック。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-summary.md](REQ-283-field-exploration-mode/01-summary.md) | 0. 要件サマリー。ゲームループ全体像とプロダクト原則・オフライン送信の定義 |
| [02-overview-background-and-success.md](REQ-283-field-exploration-mode/02-overview-background-and-success.md) | 1.1 背景・目的、1.2 成功定義 |
| [03-scope-and-preconditions.md](REQ-283-field-exploration-mode/03-scope-and-preconditions.md) | 1.3 スコープ（MVP／Phase 2候補／対象外）、1.4 前提条件・制約 |
| [04-changes-from-current.md](REQ-283-field-exploration-mode/04-changes-from-current.md) | 2. 現行からの差分（機能・画面、情報アーキテクチャ、主要UXフロー） |
| [05-user-stories-01-04.md](REQ-283-field-exploration-mode/05-user-stories-01-04.md) | 3. ユーザーストーリー US-283-01〜04 |
| [06-user-stories-05-08.md](REQ-283-field-exploration-mode/06-user-stories-05-08.md) | 3. ユーザーストーリー US-283-05〜08 |
| [07-fr-exploration-map.md](REQ-283-field-exploration-mode/07-fr-exploration-map.md) | 4.1 探索マップ（FR-283-01〜04） |
| [08-fr-missions-and-scan.md](REQ-283-field-exploration-mode/08-fr-missions-and-scan.md) | 4.2 ミッション・4.3 スキャン・投稿（FR-283-05〜13） |
| [09-fr-approval-and-rewards.md](REQ-283-field-exploration-mode/09-fr-approval-and-rewards.md) | 4.4 承認・進捗連動（FR-283-14〜16） |
| [10-fr-notifications-and-admin.md](REQ-283-field-exploration-mode/10-fr-notifications-and-admin.md) | 4.5 通知・イベント、4.6 管理（FR-283-17〜21） |
| [11-fr-offline-outbox.md](REQ-283-field-exploration-mode/11-fr-offline-outbox.md) | 4.7 通信圏外・Offline Outbox（FR-283-22〜26） |
| [12-nfr.md](REQ-283-field-exploration-mode/12-nfr.md) | 5. 非機能要件（NFR-283-01〜09） |
| [13-screens-map-and-mission.md](REQ-283-field-exploration-mode/13-screens-map-and-mission.md) | 6. 画面仕様 SC-283-01 探索マップ・SC-283-02 ミッション詳細 |
| [14-screens-session-scan-tentative.md](REQ-283-field-exploration-mode/14-screens-session-scan-tentative.md) | 6. 画面仕様 SC-283-03 セッション・04 3枠スキャン・05 仮発見 |
| [15-screens-discovery-admin-offline.md](REQ-283-field-exploration-mode/15-screens-discovery-admin-offline.md) | 6. 画面仕様 SC-283-06 正式発見・07 管理・08 オフライン送信 |
| [16-api-map-mission-post.md](REQ-283-field-exploration-mode/16-api-map-mission-post.md) | 7. API仕様 API-283-01〜03（探索マップ／ミッション開始／投稿作成） |
| [17-api-safety-progress-sync.md](REQ-283-field-exploration-mode/17-api-safety-progress-sync.md) | 7. API仕様 API-283-04〜07（安全報告／進捗／管理／同期 Prepare・Finalize・Status） |
| [18-db-cells-and-missions.md](REQ-283-field-exploration-mode/18-db-cells-and-missions.md) | 8.1 `exploration_cells`、8.2 `field_missions` |
| [19-db-sessions-contributions-posts.md](REQ-283-field-exploration-mode/19-db-sessions-contributions-posts.md) | 8.3 `field_sessions`、8.4 `cell_contributions`、8.5 既存 `posts` 追加列 |
| [20-db-safety-er-outbox.md](REQ-283-field-exploration-mode/20-db-safety-er-outbox.md) | 8.6 `field_safety_reports`、8.7 ER図、8.8 IndexedDB `offline-outbox` |
| [21-migrations-and-measurement.md](REQ-283-field-exploration-mode/21-migrations-and-measurement.md) | 9. マイグレーション計画（Migration-283-01〜05）、10. 計測・実験要件 |
| [22-tests-and-implementation-plan.md](REQ-283-field-exploration-mode/22-tests-and-implementation-plan.md) | 11. テスト要件、12. 実装計画と推奨リリースゲート |
| [23-open-issues-and-references.md](REQ-283-field-exploration-mode/23-open-issues-and-references.md) | 13. 未決事項（TBD-283-01〜10）、14. 参考リンク |
