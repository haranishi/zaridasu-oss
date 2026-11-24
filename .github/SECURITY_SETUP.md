# セキュリティ運用セットアップ手順（REQ-210）

このファイルは **コードでは完結できない GitHub リポジトリ設定 / 開発環境セットアップ** をまとめた手順書です。
REQ-210（CI サプライチェーン防御）のうち、YAML / 設定で実装済みの部分は以下のファイルに入っています。

| 実装済み（コード） | ファイル |
|---|---|
| Dependabot（npm / github-actions, weekly, グルーピング） | `.github/dependabot.yml` |
| CODEOWNERS（重要パスの所有者） | `.github/CODEOWNERS` |
| Actions の SHA 固定 / workflow 最小権限 / audit・gitleaks・dependency-review ジョブ | `.github/workflows/ci.yml` |
| gitleaks 設定（許可リスト・既知漏洩のピン留め） | `.gitleaks.toml` |
| ~~CodeQL（任意 SAST）~~ | **削除済み**（REQ-317 FR-317-05・全 run が skip のため）。復活手順は §8 |
| 依存監査 / secret scan スクリプト | `package.json`（`audit` / `audit:all` / `secrets:scan` / `secrets:protect`） |

以降は **人手でリポジトリ管理画面 / ローカルで行う作業** です。

---

## 全体像と主要な決定事項

- **一人運用でもブランチ保護と CI 強制は入れる**（誤 push 防止が主目的）。CODEOWNERS レビュー必須は自分の PR を承認できなくなる場合があるため任意運用でよい。
- **required status checks に入れるのは `test` / `e2e` / `rls-tests`**（推奨 `audit` / `gitleaks`）。`deploy`・`dependency-review`・`perf-budget` は起動条件が限定されるため required にしない。
- **pre-commit は npm 依存を増やさず gitleaks 本体 + git ネイティブフックで組む**（`husky` を入れない）。最終防衛線は CI 側の `gitleaks` ジョブ。
- **依存監査は hard-fail（2026-07-30 昇格済み）**。warning へ戻すことは禁止。`npm install` は使わず `npm ci` のみ。
- **`overrides` で sharp / postcss を上げている**。`npm audit fix` だけでは解消できないため。上流が追いついたら外す。
- **`pull_request_target` は使わない**（fork の untrusted コードに secrets が露出しうる）。
- **CodeQL は削除済み**（private + GHAS 未契約で全 run が skip だった）。public 化 / GHAS 契約時の復活手順あり。
- **漏洩クレデンシャルの一次対応順序は「まず失効 → 次に履歴除去」**。REQ-017 へハンドオフ中。

## 各手順

| 節 | 文書 | 内容 |
|---|---|---|
| §1 | [GitHub Security 設定](SECURITY_SETUP/01-github-security-settings.md) | Dependabot / Dependency graph / Secret scanning / Push protection の有効化（管理画面操作が必須） |
| §2 | [ブランチ保護 / Ruleset](SECURITY_SETUP/02-branch-protection.md) | main 保護の設定項目と、required status checks に何を入れる / 入れないか |
| §3 | [gitleaks pre-commit フック](SECURITY_SETUP/03-gitleaks-pre-commit.md) | ローカルでの早期検知。インストール、フック作成、動作確認 |
| §4 | [依存監査 allowlist 台帳](SECURITY_SETUP/04-dependency-audit-ledger.md) | CI ゲートの状態、`overrides` を使った理由、対応履歴、運用ルール |
| §5 | [既知の漏洩クレデンシャル](SECURITY_SETUP/05-leaked-credentials.md) | 平文残存している 2 件と、REQ-017 への引き継ぎ手順 |
| §6-7 | [OIDC 移行と fork PR 方針](SECURITY_SETUP/06-oidc-and-fork-pr.md) | 短命トークンへの段階移行 TODO と、fork PR に secrets を渡さない設計 |
| §8 | [CodeQL の削除と復活手順](SECURITY_SETUP/07-codeql-removal-and-restore.md) | 削除理由と、public 化 / GHAS 契約時に戻す手順 |
