# 開発依存のbraces警告を解消する（2026-10-23）

REQ-210 FR-210-01〜03・NFR-210-03の保守対応。本人からGitHubのセキュリティ警告の修正依頼を受けた。

## 確認した問題と受け入れ条件

Dependabot警告1は [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)（High）。
`braces <=3.0.3` の深い入れ子でNode.jsが停止する。2026-10-23時点で修正版はない。
経路は `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`。
すべて開発依存であり、アプリの公開経路から呼ばれてはいない。

- ロックファイルとインストール結果から、脆弱な `braces` と不要になる `micromatch` を除く。
- Next.jsのlintを維持し、rootDirの未指定・文字列・配列・glob指定で探索結果を保つ。
- Pages RouterとApp Routerの内部リンク違反を引き続き検出し、外部リンクは検出しない。
- 本番依存のHigh以上を止める既存ゲートを維持する。

## 設計判断

`@next/eslint-plugin-next@16.4.2` のfast-glob呼び出しは `get-root-dirs` の
`globSync(pattern, { onlyDirectories: true })` だけだった。
このプラグインの依存に限り、npmのfile overrideでローカルの互換処理に置き換える。
処理は既存のVite依存にもある `tinyglobby@0.2.17` に委ね、直接aliasにはしない。
探索範囲の自動拡張を止め、絶対パスと末尾スラッシュの扱いをfast-globにそろえる。
全パッケージへ置換を広げず、使うAPIやオプションが変わったら明示的に失敗させる。
file指定は依存元の `node_modules/@next/eslint-plugin-next` からの相対パスなので、
`../../../tools/next-eslint-glob` とする。ロックファイルはルートの `tools/` へのリンクを持つ。

無理なNext.js更新や未公開パッチの取り込みを避け、確認できた1経路を除く。
監査の抑制・警告のdismiss・私製の修正バージョンによる回避は行わない。
上流がfast-globへの依存をなくしたら、このoverrideと互換性テストを再評価する。

根拠：[Next.jsの対象ソース](https://github.com/vercel/next.js/blob/v16.4.2/packages/eslint-plugin-next/src/utils/get-root-dirs.ts)、
[tinyglobbyの公式資料](https://github.com/SuperchupuDev/tinyglobby)。

## タスクと検証

- [x] 警告・ロックファイル・公開経路・既存REQを照合する。
- [x] 実際のNext.jsプラグインで、探索と内部リンク検出の回帰テストを追加する。
- [x] 対象だけにoverrideを適用し、ロックファイルを再生成する。
- [x] 依存監査・互換性テスト・lintを確認する。
- [ ] PRのCIで、正確な依存一式のnpm ci・型・テスト・ビルドを確認する（GitHubの支払い・利用上限で実行前に停止）。

外部SSDが未接続のため、ローカルでは既存依存と小さな隔離環境を使う。
依存一式のローカル再導入・ビルド出力の大量生成は行わない。
手元ではNode.js 24.22.1と既存依存を使い、対象プラグイン16.4.2だけを隔離して導入した。
型検査と全体のlintが成功。本番依存と全依存の監査は両方0件。
置換前はbraces残存の検査だけが失敗し、既存の探索・リンク検出は成功することを確認した。
小さな隔離環境のコールド `npm ci` でも、依存置換が再現した（npm 12.2.1と10.9.4で確認）。
ロックの差分は不要な16項目の削除とローカル互換処理への2項目の追加だけで、既存パッケージの更新はない。

全体の単体テストは180ファイル・1,960件が成功（追加の互換性テスト8件を含む）。gitleaksも検出0件。
[PR 170](https://github.com/haranishi/zaridasu/pull/170) の
[CI実行](https://github.com/haranishi/zaridasu/actions/runs/39894605094) は、支払い失敗または利用上限のため全ジョブが起動しなかった。
本番ビルド・E2E・Node.js 22での全依存のクリーン導入は未確認。請求・上限の確認後にCIを再実行する。
GitHubの警告は、developからmainへ取り込み、依存グラフが再解析されるまで開いたままになる。
