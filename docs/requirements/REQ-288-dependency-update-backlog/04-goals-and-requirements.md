## 目的

1. 滞留している 6 PR を、ブランチ運用ルールに沿って安全に処理する
2. メジャー更新を 1 本ずつ検証し、破壊的変更の重なりを解消する
3. 同じ滞留が再発しないよう、更新の取り込み手順を定める

---

## 要件

### 機能要件

- [ ] **FR-288-01**: 低リスクの #29（github-actions グループ）と #30（development-dependencies グループ）を先に処理する。いずれも base が `develop` で MERGEABLE。CI が緑であることを確認してマージする。
- [ ] **FR-288-02**: #23〜#26 の base を `main` → `develop` へ付け替える。付け替えで CI が再実行されない、または `mergeable` が UNKNOWN のままの場合は、**close して Dependabot に再作成させる**（`@dependabot recreate`）。**`main` へ直接マージしないこと。**
- [ ] **FR-288-03**: メジャー更新 4 本を**1 本ずつ独立した PR として**検証・マージする。まとめて 1 PR にしないこと。推奨順序と着眼点:
  - [ ] (1) `jsdom` 29 — 影響範囲がテスト環境に閉じる。`npm test` と e2e が緑であること
  - [ ] (2) `eslint` 10 — `eslint.config.js` と各プラグインの peer 互換。lint が緑であること
  - [ ] (3) `typescript` 7 — `npm run build` と型生成（`schema-drift` ジョブ）が通ること。`@typescript-eslint` の対応版が必要なら同 PR で上げる
  - [ ] (4) `i18next` 26 — **唯一の本番依存**。4 言語すべてで表示崩れ・キー欠落が無いこと。e2e の言語切替が緑であること
- [ ] **FR-288-04**: 各メジャー更新の PR に、破壊的変更の確認結果（upstream の migration guide のどの項目が該当したか／しなかったか）を記述する。
- [ ] **FR-288-05**: 依存更新の取り込み手順を `docs/runbooks/` に追加する。少なくとも次を含む: グループ PR は即マージ可・メジャーは 1 本ずつ・`main` 宛て PR を見つけたら base を付け替える・滞留は週次で棚卸しする。
- [ ] **FR-288-06**: メジャー更新を Dependabot が出す際に、他の更新と混ざらないよう `groups` の設定が現状のままでよいことを確認し、`.github/dependabot.yml` にコメントとして明記する（`update-types` に major を含めない意図の記録）。

### 非機能要件

- [ ] **NFR-288-01**: 本要件の作業で本番の挙動を変えないこと。`i18next` のみ本番依存であり、これだけは表示確認を伴う。
- [ ] **NFR-288-02**: 各 PR は CI（lint / 型 / unit / e2e / bundle size / Lighthouse）が緑であること。`.size-limit.json` の予算を超えないこと。
- [ ] **NFR-288-03**: `develop` → `main` のマージは、共通 Git ブランチ運用ルールに従うこと。`develop` を作る前に `git rev-list --left-right --count main...origin/main` が `0 0` であることを確認する。

---
