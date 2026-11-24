## 8. CodeQL（任意 SAST）の削除と復活手順（REQ-317 FR-317-05）

`.github/workflows/codeql.yml` は **2026-08-07（REQ-317 実装コミット）で削除した**。

**理由**: 本リポジトリは **private かつ GitHub Advanced Security（GHAS）未契約**のため CodeQL は実行不能で、
workflow 側の `if: ${{ !github.event.repository.private }}` により **全 run が skip** だった（2026-08-07 実績確認）。
Actions の分は消費しないが、変更のたびに無意味なトリガーと PR 上のチェック行が発生していた。
**SAST の実効カバレッジは削除の前後で変わらない**（元から 0 件解析）。

### public 化 / GHAS 契約時の復活手順

1. **git 履歴から復元する**（REQ-317 の実装コミットが削除コミット）。

   ```bash
   # 削除コミットを特定する
   git log --oneline --diff-filter=D -- .github/workflows/codeql.yml
   # その1つ前（^）の版を取り出してワーキングツリーに戻す
   git checkout <削除コミットのSHA>^ -- .github/workflows/codeql.yml
   ```

2. 復元した `codeql.yml` の `on:` を**現行のブランチ運用に合わせて見直す**。削除時点の内容は
   `push: [main, develop]` / `pull_request: [main, develop]` / 週次 schedule だが、`ci.yml` は
   REQ-317 FR-317-01 で push トリガーを `[main]` のみに縮小している。CI 消費を増やさないなら
   `push: [main]` + `pull_request` + 週次 schedule に揃えるのが本 REQ の方針と整合する。
3. Actions の SHA ピン留めが古くなっているので、`github/codeql-action/*` と `actions/checkout` の
   ピンを最新の SHA へ更新する（REQ-210 の SHA 固定方針は維持すること）。
4. §1 の「CodeQL / Code scanning の default setup を無効にする」を実施する。advanced な
   `codeql.yml` と default setup の**重複セットアップはエラーになる**（FR-210-12 / AC-08）。
5. 必要なら §2 のブランチ保護 required status checks に `Analyze (javascript-typescript)` を戻す。
