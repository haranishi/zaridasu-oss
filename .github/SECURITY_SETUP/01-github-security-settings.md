## 1. GitHub Security 設定（Settings → Code security and analysis）

> 対象リポジトリ: `haranishi/zaridasu`。一人運用でも有効化推奨。

- [ ] **Dependabot alerts** を有効化（FR-210-01 / AC-01）。
- [ ] **Dependabot security updates** を有効化（脆弱性に対する自動 PR）。
- [ ] **Dependency graph** を有効化（Dependency Review / alerts の前提）。
- [ ] **Secret scanning** を有効化（FR-210-07 / AC-05）。
- [ ] **Push protection**（secret scanning）を有効化（既知パターンの秘密 push をブロック）。
- [ ] （public リポジトリの場合）**CodeQL / Code scanning** の default setup を「無効」にし、本リポジトリの `codeql.yml`（advanced）を使う。重複セットアップはエラーになるため、どちらか一方にする（FR-210-12 / AC-08）。
  - ⚠ `codeql.yml` は **REQ-317 FR-317-05 で削除済み**（private + GHAS 未契約で全 run が skip だったため）。この項目を実施するときは、先に **§8 の復活手順**で workflow を戻すか、default setup 側を使うかを決めること。

> 注: `.github/dependabot.yml` を置いても **alerts / security updates 自体の有効化は管理画面操作が必須**（YAML は version updates の設定のみ）。

---
