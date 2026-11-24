## 2. ブランチ保護 / Ruleset（Settings → Branches → Add rule、または Rules → Rulesets）

main を保護する（FR-210-11 / AC-06）。一人運用で self-merge する場合も、誤 push 防止と CI 強制のため有効化する。

- [ ] **Require a pull request before merging**（default branch への直 push を禁止）。
- [ ] **Require status checks to pass before merging** を有効化し、以下を **required** に指定:
  - `test`
  - `e2e`
  - `rls-tests`
  - （推奨）`audit`, `gitleaks`
  - （任意）`edge-functions`, `schema-drift`
  - ※ `Analyze (javascript-typescript)`（CodeQL）は **REQ-317 FR-317-05 で workflow ごと削除**したため指定できない（§8）。
  - ※ `deploy` / `dependency-review` は **required にしない**（deploy は main push 限定、dependency-review は PR 限定のため）。
  - ※ `perf-budget` も **required にしない**。REQ-317 FR-317-03 により `base = develop` の PR でしか起動せず、リリース PR（develop → main）では起動しないため（skipped の扱いに依存させない）。
- [ ] **Require branches to be up to date before merging**（required checks を最新コミットで再実行）。
- [ ] **Require review from Code Owners**（`.github/CODEOWNERS` のレビュー必須）。
- [ ] **Dismiss stale pull request approvals when new commits are pushed**（承認後の新規 commit で旧承認を無効化）。
- [ ] （任意）**Do not allow bypassing the above settings** / **Include administrators**（自分自身にもルールを適用）。

> 一人運用で CODEOWNERS レビュー必須にすると自分の PR を自分で承認できない場合がある。
> その場合は「Require a pull request」+ required status checks のみを必須にし、Code Owners レビューは任意運用にしてもよい（誤 push 防止と CI 強制という主目的は満たせる）。

---
