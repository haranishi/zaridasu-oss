# glob/minimatchの警告を解消する（2026-11-14）

REQ-210 FR-210-01〜03・NFR-210-03の保守対応。本人がDependabot警告2・3の修正を依頼した。

## 問題と受け入れ条件

- 警告2：[glob GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)。9〜14.0.1の中断後の探索継続。修正版は14.0.2以上。
- 警告3：[minimatch GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)。7〜11.0.0のパターン処理による資源消費。修正版は11.0.1以上。
- main/developのlockはglob 13.0.6・minimatch 10.2.5。本番・開発の両依存に波及し、npm auditはModerate 13件。
- lockとクリーン導入から該当範囲を除き、既存のbraces除外とlint・型・テスト・buildを維持する。
- developのCIを先に通して統合し、main向けの最小差分も検証・統合する。GitHubが警告をfixedへ更新したか照合する。
- 警告のdismiss、監査しきい値の緩和、秘密情報の移設、本番DBの変更は行わない。

## 設計と範囲

Sentryはglob 14を正式採用した11.11.0へ、ESLintはminimatch 11を採用した10.15.0へ更新する。
TypeScript ESLintの最新版8.72.2もminimatch 10を指定するため、typescript-estree配下だけminimatch 11へ一時overrideする。
旧minimatch 3は対象外。既存のNext lint用tinyglobby互換処理を維持し、他の定期更新は混ぜない。
SDK更新で増えたMCP収集設定も入出力falseとし、REQ-211の自動収集禁止と型・既存回帰を維持する。
実際のglob探索・ESLint対象ファイルの認識・TypeScript project serviceの許可globを回帰で確認する。
既存の編集中worktreeを保持し、main 8879605からSSD上の専用ブランチで作業する。
main向け差分には、別作業のOSS画面・開発環境の変更を持ち込まない。

## タスクと証拠

- [x] 警告・上流advisory・依存経路・既存PR183/184を照合。既存PRは広い定期更新のため、本件は必要な修正に絞る。
- [x] 元lockではglob/minimatchの残存検査が失敗し、更新後は互換性を含む12件が成功。
- [x] npm ci・全依存audit・10 precheck・単体1,975件・Edge269件・本番buildが成功。
- [ ] develop/main双方の必須CIと取り込み、mainの配備、警告のfixed状態を確認する。

## ローカル結果

lockはglob 14.0.6・minimatch 11.0.8。全依存のauditはModerate 13件から0件へ減少した。
Sentry 11.11.0・ESLint 10.15.0とその必要な依存だけを更新し、従来のbraces除外も再確認した。
SDK追加項目のmcp入出力は明示的にfalse。収集設定のRequired型と既存の値固定回帰を維持した。
検証はNode.js 24.22.1/npm 12.2.1。本番buildには擬似Supabase設定を使い、有料APIや本番データを使っていない。
GitHubの警告はdefault branchの再解析後に判定する。audit成功だけで解消済みとは報告しない。
現在の監査結果は、実行時点の公開advisoryに対するもの。
