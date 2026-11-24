# 変更に参加する

文書の訂正、翻訳、再現できる不具合の修正など、目的を一つに説明できる変更から始められます。
この案内は、`haranishi/zaridasu-oss` に参加する人向けです。レビューの採否と返信の時期は、約束できません。

## 最初に、利用者の操作を知る

1. [README](README.md) と [画面ガイド](docs/screens/README.md) で、誰のどの操作を変えるかを確認する。
2. [設計思想](README/08-design-philosophy.md)、[現行仕様](docs/current/README.md)、関連REQと実装を読む。
3. [開いているPR](https://github.com/haranishi/zaridasu-oss/pulls) と関連する変更を確認し、同じ修正を重ねない。

新機能、公開範囲の変更、大きな依存追加、保存形式や権限に影響する変更は、実装前に目的・利用例・影響を保守者とそろえてください。相談には [提案・相談フォーム](.github/ISSUE_TEMPLATE/proposal.yml) を使えます。
一般の不具合には [Bug report](.github/ISSUE_TEMPLATE/bug-report.yml) を使えます。[要件実行フォーム](.github/ISSUE_TEMPLATE/requirement-execution.yml) は、`docs/planning/priority-backlog.md` の項目を実行するときに使うもので、REQ番号・目的・完了条件・検証計画を求めます。

セキュリティ上の問題には [非公開報告の案内](SECURITY.md) を使い、公開Issueへ詳細を書かないでください。

## 開発を始める

外部の参加者はforkで作業し、developへPRを送ります。本番の鍵は開発の前提にしません。
このリポジトリのmainはリリース用、developはソースの統合先です。自動配備はなく、参加者のPRから本番へ配備できません。
両方をPRと必須CIで保護しています。設定とCIの確認状況は [公開の状況](docs/oss/release-status.md) を参照してください。
forkからのCIは、保守者の実行承認を待つことがあります。ローカル検証には本番の接続先や実データを使いません。

Node.js 22と `npm ci` を使い、[ローカル環境と架空データ](docs/oss/local-development.md) の `local:start`・`setup:local` から始めます。
本番の環境ファイルやキーをコピーせず、外部の有料APIやメール配信を設定しない状態で開発できます。
変更元は `develop`。現在の作業を保存・確認してから、最新の `develop` を基に作業ブランチを作ります。

```sh
git switch develop
git pull --ff-only
git switch -c docs/describe-the-change
```

ブランチ名は変更の内容に合わせます。本人が使う認証情報や実データを、サンプル・文書・スクリーンショットへ取り込みません。
エージェントで作業する場合は [AGENTS.md](AGENTS.md) と [cc-sdd](.kiro/README.md) を読み、既存REQを引き継ぎます。
要件・設計・タスクの承認条件はcc-sddの案内に従い、文書の小さな訂正は影響を確認して軽量に扱います。

## どこを変え、何を確かめる？

| 変更 | 編集する場所と確認 |
|---|---|
| 説明・画面ガイド | 対応するMarkdown、参照先、画面・実装との対応。長い説明は分け、入口から辿れるようにする |
| 翻訳 | `src/locales` の4言語。`npm run i18n:check` と表示の確認 |
| 画面・操作 | view・component・hook。対象テストと、実際の操作・狭い画面での確認 |
| DB・位置・権限 | migration、schema、型、権限テストなど。[配置規約の対応表](docs/project-structure-conventions.md) を確認 |
| Edge Function・運用 | 関数の検査と、フロントとは別の反映手順。[運用ガイド](docs/architecture/operations-ci.md) を確認 |

対象に合う検証を選び、行った確認と未確認を分けます。[検証ガイド](docs/architecture/validation.md)
コード変更では、必要に応じて次のコマンドを使います。文書だけの変更に全アプリ検査を一律追加する趣旨ではありません。

```sh
npm run lint
npm run type-check
npm test -- src/lib/__tests__/quests.test.ts
```

最後のコマンドは既存テストの実行例です。変更した箇所に合わせて対象ファイルを選びます。

まとめて実行する入口は `npm run precheck`。本番ビルド・E2Eを含むものは `npm run precheck:full` です。
必要な設定・ツール・通信が異なるため、[スクリプト一覧](README/04-env-and-scripts.md) と [E2E](README/05-e2e-and-directory-structure.md) を読んで使います。

## 素材・コードを提供するとき

自身に公開・再配布の権限があるものを送ってください。第三者素材には出典、ライセンス、必要な帰属表示を添えます。
生成素材は生成経路と、使用したアカウントの契約者が再配布を許可できることも確認します。
既存の画像を別ライセンスへ変更したり、出所不明の素材をMITと記載したりしません。
このリポジトリに含まれる代替画像は、public/OSS_ASSET_MANIFEST.jsonと素材台帳で確認できます。

## PRに書く

- どの利用者の、どの場面の問題を解くか。
- 何が変わり、設計や既存仕様のどの判断に沿うか。
- 対象REQ、変更した画面・コード・文書。
- 実行した検証と結果、未確認の条件。UI変更なら個人情報を含まない画像や再現手順。

PRの送り先は `develop`。文書・翻訳・テストを含め、一つの目的に必要な変更をまとめます。
このrepoの `main` への反映はソースのリリースです。DB・Edge等の本番作業は元のprivate運用側で別に判断します。
マージされた変更が運営中のサービスへ反映される時期は約束しません（[流れ](docs/oss/README.md)）。
文書中の元repoのPR・実行履歴は過去の記録です。このリポジトリの履歴として番号を読み替えたり、元repoの履歴をmergeしたりしません。

## レビューと維持

[CODEOWNERS](.github/CODEOWNERS) の既定担当は `@haranishi` です。CIが確認することと、人が採用を判断することを区別します。
CODEOWNERSの記載だけで承認必須の設定が有効だとは判断しません。
変更後の現在の挙動は `docs/current`、利用者向けの入口・画面はREADMEと `docs/screens`、コードの説明は `docs/architecture` を更新します。
実データや秘密情報の値ではなく、再現に必要な最小のサンプルと、確認できる証拠を残してください。
