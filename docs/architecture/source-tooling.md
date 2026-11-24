# ソース索引：ルート設定・CI・補助ツール

[全体の索引](source-map.md)へ戻る。ファイルを開き、担当する説明で責任・処理の流れ・制約を読む。
このリポジトリから除外した私的ツールと本番workflowは、元repoの構成記録としてテキストで示す。

| ファイル | 役割を説明する文書 |
|---|---|
| `.agent-harness/tools/run-e2e-ci.sh`（私的ツール・同梱しない） | [検証・検証データ（検証）](validation.md) |
| `.agent-harness/tools/screenshot.mjs`（私的ツール・同梱しない） | [検証・検証データ（検証）](validation.md) |
| `.agent-harness/tools/shoot-onboarding.mjs`（私的ツール・同梱しない） | [検証・検証データ（検証）](validation.md) |
| `.agent-harness/tools/shoot-round.sh`（私的ツール・同梱しない） | [検証・検証データ（検証）](validation.md) |
| [.env.example](<../../.env.example>) | [外部連携](external-services.md) |
| [.github/CODEOWNERS](<../../.github/CODEOWNERS>) | [ビルド・運用](operations-ci.md) |
| [.github/ISSUE_TEMPLATE/config.yml](<../../.github/ISSUE_TEMPLATE/config.yml>) | [ビルド・運用](operations-ci.md) |
| [.github/ISSUE_TEMPLATE/requirement-execution.yml](<../../.github/ISSUE_TEMPLATE/requirement-execution.yml>) | [ビルド・運用](operations-ci.md) |
| [.github/ISSUE_TEMPLATE/proposal.yml](<../../.github/ISSUE_TEMPLATE/proposal.yml>) | [ビルド・運用](operations-ci.md) |
| [.github/dependabot.yml](<../../.github/dependabot.yml>) | [ビルド・運用](operations-ci.md) |
| `.github/workflows/backup.yml`（元の運用側のみ・同梱しない） | [ビルド・運用](operations-ci.md) |
| [.github/workflows/ci.yml](<../../.github/workflows/ci.yml>) | [ビルド・運用](operations-ci.md) |
| [.gitignore](<../../.gitignore>) | [ビルド・運用](operations-ci.md) |
| [.gitleaks.toml](<../../.gitleaks.toml>) | [検証・検証データ（検証）](validation.md) |
| [.lighthouserc.json](<../../.lighthouserc.json>) | [検証・検証データ（検証）](validation.md) |
| [.lighthouserc.mobile.json](<../../.lighthouserc.mobile.json>) | [検証・検証データ（検証）](validation.md) |
| [.npmrc](<../../.npmrc>) | [ビルド・運用](operations-ci.md) |
| [.size-limit.json](<../../.size-limit.json>) | [検証・検証データ（検証）](validation.md) |
| [CITATION.cff](<../../CITATION.cff>) | [データ配布・調査依頼](dataset-surveys.md) |
| [eslint.config.js](<../../eslint.config.js>) | [検証・検証データ（検証）](validation.md) |
| [next-env.d.ts](<../../next-env.d.ts>) | [検証・検証データ（検証）](validation.md) |
| [next.config.ts](<../../next.config.ts>) | [ビルド・運用](operations-ci.md) |
| [package-lock.json](<../../package-lock.json>) | [ビルド・運用](operations-ci.md) |
| [package.json](<../../package.json>) | [ビルド・運用](operations-ci.md) |
| [playwright.config.ts](<../../playwright.config.ts>) | [検証・検証データ（検証）](validation.md) |
| [postcss.config.js](<../../postcss.config.js>) | [ビルド・運用](operations-ci.md) |
| [sentry.edge.config.ts](<../../sentry.edge.config.ts>) | [共有処理・型](shared-code.md) |
| [sentry.server.config.ts](<../../sentry.server.config.ts>) | [共有処理・型](shared-code.md) |
| [tsconfig.json](<../../tsconfig.json>) | [検証・検証データ（検証）](validation.md) |
| [vercel.json](<../../vercel.json>) | [ビルド・運用](operations-ci.md) |
| [vitest.config.ts](<../../vitest.config.ts>) | [検証・検証データ（検証）](validation.md) |
| [vitest.setup.ts](<../../vitest.setup.ts>) | [検証・検証データ（検証）](validation.md) |
