# 実装タスク

要件は [requirements.md](requirements.md)、設計は [design.md](design.md)。完了のチェックは、テストか実挙動の証拠が揃ってから付ける。証拠は各項目の末尾か、下の「検証の記録」に書く。
PRは3本：[165](https://github.com/haranishi/zaridasu/pull/165)（DB）、[166](https://github.com/haranishi/zaridasu/pull/166)（Edge Functions）、[167](https://github.com/haranishi/zaridasu/pull/167)（アプリとCI）。マージと本番へのmigration適用は、本人の操作。

## 準備

- [x] 9/27の保存枝を読み、取り込み済みの3件と、残っているREQ-316を切り分ける（10/1の71e9936で取り込み済み）。
- [x] 観点別のレビュー5本を回し、指摘を research.md に記録する。
- [x] 手元のPostgreSQL 16に、CIの `rls-tests` と同じ手順を再現する。現行の `develop` で全21ファイルが通ることを確かめた。

## DB（PR 165）

- [x] 1. 関数の実行権限を既定で閉じる。テスト自身は権限を変えない。
  - 証拠：`supabase/tests/req316_function_execute_default_closed.sql`（12件）。許可リストの変異3種（開いた関数を混ぜる／公開の関数を閉じる／既定の権限を外す）で落ちる。
  - _Requirements: 1_
- [x] 2. 非公開プロフィールのNULL素通りを直す。証拠：`rls_private_profile_anon.sql`（8件）。
  - _Requirements: 2_
- [x] 3. `created_at` を受付時刻に固定する（9表）。証拠：`rls_created_at_pinned.sql`（9件）。過去の日時を指定しても上限が効く。
  - _Requirements: 3_
- [x] 4. 配信停止トークンの列を隠す。証拠：`rls_unsubscribe_token_column.sql`（9件）。`apply_unsubscribe` は動く。
  - _Requirements: 4_
- [x] 5. 退会を直す。証拠：`rls_account_deletion.sql`（9件）。投稿・コメント・監査行のある会員が退会できる。
  - _Requirements: 5_
- [x] 6. 新規投稿の3列を初期化する。証拠：`rls_post_insert_ops_columns.sql`（6件）。
  - _Requirements: 6_
- [x] 7. コメント通知の請求テーブルを足す。証拠：`rls_comment_notification_claims.sql`（8件）。非公開テーブルの検査の許可リストも合わせた。
  - _Requirements: 9_
- [x] 8. migrationの索引（README、全74本）と `docs/current/privacy.md` を更新する。
  - _Requirements: 1, 2, 3, 4, 5_

## Edge Functions（PR 166）

- [x] 9. 失敗した写真があれば自動承認しない。証拠：`analyze-image` の試験（部分失敗）。
  - _Requirements: 7_
- [x] 10. 画像・音声のハッシュを、サーバーが原本から計算する。証拠：`aiDedup` の試験。実際のPostgREST 14.18で `cs` フィルタが通ることを確認した（`.contains(列, 配列)` は jsonb 列で `22P02` になる）。
  - _Requirements: 7_
- [x] 11. メディア取得の共通化（ホスト・https・リダイレクト・逐次読み）。証拠：`_shared/__tests__/mediaFetch.test.ts`。リダイレクト禁止の試験に穴（模擬の中の確認を `assertRejects` が吸収する）を見つけて直し、壊すと落ちることを確認した。
  - _Requirements: 8_
- [x] 12. `notify-comment` の請求と、失敗時の戻し。証拠：`__tests__/claims.test.ts`・`handler.test.ts`。
  - _Depends: 7_
  - _Requirements: 9_

## アプリとCI（PR 167）

- [x] 13. 編集で追加した写真の原本拒否。投稿削除で音声とAI縮小版も消す。証拠：`postMedia`・`storage`・`useEditPost`・`useDeletePost`・`useAdminPosts` の試験。
  - _Requirements: 10_
- [x] 14. 非公開スポットの待ち行列を、ログアウトの確認と退会に組み込む。証拠：`localData`・`flushBeforeSignOut`・`AuthContext.signOut` の試験。
  - _Requirements: 10_
- [x] 15. 画像最適化のホスト限定。バックアップの対象バケットと平文tarの後始末。Vercel CLIの固定。gitleaksの除外の見直し。証拠：gitleaksは新しい設定で全履歴0件、無視ファイルを外すと既知の1件だけが出る。
  - _Requirements: 11_
- [x] 16. `.kiro/steering/security.md` を足す。`home-hub-ui` の古いチェックを直す。REQ-316に参照を足す。（PR 165に含む）
  - _Requirements: 12_

## 検証の記録

2026-10-21 18時台に確認。3本とも、全ジョブが成功（`test`・`e2e`・`rls-tests`・`migration-gate`・`schema-drift`・`edge-functions`・`gitleaks`・`audit` ほか。`deploy` と `dependency-review` はPRでは対象外でSKIPPED）。3本とも衝突なし。

| PR | 手元の検証 |
|---|---|
| 165（DB） | CIと同じ手順の手元のPostgreSQL 16で、既存21本と新規7本の全28ファイルが通る。新規7本は、直す前に失敗することを確認 |
| 166（Edge） | `deno test` 269件。`deno cache --frozen`・`deno check` が通る |
| 167（アプリ・CI） | vitest 1,831件、`next build`、サイズ予算、gitleaks（全履歴0件） |

3本を一時的に合流させた状態でも、衝突なし・DBテスト28/28・事前検査10/10が通った。

未確認：本番の実状態（migrationは未適用）。E2Eの手元実行（CIでは成功）。実際のPostgRESTでの確認は手元だけ。マージと本番適用は本人。
