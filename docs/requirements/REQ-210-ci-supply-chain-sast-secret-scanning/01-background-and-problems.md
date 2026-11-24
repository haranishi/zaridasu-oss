## 背景
ザリダス（卒研の市民科学 PF・GitHub + GitHub Actions + Vercel + Supabase の一人運用）は、CI（`.github/workflows/ci.yml`）に品質・テスト系ジョブを揃えている一方、**ソフトウェアサプライチェーン側の防御がほぼ未整備**である。Obsidian のセキュア SDLC ノート（`19_Secure_SDLC_Supply_Chain` / `29_CI_CD_Release_Gates` / `16_Key_Lifecycle` / `23_Leak_Response_Playbook`）を下敷きに、依存の脆弱性監査・自動更新（Dependabot）・GitHub Actions のピン留め／最小権限・secret scanning + push protection・軽量 SAST と CODEOWNERS / ブランチ保護をまとめて導入する。

> **REQ-180 / REQ-017 との境界（重要）**: REQ-180 は CI の「品質ゲートの実効性」（deploy の `needs` / Lighthouse の `continue-on-error` / concurrency / timeout / size-limit）を扱う。本 REQ-210 は守備範囲が異なり、「**サプライチェーン**（依存監査・Dependabot・Dependency Review）・**ビルド基盤の堅牢化**（Actions の SHA 固定・`GITHUB_TOKEN` 最小権限・fork PR 制御）・**secret scanning / push protection**・**SAST**・**CODEOWNERS / ブランチ保護**」を対象とする。REQ-017（機密ローテーションと git 履歴クリーンアップ）は「既に混入した秘密の失効・履歴除去」が主眼で、その NFR-017-01 が「CI にシークレットスキャン（例: gitleaks）を入れる」を一行で挙げているだけ（`docs/requirements/REQ-017-secret-rotation.md:27`）。**本 REQ-210 がその一行を含む secret scanning / push protection / pre-commit の恒常的な仕組みの正式な実装先**であり、REQ-017 は失効・履歴対応に専念する。OWASP A03（脆弱で古いコンポーネント）/ A08（ソフトウェア・データ完全性の不全）への対応に相当する。

## 現状の問題
（ファイルパス:行番号つき。GitHub リポジトリ設定側の事実は (要設定確認) と明記）

### 1. GitHub Actions が可変タグ参照のまま（完全コミット SHA に固定されていない）
- `.github/workflows/ci.yml` の `uses:` は全 17 箇所が**可変タグ参照**で、コミット SHA に固定されていない。例:
  - ファースト/サードパーティ混在: `actions/checkout@v4`（`ci.yml:18,41,60,83,121,164,245,282`）・`actions/setup-node@v4`（`ci.yml:19,42,61,246,283`）。
  - **サードパーティ Action**: `denoland/setup-deno@v1`（`ci.yml:86`）・`nick-fields/retry@v3`（`ci.yml:92`）・`supabase/setup-cli@v1`（`ci.yml:125,250`）。
- `@v4` / `@v1` のようなメジャータグはミュータブルで、上流タグの付け替え（あるいは上流アカウント侵害）でビルド時に取り込む中身がサイレントに差し替わりうる。サードパーティ Action は供給元が外部のため特にリスクが高い。SHA ピン留めが未適用。

### 2. `GITHUB_TOKEN` の workflow 全体デフォルト権限が read-only に絞られていない
- `ci.yml` の先頭（`ci.yml:1-9`、`jobs:` の手前）に **workflow レベルの `permissions:` が無い**（`grep` でルート直下 `permissions` キー無しを確認）。各ジョブは個別に `permissions: contents: read`（`ci.yml:12-13,35,54,80,114-115,156,225,278-280`、`deploy` のみ `deployments: write` を加える `ci.yml:278-280`）を宣言しているが、**workflow 全体の安全側デフォルト（top-level `permissions: contents: read`）が無い**。
- 現状は全ジョブが明示宣言しているため実害は小さい (推測) が、今後ジョブを追加する際に `permissions:` を書き忘れるとリポジトリ既定（組織設定次第で write 寄り）の広い `GITHUB_TOKEN` が付与されうる。最小権限の安全側デフォルトが効いていない。

### 3. 依存の脆弱性監査・自動更新（Dependabot）が無い
- `.github/dependabot.yml` が**存在しない**（`find` で確認）。Dependabot alerts / security updates / version updates が設定されていない (要設定確認: リポジトリの Security タブ側)。
- `package.json` の `scripts` に **`npm audit` 系が無い**（`ci.yml`・`package.json:6-27` を確認）。CI でも定期でも依存の既知脆弱性を検知していない。
- 依存規模: `package.json` の direct deps 19 / devDeps 31（`package.json:28-81`）、`package-lock.json` の解決パッケージは **772**（lockfileVersion 3）。CI は `npm ci`（`ci.yml:23,46,65,287`）で lockfile から決定的にインストールしており（良い）、lockfile はコミット済み（`package-lock.json` 実在）。
- インストールスクリプトを持つ依存が 6 件（`@sentry/cli`・`esbuild`・`fsevents`・`sharp`・`unrs-resolver` 等、lockfile の `hasInstallScript`）。`postinstall` 実行を伴う依存の追加・更新時に typosquatting / 悪性 `postinstall` を見抜く仕組み（Dependency Review）が無い。

### 4. secret scanning / push protection / pre-commit が無い
- リポジトリに **gitleaks / trufflehog 等の secret scanning 設定が無い**（`grep -rliE 'gitleaks|trufflehog|secret.?scan|detect-secrets'` のヒットは `docs/requirements/REQ-017-secret-rotation.md` のみ）。
- **husky / pre-commit / lint-staged が無い**（`package.json` に該当 devDependency 無し、`.husky` ディレクトリ無し、`.pre-commit-config.yaml` 無し、`.git/hooks` は `.sample` のみで有効フック無し）。コミット前にローカルで秘密混入を弾く仕組みが無い。
- GitHub の Secret scanning / Push protection の有効化は (要設定確認: リポジトリ Security 設定)。CI には placeholder 値（`NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY`、`ci.yml:15-16` 等）しか入れず実シークレットは `secrets.*`（`VERCEL_TOKEN` / `SUPABASE_ACCESS_TOKEN` 等、`ci.yml:117-118,290-295`）で渡しており設計は妥当だが、誤コミットを検知・ブロックする層が無い。

### 5. CODEOWNERS / ブランチ保護による重要ファイルの変更ガードが無い
- **CODEOWNERS が存在しない**（`find -iname CODEOWNERS` で 0 件。`.github/` 配下にもリポジトリ直下にも `docs/` にも無し）。
- `.github/workflows/`・`package.json`・`package-lock.json`・`next.config.*`・`middleware.*`・`supabase/migrations/`・`supabase/tests/` といったセキュリティ感度の高いファイルが、レビュー所有者の指定なく変更されうる。
- default branch（main）の保護（直 push 禁止・required status checks・承認後の新規 commit で旧承認を無効化）は (要設定確認: リポジトリ Branch protection / Rulesets)。`ci.yml:4-7` は push/PR とも main を対象にしているが、CI が **required check** に設定されているかはワークフロー側からは保証できない。

### 6. SAST（静的セキュリティ解析）が無い
- セキュリティ向け SAST（CodeQL 等）のワークフローが**無い**（`.github/workflows/` は `ci.yml` の 1 本のみ）。ESLint は `npm run lint`（`ci.yml:24`、`eslint . --max-warnings 0`）で走るが、これはコード品質 lint であってインジェクション等のセキュリティ観点の静的解析ではない。
