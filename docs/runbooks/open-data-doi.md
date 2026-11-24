# オープンデータ スナップショット公開＋DOI 発行 手順書

> 参照要件: REQ-230 (FR-230-05 / NFR-230-04 / NFR-230-06)
> 連携要件: REQ-229（Dataset JSON-LD の `distribution` / `license` / `sameAs` の供給先）
> 所要時間: **30〜45 分**（スナップショット取得 + アップロード + DOI 反映）

---

## これは何か

公開データセット（`/dataset` の CSV / GeoJSON）の**特定時点のスナップショットを固定し、学術リポジトリに
登録して DOI を振る**ための手順書。取得 → プライバシー検査 → Zenodo 公開 → アプリへの DOI 反映 →
更新時の versioning までを扱う。

## 目的・背景

卒論・論文・他研究からデータセットを正式に引用できるようにするため、バージョン付きの固定版に DOI を
与える。日次の CSV/GeoJSON 更新は自動で行われるので、本手順は**節目・公開時・大改訂時のみ**実行する。

## 主要な決定事項（要点）

- **DOI を振ったスナップショットは取り消せない前提で扱う。** PII や生座標が一度混入すると恒久的な事故になるため、
  アップロード前のプライバシー検査を必須ゲートにする（1 項目でも満たさなければ中止）。
- **スナップショットは本番の配布エンドポイントから取得する。** 開発用の生 DB を dump してはいけない（粗化前の座標と PII が混入する）。
- **リポジトリは Zenodo を採用**（DOI 発行と versioning が目的に最適）。OSF はプロジェクト資料の集約に任意併用。
- **ライセンスは CC BY 4.0** に確定。
- **引用は原則 Concept DOI**（常に最新版へ解決）。特定版を指すときだけ Version DOI を使う。
- 学術リポジトリのメタデータには**著者名・所属を記載してよい**（LP/UI で大学名を出さないブランディング方針は LP に対する制約であり、ここには適用しない）。
- **トークンは平文で書かない**（Web UI 推奨・自動化時も Secrets 経由 / NFR-230-06）。

## 各部品

- [01-when-to-use-and-privacy-gate.md](./open-data-doi/01-when-to-use-and-privacy-gate.md) — いつ使うか（毎日実行しない理由を含む）と「最重要（実行前に必ず確認）」＝PII / 粗化 / approved の 3 条件。
- [02-prerequisites-and-metadata.md](./open-data-doi/02-prerequisites-and-metadata.md) — 前提（本番 URL・配布エンドポイント・アカウント・ライセンス）、リポジトリ選定の比較表と結論、確定済みメタデータ方針。
- [03-snapshot-and-privacy-checks.md](./open-data-doi/03-snapshot-and-privacy-checks.md) — 手順 1 スナップショット取得（curl）と手順 2 事前確認（座標粗化 / PII 列 / ライセンス表記 / 目視サンプルの検査コマンド）。
- [04-zenodo-doi-and-versioning.md](./open-data-doi/04-zenodo-doi-and-versioning.md) — 手順 3 Zenodo へのアップロードと DOI 取得（Concept / Version DOI）、手順 4 DOI のアプリ反映と REQ-229 への供給、手順 5 versioning。
- [05-troubleshooting-and-links.md](./open-data-doi/05-troubleshooting-and-links.md) — トラブルシュート表（粗化漏れ・PII 検出・0 件 CSV・DOI 未解決）と関連要件・対象コード・外部リンク。
