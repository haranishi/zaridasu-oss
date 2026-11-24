# OSS公開準備の実装タスク

- [x] 1. 最新developと既存仕様、未保存変更、SSDを照合し、専用ブランチを作る。
  - base: 283687c。既存のロゴ作業は未変更。
- [x] 2. 現行ファイル・全履歴の秘密情報と公開対象を検査し、失効状況と除外を分けて記録する。
  - _Requirements: 1_
- [x] 3. CIの本番資格情報をPRから切り離し、mainのmigrationゲートを維持する。
  - 本番資格情報の欠落、API障害、照合不一致では配備へ進まないことを回帰検査した。
  - _Requirements: 2_
- [x] 4. 同梱npm依存とlockを修正し、空の環境からの導入を確認する。
  - _Requirements: 3_
- [x] 5. ローカルSupabase設定と開発手順を整え、架空データで検証する。
  - _Depends: 4_ / _Requirements: 3_
- [x] 6. 公開範囲、素材の権利、脆弱性報告先、保守範囲を整える。
  - _Requirements: 4_
- [x] 7. 関連テスト・ビルド・境界検査と読取レビューを行い、証拠を残す。
  - _Depends: 2, 3, 4, 5, 6_ / _Requirements: 1, 2, 3, 4, 5_
- [x] 8. 変更をcommit/pushし、develop向けPRと公開可否・残件の報告を作る。
  - 証拠：[PR181](https://github.com/haranishi/zaridasu/pull/181)、develop向け。元repoは非公開のまま。
  - _Depends: 7_ / _Requirements: 5_
- [ ] 9. 公開前の残件を照合する。_Requirements: 1, 2, 4, 5_
  - [ ] 9.1 Secretsの安全な移設と元配置の除去、非main拒否試験を完了する。自動承認レビューで移設方式が保留。[手順](operations.md)。
    main/develop保護とProductionのmain限定、mainの利用側切替（PR182）は反映・検証済み。
  - [x] 9.2 外部参加をfork→PRへそろえ、地図帰属・同梱ライセンス・公開用の代替画像を実装し、独立導入と表示を検証した。
  - [ ] 9.3 Googleキー失効、履歴処理、不明素材の権利、本番Webhook/上限、非公開脆弱性窓口を照合する。未確認を合格にしない。
    - [x] 9.3.1 Google旧キーの交換・失効、本番Webhook認証の強制、AIの上限・停止手段を確認した（2026-11-24・[記録](followup-20261123.md)）。
    - [ ] 9.3.2 履歴処理は案B（公開の直前に新しいrepoを作る）。実行は公開の最終判断の後。不明素材は、公開版では代替画像に置き換えてある。非公開脆弱性窓口は、公開後に有効化する。
  - [x] 9.4 最新developから監査済み・履歴なしの候補を作り、素材8点・本番workflow・私的設定の除外と候補固有の案内を照合する。_Requirements: 1, 3, 4, 5_ _Boundary:_ exportと候補の文書。元アプリの挙動は変えない。
  - [x] 9.5 別のprivate候補repoを準備し、Secretsなし・配備なし・main/develop保護と必須CIを実照合する。_Depends: 9.4_ _Requirements: 2, 3, 4, 5_
- [ ] 10. 公開先・公開対象・取り消せない影響を提示し、公開の最終判断を得る。
  - _Depends: 8, 9, 11_ / _Requirements: 5_
- [ ] 11. 2026-11-23の追加点検で見つかった残件を直す。[記録](followup-20261123.md)
  - [x] 11.1 アンケート運用ツールと専用仕様をsource archiveから外す。稼働中の調査・フォームと設計資料のリンクを書き換え、個人・大学のアドレスや書き換え後に残った宛先があるとexportが止まる検査を足す。_Requirements: 6, 8_
  - [x] 11.2 公開用sourceのSQLから稼働中サービスのURLを除く（exportで無効ホストへ置換）。稼働中のDB関数は変えない。_Requirements: 8_
  - [x] 11.3 条件つき依存を素材台帳へ足し、自前運用の注意文書を追加する。_Requirements: 7, 9_
  - [ ] 11.4 公開用repoの履歴にある私的な作者情報を直す。GitHubの「メールアドレスを非公開にする」は、2026-11-24にオンにした。履歴は案B（公開の直前に履歴1コミットの新しいrepoを作る）で扱い、実行は公開の最終判断の後。_Requirements: 6_
  - [x] 11.5 公開用repo固有の整備。引用情報の宛先とPRテンプレートは、検証用repoで反映済み。行動規範を追加した。通報は、非公開の脆弱性報告窓口から送る。_Requirements: 4_
  - [x] 11.6 公開する内部記録を、鍵・設定の確認結果と矛盾しない状態にした（2026-11-24）。_Requirements: 6_
  - [x] 11.7 対象構成（Vercel＋Supabase。Cloudflare関連は実験）を、自前運用の文書に明記する。_Requirements: 9_
  - [x] 11.8 初参加向けIssueの下書き4件を、実在するコードで確かめて用意する。公開後に保守者がIssueにする。[下書き](first-issues.md) _Requirements: 4_
  - [x] 11.9 公開の方法に案B（公開の直前に、履歴1コミットの新しいrepoを作る）を用意し、手順を具体化する。案Bで進める（実行は公開の最終判断の後）。[手順](public-cutover-fresh-repo.md) _Requirements: 4, 6_

証拠：[検証記録](verification.md)、[履歴なし候補の検証](publication-verification.md)、[追加点検](followup-20261123.md)。公開を妨げる未確認事項はタスク9〜11へ残す。
