# バックアップ & 復元 / DR 手順書（DB + Storage）

> 参照要件: REQ-217（FR-217-01〜08 / NFR-217-01〜05 / AC-01〜07）
> 関連: REQ-218（クラウド課金ガードレール）、REQ-220（インシデント / 漏洩対応）、`docs/runbooks/edge-function-deploy.md`（CLI / project-ref の前提）
> 所要時間: 初回セットアップ **60 分以内** + リストア訓練 1 回（実測は §(g) 参照）

---

## これは何か

ザリダスの **DB と Storage を両方**バックアップし、消失・誤操作・ランサムウェア・アカウント停止から
復旧するための手順書。日次 CI バックアップの構成、暗号鍵の管理、リストア手順、復元後の整合チェック、
リストア訓練の記録、RPO / RTO 目標、Pro 移行時の PITR チェックリストまでを扱う。

## 目的・背景

収集データ（投稿・写真・音声・調査依頼・コメント）＝研究成果であり、消失は研究成果の喪失に直結する。
そのため「バックアップが取れている」ではなく「**実際に戻せる**」ことを AC に置き、暗号化・多拠点保管・
リストア訓練の記録までを一体で運用する。

## 主要な決定事項（要点）

- **DB ダンプだけでは写真 / 音声は戻らない。** DB と Storage の両方をバックアップ・リストアする（FR-217-03）。
- **暗号化は必須・秘密鍵は CI に置かない。** 公開鍵暗号（age 第一選択 / gpg フォールバック）で、
  受信者公開鍵のみを Secrets に入れる。鍵が未設定なら `backup-*.sh` は平文を残さず exit 1 する。
- **3-2-1**: 本番 + GitHub Artifacts の 2 拠点を最低線とし、オフサイト（R2/B2）とオフライン月次世代を
  足すほどランサムウェア / アカウント停止耐性が上がる。
- **リストア先は新規プロジェクトかローカル。本番への直リストアは最終手段。**
- **PITR は論理オフサイトバックアップの置き換えではなく上乗せ**（PITR は Supabase 内に閉じるため、
  プロバイダ障害・アカウント停止には無力）。
- リストア時は **`schema.sql` を先に適用**してから データを流す（RLS / トリガー / バケットの取りこぼし防止）。

## 各部品

- [01-prerequisites-and-architecture.md](./backup-restore/01-prerequisites-and-architecture.md) — §0 重要な前提（読み飛ばし厳禁）、構成（どのファイルが何をするか）、本番プロジェクト情報（project ref / バケット）。
- [02-backup-locations-and-keys.md](./backup-restore/02-backup-locations-and-keys.md) — §(a) バックアップの所在（3-2-1 の 4 拠点）、age / gpg 鍵ペアの生成、必要な GitHub Secrets の一覧と取得元。
- [03-decrypt-and-db-restore.md](./backup-restore/03-decrypt-and-db-restore.md) — §(b) 暗号化ダンプの復号（DRY_RUN・SHA-256 整合）と §(c) DB リストア手順（リストア先の用意 → スキーマ → データ投入）。
- [04-storage-restore-and-verification.md](./backup-restore/04-storage-restore-and-verification.md) — §(d) Storage バケット再作成とファイル投入、§(e) 復元後の整合チェック（URL リンク切れ検知・チェックリスト）。
- [05-schema-rebuild-and-restore-drills.md](./backup-restore/05-schema-rebuild-and-restore-drills.md) — §(f) RLS / トリガー / バケットポリシーの再構築、§(g) リストア訓練の記録テンプレと訓練 #1 の実績・未実施項目。
- [06-rpo-rto-pitr-and-scenarios.md](./backup-restore/06-rpo-rto-pitr-and-scenarios.md) — §(h) RPO / RTO 目標、§(i) Pro 移行時の PITR 有効化チェックリスト、§(j) 誤操作 / ランサムウェア シナリオ別復旧。
- [07-checklists-and-troubleshooting.md](./backup-restore/07-checklists-and-troubleshooting.md) — §(k) 運用チェックリスト（初回 / 月次 / 可観測性）、トラブルシュート表、関連要件・対象ファイル。
