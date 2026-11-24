# 公開の状況と由来

2026-11-16に準備を始め、2026-11-24に公開しました。このリポジトリ `haranishi/zaridasu-oss` は、元の運用repoから履歴を持ち込まずに、ソースだけを切り出して公開したものです。
この文書は由来と確認の記録です。GitHubの実設定やCIの結果そのものではないので、最新の状態はGitHubの画面と、Actionsの実行結果で確かめてください。

## 元の履歴を持ち込まず、sourceだけを引き継ぐ

- 元のrepo：非公開の運用repo。履歴と本番運用は、そちらで保持します。
- export元revision：`a6b1c4003a83c521e98ddef9aae5319924be6b2e`（元のdevelop）。
- 素材の記録：[public/OSS_ASSET_MANIFEST.json](../../public/OSS_ASSET_MANIFEST.json)。元revision、8点の代替画像の出所・条件、無効ホストへ置換したSQL・アプリ内リンクと、除いた設計資料のリンクを記録しています。
- manifestのSHA-256：`7bdeed7c5ad12bf90dc60309321052a0e12a95a5d384596215c14ecb123cb7ba`。

既存のexporterが出した履歴なしのsourceを基に、このリポジトリ固有のリンクと配備の説明を調整しています。
元の履歴・PR・ログ・artifactは取り込んでいません。今後も、旧repoの履歴をmergeして更新しないでください。
未確認だった原画像8点、本番・バックアップのworkflow、私的な作業ツールは、配布対象から除いています。
代替画像の条件は [素材台帳](../../THIRD_PARTY_NOTICES.md) とmanifestで確認してください。原画像の再配布権を認めたものではありません。

## 本番とデータセットは、このリポジトリの外にある

このリポジトリはソースと表示確認用の画像を含み、観察データのエクスポートではありません。
公開データセットは [別の公開条件と手順](../runbooks/open-data-doi.md)で扱います。
mainはソースのリリース用、developは統合先です。自動配備はなく、参加者のPRから本番へ配備できません。
本番のSecrets・Environment・配備連携を、このリポジトリへ移す手順は設けません。

## 公開前に確認したこと（2026-11-24）

- 最終sourceと、履歴の全参照に対する秘密検査（gitleaks）が0件。
- 個人・大学のメールアドレスと、稼働中サービスの宛先を検索して0件。
- main・developの保護（PR必須、strictな必須CI8件、管理者にも適用、force pushと削除の禁止）。
- 必須CI8件は、最初のPR（#1）で成功を確認しました。保護設定により、成功しないPRはマージできません。
- Secrets・Environment・配備連携が0件で、workflowは検査用のCIだけ。
- 元の運用側の鍵の交換、Webhookの認証、AIの利用上限と停止手段。

## 公開した直後に設定したこと（2026-11-24）

公開の切替後にだけ設定できるため、切り替えた直後に設定し、GitHubの設定を読み戻して確かめました。

- 外部forkからの検査（CI）の実行は、保守者の承認を待つ設定（`all_external_contributors`）。
- 非公開の脆弱性報告の受付。[SECURITY.md](../../SECURITY.md) の案内から、保守者だけに報告できます。
- 秘密情報の自動検知（secret scanning）、誤った送信の防止（push protection）、依存パッケージの脆弱性通知（Dependabot alerts）。いずれも公開リポジトリでは無償です。
- 依存関係の検査（Dependency Review）は、公開したリポジトリのPRでだけ実行されます。結果は、各PRのチェックで確認できます。

開発の入口は [ローカル開発](local-development.md)、手順の詳細は [公開前の確認](publication.md) です。
