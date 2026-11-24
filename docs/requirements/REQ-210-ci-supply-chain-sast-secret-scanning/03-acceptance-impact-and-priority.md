## 受入条件
- [ ] AC-01: `.github/dependabot.yml` が存在し、`npm` と `github-actions`（必要なら `docker`）を `weekly` で監視している。リポジトリで Dependabot alerts / security updates が有効になっている。
- [ ] AC-02: `package.json` に `audit` script があり、CI で `high` 以上の脆弱性が検知されると当該ジョブが fail する（意図的に脆弱な依存を入れて確認）。allowlist 運用ルールが文書化されている。
- [ ] AC-03: `ci.yml` の全 `uses:` が 40 桁コミット SHA で固定され、行末に元タグのコメントが付いている（`grep -E 'uses:.*@[0-9a-f]{40}' .github/workflows/ci.yml` が全 `uses:` 行数と一致）。
- [ ] AC-04: `ci.yml` に workflow レベルの `permissions: contents: read` が存在し（`jobs:` より前）、`deploy` など必要なジョブだけが追加権限へ昇格している。`pull_request_target` を使用していない。
- [ ] AC-05: Secret scanning + Push protection が有効で、テスト用のダミー秘密パターンを含む push がブロックされる。gitleaks の pre-commit が入っており、秘密を含むコミットがローカルで弾かれる。CI の gitleaks ジョブも秘密混入で fail する。
- [ ] AC-06: `.github/CODEOWNERS` が存在し、`.github/workflows/`・`package.json`・lockfile・`next.config.*`・`middleware.*`・`supabase/migrations/`・`supabase/tests/` を含む。main は直 push 禁止・required status checks（`test`/`e2e`/`rls-tests` 等）・stale 承認の無効化が設定されている。
- [ ] AC-07: 上記変更後も既存 CI 全ジョブがパスし、`npm ci` ベースの決定的インストール・`edge-functions` の `--frozen` が維持される（REQ-180 のゲートも壊れない）。
- [ ] AC-08（任意）: CodeQL ワークフローが追加され、JS/TS のセキュリティアラートを生成する。

## 影響範囲
**新規 / 変更対象ファイル:**
- `.github/dependabot.yml`（新規・FR-210-01）
- `.github/CODEOWNERS`（新規・FR-210-10）
- `.github/workflows/ci.yml`（`uses:` の SHA 固定、workflow レベル `permissions`、`audit` / gitleaks / Dependency Review ジョブ追加・FR-210-04/05/03/08/02）
- `.gitleaks.toml`（新規・FR-210-08）、pre-commit 設定（husky か `.pre-commit-config.yaml`、関連 devDependency を `package.json` に追加）
- `package.json`（`scripts.audit` 追加・FR-210-03）
- `.github/workflows/codeql.yml`（任意・FR-210-12）

**GitHub リポジトリ設定（コード外・要設定）:**
- Security: Dependabot alerts / security updates、Secret scanning、Push protection
- Branch protection / Rulesets: 直 push 禁止、required status checks、CODEOWNERS レビュー必須、stale 承認無効化

**他機能 / 他 REQ との関係:**
- REQ-180（CI 品質ゲート）とはジョブ追加時の `permissions` / `timeout` / `concurrency` 方針を共有するが、対象（サプライチェーン vs 品質ゲート）は重複しない。
- REQ-017（機密ローテーション・履歴クリーンアップ）の NFR-017-01（secret scan 導入）を本 REQ の FR-210-07/08 が正式実装し、REQ-017 は失効・履歴対応へ専念。
- アプリ本体（`src/` 配下のランタイムコード）には変更なし。CI / リポジトリ設定 / 開発フローのみ。

## 優先度
- **緊急度**: Medium / **重要度**: High
- **理由**: 現時点で観測された具体的侵害は無いが、(1) Actions の可変タグ参照と (3) 依存監査の不在は、上流タグ付け替え・悪性 `postinstall`・既知 CVE といった**サプライチェーン経由の侵害をビルド基盤がそのまま取り込む**構造的リスクで、影響度が大きい（ビルド/デプロイ権限・`secrets.*` に到達しうる）。(4) secret scanning / pre-commit の不在は秘密誤コミットの検知層が無く、REQ-017 で扱う漏洩対応の前段の予防が欠けている。一方、対策の大半は **GitHub 標準機能の有効化と YAML / 設定追加が中心**で、一人運用でも低コスト・低リスクに導入でき費用対効果が高い。CodeQL 等の SAST と OIDC 全面移行は任意 / 段階導入とし、まず標準機能（Dependabot・secret scanning・push protection・SHA 固定・CODEOWNERS）から着手する。
