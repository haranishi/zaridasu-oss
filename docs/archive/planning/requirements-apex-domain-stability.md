> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# Apexドメイン障害 要件定義書

作成日: 2026-03-28  
対象: https://zaridasu.com/ のみで発生する Chunk Load Error

## これは何か

apexドメイン（zaridasu.com）でのみ Chunk Load Error が出た本番障害に対し、即日対応と恒久対策の要件を定義した当時の文書。本ファイルを入口とし、本文は同名ディレクトリ配下の部品に逐語で分割している。

## 目的・背景

同一リリースでも別URLでは再現せず、apex 直アクセスだけが「初回表示不能・再試行で復帰しない」状態になった。ドメイン・キャッシュ・Service Worker 更新タイミングの複合要因が疑われ、離脱増加という実害が出ていた。そこで①即日でユーザー影響を最小化する運用要件、②再発を防ぐ恒久対策、③検知から復旧判断までの標準化、の3点を定めた。

## 主要な決定事項（要点）

- 対象は apex での表示失敗・SW更新とキャッシュ整合・オフラインフォールバック・CSP/OAuth callback のドメイン整合・監視運用。**新規機能追加・UI刷新・SEO全体改善は対象外**とし、障害収束に絞る。
- 機能要件は5本：FR-01 即日復旧導線（ユーザー向け手順と一次回答テンプレート）／FR-02 SWキャッシュ整合（**HTML遷移は network-first 原則**・stale chunk を残さない）／FR-03 自己回復（chunk系エラーで**1回だけ自動リロード**、復旧しなければ手順表示）／FR-04 ドメイン正規化（apex と正規URLの方針を単一化し metadata / canonical / runtime origin の不整合を許容しない）／FR-05 認証整合（OAuth callback URL を許可リストと一致させ、環境変数と認証基盤の同期責任を明確化）。
- 非機能はデプロイ直後の失敗率を閾値以下に保つこと、chunk失敗・SW更新失敗・CSP違反・apex限定エラー率を収集できること、**インシデント判定からロールバック判断までを30分以内**にできること。
- 受け入れ基準には「**連続2回の本番デプロイで回帰しない**」を含め、単発の復旧では完了としない。
- 進め方は Phase A 即日復旧 → B 恒久対策 → C 受け入れ検証 → D 監視運用の4段。成果物として Runbook・恒久対策設計・受け入れチェックリスト・障害後レビュー様式を残す。

## 部品

- [01-background-purpose-scope.md](requirements-apex-domain-stability/01-background-purpose-scope.md) — 1. 背景、2. 目的、3. スコープ（3.1 対象 / 3.2 対象外）。
- [02-functional-requirements.md](requirements-apex-domain-stability/02-functional-requirements.md) — 4. 機能要件 FR-01 即日復旧導線 〜 FR-05 認証整合。
- [03-nonfunctional-and-operations.md](requirements-apex-domain-stability/03-nonfunctional-and-operations.md) — 5. 非機能要件（可用性・観測性・運用性）と 6. 運用要件。
- [04-acceptance-phases-deliverables.md](requirements-apex-domain-stability/04-acceptance-phases-deliverables.md) — 7. 受け入れ基準、8. 実行フェーズ（Phase A〜D）、9. 成果物。
