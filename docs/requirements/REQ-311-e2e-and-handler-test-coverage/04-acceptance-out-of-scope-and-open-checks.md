## 受入基準

- **AC-01（ハンドラ export 化）**: 対象 5 本すべてで下記が 5 件ヒットする。
  ```bash
  grep -l "export async function handleRequest" \
    supabase/functions/{notify-dormant-reengage,notify-research-adopted,notify-weekly-digest,send-push,social-announce}/index.ts | wc -l
  # 期待: 5
  ```
- **AC-02（テスト存在）**: 5 本すべてに `__tests__/handler.test.ts` があり、Deno テストがパスする。
  ```bash
  deno test --allow-env --allow-net --allow-read \
    --lock=supabase/functions/deno.lock --cached-only supabase/functions/
  ```
  （REQ-297 FR-297-01 が完了していれば `--no-check` 無しで通ること）
- **AC-03（401 経路）**: 5 本すべてで、`WEBHOOK_SECRET` 設定済み・ヘッダ不一致のリクエストに **401** を返すテストが存在する。
- **AC-04（オプトアウト）**: `send-push` の 3 カテゴリすべてについて、対応する `notify_push_*` が `false` のとき外部 Push 送信が **1 度も呼ばれない**ことをアサートするテストが存在する。メール 3 本は `category` リテラルが期待値であることをアサートするテストが存在する。
- **AC-05（主要フロー e2e）**: 認証系統の e2e で「投稿送信 → `pending` 表示」「管理者承認 → 公開」の 2 本が通る。実行手順（ローカル Supabase の起動 / テストプロジェクトの secrets）が README または runbook に記載されている。
- **AC-06（名前と実態の一致）**: `tests/e2e/error-boundary.spec.ts` が存在しない（改名済み）か、エラーバウンダリを実際に検証している。
- **AC-07（エラーバウンダリ実描画）**: 例外を throw するルートは開発／e2e 環境でのみ到達可能で、本番ビルドでは 404 になる。この点をテストまたはコード上のガードで示す。
- **AC-08（CI 時間の記録）**: 追加後の CI 実行時間（e2e ジョブ単体と全体）を計測し、本要件に追記する。増加が許容範囲を超える場合は、認証系統を `main` push または nightly のみに限定する運用に切り替える。
- **AC-09**: `lint` / `type-check` / 既存 652 テストがパスする。

## 対象外

- `playwright.config.ts` の `maxFailures` 緩和と失敗時 artifact 化（trace / スクリーンショットの回収）は **REQ-297 FR-297-05** の範囲。本要件で認証系統を追加すると失敗時の調査が重要になるため、**REQ-297 を先に、または同時に入れることを推奨する**。
- Edge Function の型検査ゲート（`deno check`）は REQ-297 FR-297-01 の範囲。
- 通知の冪等性（送信済みマーカー・レート制限）は REQ-280 の範囲。本要件はその挙動を将来テストできる土台（ハンドラ export 化）を作るところまでを扱う。
- `analyze-image` は `__tests__/` を持たないが `index.test.ts`（同ディレクトリ直下）でテストされているため、本要件の「未テスト 5 本」には含めない。

## 要確認

- FR-311-03 の方式選択（ローカル Supabase か専用テストプロジェクトか）は未決。ローカル方式は REQ-281 FR-281-01（migrations の from-scratch 再適用性の是正）に依存する。
- seed ユーザーに管理者ロールを与える方法（`auth.users.raw_app_meta_data` の `role: 'admin'` を seed で設定できるか）は未検証。`supabase/config.toml:29-30` が参照する `supabase/seed.sql` は**実体が存在しない**（監査 infra L-3）ため、seed の器を作ること自体が前提作業になる。
- 認証系統を CI のどのトリガー（PR / main push / nightly）で回すかは AC-08 の計測結果しだい。
