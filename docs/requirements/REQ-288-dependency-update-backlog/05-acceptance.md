## 受入条件

- [ ] **AC-01**: `gh pr list --state open` に `base: main` の Dependabot PR が 0 件である
- [ ] **AC-02**: #23〜#26 に相当する 4 つのメジャー更新が、それぞれ独立した PR として `develop` にマージ済み、または「見送り」と判断され理由付きで close されている
- [ ] **AC-03**: マージ後の `develop` で `npm run build` / `npm test` / e2e が緑である
- [ ] **AC-04**: `package.json` の 4 パッケージが、マージした版に更新されている（見送った場合はその旨が記録されている）
- [ ] **AC-05**: 実装済み 4 ロケール（`src/locales/` = `ja` / `en` / `ko` / `zh`）すべてで主要画面のラベルが欠落していない
- [ ] **AC-06**: 依存更新の取り込み手順が runbook に存在する

---
