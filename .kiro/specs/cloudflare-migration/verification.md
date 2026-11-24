# 設計文書の検証記録

2026-10-30。対象：[移行仕様](brief.md)。アプリ・DB・依存・CI・本番設定の変更はない。

## 調査の証拠

- 基点：`develop` の `f820066`。現行SDD、セキュリティ仕様、アプリ/SQL/CIを参照した。
- 別セッションでSupabase依存とWeb移行互換性を読み取り調査し、根拠パスと公式資料を確認した。
- 結果と限界は[research.md](research.md)に記載。実環境の設定・適用済み状態・利用量は未照合。

## 文書の検査

- 初回機械確認：文書14ファイル、相対リンク91件の参照先存在、JSON解析、各Markdown100行以内が成功。
- `git diff --cached --check` 成功。`gitleaks protect --staged --config .gitleaks.toml --redact` で検出0。
- 日本語クイック検査：`uv run --offline .../lint.py --json --genre tech` で新規Markdown11本を検査。
  - 文長の均質さの警告2件。手順/記録の文型として妥当と判断し保持。常套句等の警告は0。
  - 通常Pythonには辞書依存が無かったため、既存uvキャッシュで実行した。モデル取得はしていない。
- 独立レビュー：業務更新と変更台帳/Outboxの同時確定不足を指摘。設計と切替手順へ反映した。
  - 修正後の別セッション確認で解消、追加指摘なし。R2の確定/削除順序も確認した。

## GitHubの確認

[PR174](https://github.com/haranishi/zaridasu/pull/174)をdevelop向けに作成し、レビュー可能へ変更した。
初回head `a022392` の[CI run](https://github.com/haranishi/zaridasu/actions/runs/40991000372)はfailure。
testジョブはステップ0件で、注釈は「支払い失敗または利用上限の増額が必要なため開始されなかった」と示す。
アプリや文書に起因する試験不合格ではないが、CIを合格したとは扱わない。
developのbranch protectionは未設定。変更は文書のみでローカル検証・独立レビューが完了しているため、
設定やチェックを無効にせず、通常のPRマージを行う方針とした。実際のマージ状態と最終headはPR174を正本とする。

## 実施していないこと

依存導入、アプリビルド、互換性スパイク、DB変換、負荷・復元試験、本番接続とデプロイは未実施。
移行先リソースは作成していない。将来の実装タスクは[tasks.md](tasks.md)で未着手として管理する。

## 認証・メール・残存障害の追加設計

基点：develop `ab4fd3f`。本人の追加依頼で認証完全移行・配信構成・残存依存を同じSDDへ追記した。
別セッションの読み取り監査を2担当で行い、候補/制約を公式資料と実装で確認した。
追加文書は[認証](auth-design.md)・[認証切替](auth-cutover.md)・[メール](email-design.md)・
[全14処理](background-processing.md)・[障害15件](migration-blockers.md)。採用と実装は引き続き未承認。

- 文書のリンク/JSON/行数/差分を検査し、各Markdown100行以内、変更は文書のみであることを確認した。
- staged gitleaksは検出0。日本語クイック検査の文長警告は、処理/タスク手順の均質さとして保持した。
- 独立レビュー2件を採用し、再確認で両方解消・追加指摘なし。
  - SIGNED_OUTで清掃するのは入力フォーム草稿/計画控えで、保存済みqueue/IndexedDB圏外記録とは区別した。
  - 認証APIが送信業者を待たない構成、送信予約の耐久化/暗号化/TTL、存在有無の応答時間試験を明記した。

新しい認証SDK/DB adapter・hash・Queue・メールの互換性や到達性は未実測。鍵・本番利用者は取得していない。
[PR175](https://github.com/haranishi/zaridasu/pull/175)をdevelop向けに作成した。
初回head `d0eba17` の[CI](https://github.com/haranishi/zaridasu/actions/runs/40993275432)はfailure。
testはステップ0件、注釈は支払い/利用上限により未開始と示す。文書検証の不合格ではなく、CI成功とも扱わない。
文書18ファイル・相対参照149件の検査と独立レビューを根拠に、保護設定やチェックを変えず通常マージする方針。
最終headのCIとマージ状態はPR175を正本とし、PR174の初回検証と混同しない。
