# REQ-285: Edge Function のデプロイ整合性と配信経路の可視化（未デプロイ7本・pg_net 404 の無通知）

作成日: 2026-07-29
状態: **一部実装済み（2026-07-29）**

優先度: **P0**（FR-285-01 は即時実施可） ／ 深刻度: **High** ／ 種別: インフラ・DevOps・データ品質
関連: REQ-127（deploy lag 監視の初出）, REQ-231（enrich-place）, REQ-234（lifecycle 通知）, REQ-215/REQ-216（AI 異常検知）, REQ-237（Web Push）, REQ-236（social-announce）, REQ-240（webhook fail-closed）, REQ-270（webhook secret）, REQ-281（CI・運用強化）, REQ-286（リポジトリと本番の乖離）

---

## これは何か

リポジトリの Edge Function 14 本のうち本番にあるのは 7 本だけで、DB のトリガーと pg_cron が
残り 7 本を呼び続けて全て 404 になっていた問題の要件定義。詳細は
`REQ-285-edge-function-deploy-integrity/` 配下に分割している。

## 目的・背景（要約）

pg_net は非同期なので cron 自身は「成功」を返し、Edge Function 側も fail-soft 設計のため、
**壊れていることが誰にも通知されない**状態が続いていた。扱うのは (1) 未デプロイ関数の解消と
欠損データのバックフィル、(2) 再発を防ぐ CI ガードへの是正、(3) pg_net 失敗の可視化の 3 点。
発覚の端緒は 2026-07-28 のテストデータ削除作業中に `net._http_response` が全件 404 だったこと。

## 主要な決定事項（要点）

- **根本原因**は `scripts/check-edge-deploy-lag.sh` の `DEFAULT_TARGETS` が「デプロイ済み 7 本」の
  固定リストで、しかも git diff で変更された関数しか見ないこと。**未デプロイかつ未編集の関数は構造的に永久に検知されない**。
- 対象は**固定リスト廃止＋自動導出**にし、意図的な未デプロイは `.deploy-ignore` に理由付きで登録する。
- 「本番に存在しない関数」の検知は差分フィルタを適用せず**毎回評価**（main は exit 1、PR は warning）。
- 通知系は「デプロイすること」と「配信を有効化すること」を**別要件として分離**し、意図しないメール送信を防ぐ。
- **2026-07-29 実施済み**: FR-285-01/02/04/05/06。`enrich-place` をデプロイし承認済み 12 件すべてで
  `locality` が非 NULL に。ライフサイクル 2 本は「**配信しない**」判断で cron を `active=false`。本番 12 本デプロイ・意図的な未デプロイ 2 本。
- **未実施**: FR-285-07（DB 参照名の突合）、FR-285-08（pg_net 失敗の可視化）、cron の UTC/JST 是正。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-status-and-summary.md](REQ-285-edge-function-deploy-integrity/01-status-and-summary.md) | 実施済み記録（2026-07-29）と要件サマリー・通知系の扱いに関する注意 |
| [02-background.md](REQ-285-edge-function-deploy-integrity/02-background.md) | 背景（デプロイ済み/未デプロイ 7 本の内訳の実測表、本数の数え間違いの訂正、発覚の経緯） |
| [03-current-problems.md](REQ-285-edge-function-deploy-integrity/03-current-problems.md) | 現状の問題 A〜E（CI ガードの構造欠陥・enrich-place 欠損・cron 3 本・失敗の不可視・実害なしの記録） |
| [04-goals-and-out-of-scope.md](REQ-285-edge-function-deploy-integrity/04-goals-and-out-of-scope.md) | 目的 4 点とスコープ外 |
| [05-functional-requirements.md](REQ-285-edge-function-deploy-integrity/05-functional-requirements.md) | 機能要件 FR-285-01〜08（デプロイ手順・バックフィル・配信有効化の分離・CI 検知・pg_net 可視化） |
| [06-non-functional-and-acceptance.md](REQ-285-edge-function-deploy-integrity/06-non-functional-and-acceptance.md) | 非機能要件 NFR-285-01〜04 と受入条件 AC-01〜07 |
| [07-open-questions-and-impact.md](REQ-285-edge-function-deploy-integrity/07-open-questions-and-impact.md) | 未確定事項 5 件（着手前に決める）と影響範囲・他要件への影響 |
| [08-priority.md](REQ-285-edge-function-deploy-integrity/08-priority.md) | 優先度（緊急度・重要度・理由）と要件ごとの P0〜P3 |
