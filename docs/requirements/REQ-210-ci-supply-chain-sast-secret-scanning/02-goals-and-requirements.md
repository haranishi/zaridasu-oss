## 目的
- ビルド基盤（GitHub Actions）と依存ツリーを「侵害・改竄・既知脆弱性」から守る最低限の常設防御を、**一人運用で現実的に維持できる粒度**で導入する。
- 秘密情報の誤コミットを「コミット前（pre-commit）」「push 時（push protection）」「リポジトリ全体スキャン（secret scanning）」の多層で防ぐ。
- 重要ファイルの変更にレビューと CI 通過を必須化し、サプライチェーン経路（Actions・依存）の改竄余地を縮小する。
- GitHub 標準機能を主軸に据え、重いエンタープライズ施策は「任意 / 将来」へ段階化する。

## 要件

### 機能要件

#### A. 依存サプライチェーン（GitHub 標準中心・必須）
- [ ] FR-210-01: `.github/dependabot.yml` を新規作成し、**ecosystem を `npm`（リポジトリ root）・`github-actions`（`.github/workflows`）・必要なら `docker`（`ci.yml:167` の `FROM postgres:16` 系）** で構成する。`schedule.interval` は `weekly`、PR 数の上限（`open-pull-requests-limit`）を一人運用に合う小さめの値（例 5）に設定する。あわせて Dependabot **alerts / security updates** をリポジトリ設定で有効化する (要設定: Security タブ)。
- [ ] FR-210-02: GitHub の **Dependency Review** を PR に効かせる。GitHub Advanced Security が使える場合は `actions/dependency-review-action` を SHA 固定で PR ワークフローに追加し、深刻度しきい値（例 `high`）超の新規脆弱性・許可しないライセンスの導入を**ブロック**する。使えない場合は Dependabot alerts + 下記 `npm audit` で代替する旨を明記する。
- [ ] FR-210-03: `package.json` の `scripts` に依存監査を追加する（例 `"audit": "npm audit --omit=dev --audit-level=high"`）。CI（`ci.yml`）に **`audit` ジョブ**（または `test` ジョブ内ステップ）を追加し、`high` 以上の脆弱性で fail させる。誤検知や即時修正できない既知 advisory のための一時 allowlist 運用方針（修正期日・無視理由を記録）も定める。lockfile を唯一の真実とし、CI は引き続き `npm ci`（`ci.yml:23,46,65,287`）のみを使い、`npm install` で lockfile に差分を作らない運用を明文化する。

#### B. GitHub Actions / トークンの堅牢化（必須）
- [ ] FR-210-04: `ci.yml` の全 `uses:`（`ci.yml:18,19,41,42,60,61,83,86,92,121,125,164,245,246,250,282,283`）を**完全な 40 桁コミット SHA に固定**し、行末コメントに元のタグ（例 `# v4.2.2`）を残す。少なくともサードパーティ Action（`denoland/setup-deno`・`nick-fields/retry`・`supabase/setup-cli`）は必須、`actions/*` も対象に含める。以後の更新は FR-210-01 の `github-actions` Dependabot に追従させる。
- [ ] FR-210-05: `ci.yml` の `jobs:` の手前（`ci.yml:8` 付近）に **workflow レベルの安全側デフォルト `permissions: contents: read` を追加**する。各ジョブの既存 `permissions:` 宣言（`ci.yml:12-13` 等、`deploy` の `deployments: write`（`ci.yml:278-280`）含む）は最小権限の原則どおり**必要なジョブだけで上書き昇格**する形を維持する。`id-token: write`（OIDC）は将来 OIDC を使う特定ジョブに限定して付与する方針を明記する。
- [ ] FR-210-06: fork からの PR と `pull_request_target` の扱いを明文化する。現状 `ci.yml:6` は `pull_request`（`pull_request_target` 不使用、`grep` で確認）で secrets が fork PR に渡らない安全側のため、**`pull_request_target` を安易に導入しない**ことをコメント / ドキュメントで残す。secrets を要するジョブ（`edge-functions-deploy-lag`・`deploy`）が fork PR で実行されないこと（`deploy` は `ci.yml:276` で main push 限定、`edge-functions-deploy-lag` は secrets 未設定時 exit 0、`ci.yml:111-112`）を維持・確認する。

#### C. secret scanning / 漏洩防止（GitHub 標準 + 軽量 pre-commit・必須）
- [ ] FR-210-07: GitHub の **Secret scanning** と **Push protection** をリポジトリで有効化する (要設定: Security 設定)。これにより既知パターンの秘密の push がブロックされる。検知時の一次対応は「**まず失効（rotate）、次に履歴除去**」の順とし、REQ-017 / `23_Leak_Response_Playbook` の手順へリンクする。
- [ ] FR-210-08: 軽量な **gitleaks の pre-commit フック**を導入する。一人運用に合わせ husky か pre-commit framework のどちらか軽い方を採用し、`.gitleaks.toml`（許可リスト・対象範囲）を用意する。あわせて CI に gitleaks ジョブ（PR・push で full / diff スキャン）を SHA 固定の Action で追加し、ローカルをすり抜けた秘密混入を CI でも検知する。これが REQ-017 NFR-017-01 の恒常的な実装にあたる。
- [ ] FR-210-09: 長期有効な静的キーよりも **OIDC / Workload Identity（短命トークン）を優先**する方針を明記する。当面は Vercel / Supabase の長期トークン（`secrets.VERCEL_TOKEN` ほか、`ci.yml:290-295`）を使うが、各プロバイダが OIDC をサポートする範囲で段階移行を将来 TODO とし、移行時は FR-210-05 の `id-token: write` を当該ジョブにのみ付与する。

#### D. CODEOWNERS / ブランチ保護（必須・GitHub 標準）
- [ ] FR-210-10: **CODEOWNERS**（`.github/CODEOWNERS`）を新規作成し、感度の高いパス（`/.github/workflows/`・`/.github/dependabot.yml`・`/package.json`・`/package-lock.json`・`/next.config.*`・`/src/middleware.*` または `/middleware.*`・`/supabase/migrations/`・`/supabase/tests/`・`/supabase/schema.sql`）にオーナー（一人運用なら本人）を割り当てる。
- [ ] FR-210-11: main の **ブランチ保護 / Ruleset** を設定する (要設定): default branch への直 push を禁止、PR 経由のみ、**required status checks に CI の主要ジョブ**（少なくとも `test` / `e2e` / `rls-tests`、可能なら追加の `audit` / gitleaks）を指定、CODEOWNERS レビュー必須、**承認後に新規 commit が入ったら旧承認を無効化（dismiss stale reviews）**。一人運用で self-merge する場合も、誤 push 防止と CI 強制のため直 push 禁止＋required checks は有効にする。

#### E. SAST（任意 / 将来）
- [ ] FR-210-12（任意）: **CodeQL**（`github/codeql-action`、JavaScript/TypeScript）のワークフローを SHA 固定で追加し、push / PR / 週次でセキュリティ静的解析を行う。public リポジトリなら無償、一人運用でも導入コストは低い。導入時は深刻度の高いアラートをトリアージ対象とする。重い商用 SAST はスコープ外（将来検討）。

### 非機能要件
- [ ] NFR-210-01: 追加する CI ジョブ（`audit` / gitleaks / Dependency Review / CodeQL）は **REQ-180 の方針（concurrency・`timeout-minutes`）に従う**こと。本 REQ で追加するジョブにも `permissions: contents: read`（CodeQL は `security-events: write`）を最小権限で付け、`timeout-minutes` を設定する。
- [ ] NFR-210-02: 一人運用で**継続可能な運用負荷**に収めること。Dependabot の PR 量は `open-pull-requests-limit` とグルーピング（可能なら）で抑制し、`npm audit` の allowlist には必ず「無視理由・再評価期日」を残す。週次より細かいスケジュールにはしない。
- [ ] NFR-210-03: 既存 CI を壊さないこと。SHA 固定（FR-210-04）の後も全ジョブが現行どおり通過し、`edge-functions` の `--frozen` lockfile 検証（`ci.yml:102`）・`npm ci` の決定的インストールを維持する。新ジョブの fail は「実害ある検知時のみ」にし、ノイズで常時赤にしない（しきい値・allowlist を初期調整）。
- [ ] NFR-210-04: secret scanning / gitleaks は **placeholder 値や公開して問題ない `NEXT_PUBLIC_*`**（`ci.yml:15-16` 等の anon key / URL はクライアント公開前提）を誤検知しないよう allowlist を調整し、運用を阻害しないこと。
