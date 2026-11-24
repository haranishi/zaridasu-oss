## 現状の問題

### A. 🟡 4 本の PR が `main` 宛てのまま滞留している（旧設定の残骸）

`gh pr list -R haranishi/zaridasu --state open` の実測（2026-07-29）:

| PR | 内容 | base | 作成日 | mergeable |
|---:|---|---|---|---|
| #30 | `chore(deps-dev)`: development-dependencies グループ（8 件） | **develop** | 2026-07-27 | MERGEABLE |
| #29 | `chore(ci)`: github-actions グループ（4 件） | **develop** | 2026-07-27 | MERGEABLE |
| #26 | `eslint` 9.39.4 → **10.7.0** | **main** | 2026-07-20 | UNKNOWN |
| #25 | `jsdom` 28.1.0 → **29.1.1** | **main** | 2026-07-20 | UNKNOWN |
| #24 | `typescript` 5.9.3 → **7.0.2** | **main** | 2026-07-20 | UNKNOWN |
| #23 | `i18next` 25.8.18 → **26.3.6** | **main** | 2026-07-20 | UNKNOWN |

`.github/dependabot.yml` は npm・github-actions の両エコシステムで `target-branch: "develop"` を**既に指定済み**であり、設定の不備ではない。#23〜#26 は設定変更（2026-07-23）より前の 2026-07-20 に作られたため、旧既定（main）を向いたままになっている。

`mergeable: UNKNOWN` は GitHub 側でマージ可能性が未計算の状態であり、長期滞留した PR で起きやすい。base を付け替えるか作り直すことで再計算される。

### B. 🟡 メジャー更新 4 本が未検証のまま積み上がっている

`package.json` の現行バージョン:

| パッケージ | 現行 | 提案 | 種別 | 想定される影響 |
|---|---|---|---|---|
| `typescript` | `^5.9.3` | 7.0.2 | devDep | **メジャー 2 つ飛び**。型チェック全域。`tsconfig.json`・`@typescript-eslint` との整合 |
| `eslint` | `^9.0.0` | 10.7.0 | devDep | flat config の仕様変更・プラグイン互換（`eslint.config.js` は既に flat） |
| `i18next` | `^25.8.18` | 26.3.6 | **production** | 唯一の本番依存。4 言語 1093 キーの i18n 全域。REQ-277（直書き撲滅）と関係 |
| `jsdom` | `^28.1.0` | 29.1.1 | devDep | vitest のテスト環境。DOM API 挙動差でテストが落ちうる |

`groups` は `update-types: [minor, patch]` に限定されているため、メジャーは意図どおり個別 PR になっている（設定は正しい）。ただし**個別に検証する運用が回っていない**。

### C. 🟡 依存更新の安全網が薄い（REQ-281 問題C の再掲）

- `codeql.yml:31` / `ci.yml:428` の `if: !repository.private` により、private リポでは **CodeQL も dependency-review も実行されない**
- `ci.yml:381-388` の npm audit（本番依存 high+）は `warning` 止まりで **fail しない**
- 実効的なゲートは gitleaks のみ

つまり「Dependabot が上げてくる → CI が緑 → マージ」の流れにおいて、脆弱性・破壊的変更を止める仕組みが CI テスト（型チェック・lint・unit・e2e）だけに依存している。

---
