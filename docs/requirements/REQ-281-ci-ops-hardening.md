# REQ-281: CI・運用強化（migrations順次適用検証・バックアップ検証・env文書化ほか）

優先度: **P2**（FR-281-05のみ即時実施可） ／ 深刻度: **Medium** ／ 種別: インフラ・DevOps

## 背景

### 問題A: CI が migrations を順次適用せず schema.sql 直接適用のみ
`.github/workflows/ci.yml`。rls-tests / schema-drift は `psql -f supabase/schema.sql` で検証し、`supabase/migrations/*` を空DBへ順序適用するジョブが無い。本番だけが `supabase db push` で migrations を実行するため、schema.sql とのドリフトが本番デプロイまで発覚しない。

> **REQ-282 C-1 実測（2026-07-18）**: `supabase db reset`（空DBへ migrations を頭から順次適用）は **2本目 `20240101000001` で失敗**する（`ERROR 42703 column "survey_request_id" does not exist`）。ベースライン3本（`20240101000000/000001/000002`）が最終スキーマに合わせて後から在庫的に編集されており、`posts_public` ビューが後発 migration（`20260425*`）で追加される `posts.survey_request_id` を参照するため。本番DBは増分履歴で正しく構築済みだが、**FR-281-01 の「順次適用→pg_dump diff」ジョブはこの from-scratch 再適用性の是正を前提とする**（ベースラインを実際の初期状態に戻す or baseline を別立てする）。
>
> なお rls-tests の「既定GRANT後の再適用リスト」は REQ-282 C-2 で `supabase/ci/reapply-after-grants.txt` に外出し済み（追加漏れをレビューで検知可能に）。

### 問題B: バックアップの復元検証なし・失敗が無通知
`.github/workflows/backup.yml:86,100-101,129`。復元テスト（restore-db.sh）はCI未実行。secrets欠落時は exit 0＋`if-no-files-found: warn` で**バックアップ0件を検知できない**。backup だけ `setup-cli version: latest`（他ジョブは flake 回避でピン留め）。

### 問題C: private リポで CodeQL / dependency-review が実質無効
`codeql.yml:31`・`ci.yml:428` の `if: !repository.private`。npm audit high+ も warning 止まり。実効ゲートは gitleaks のみ。

### 問題D: env参照の未文書化
`.env.example` に無いが参照されるキー: `WEBHOOK_SECRET_ENFORCE`（REQ-240 fail-closedトグル）、`NEXT_PUBLIC_TURNSTILE_SITE_KEY`（未設定でサインアップ破綻）、`LATE_API_KEY`/`LATE_API_URL`/`SOCIAL_ANNOUNCE_BUCKET`（social-announce）。

### 問題E（記録のみ・小粒）
- `/api/nearby-water` の恒久レート制限（Overpassプロキシ濫用対策）を将来検討
- `call_lifecycle_edge_function` の本番project-refハードコードfallback（`20260615000006:556`）→ 未設定時 no-op へ
- `usePostForm` オーケストレーションの直接テスト欠如（renderHook＋モックで成功/部分失敗/レートリミット/ロールバック）
- `.size-limit.json` に `/post/[id]` 予算追加
- `calc-ai-cost.ts` 単価表に更新日・出典コメント
- `useStats.ts:172` 月ラベルのUTCパース（RPC返却書式の確認）
- デッドコード `src/components/features/home/MiniProfile.tsx` の削除、`forms.gle` URL の定数化、dataset 引用URLの `BASE_URL` 統一

## 機能要件

- **FR-281-01**: 空DBに `migrations/` を順次適用し、`schema.sql` 適用結果と `pg_dump --schema-only` を正規化diffするCIジョブを追加する。**前提（REQ-282 C-1 実測）**: 現状 from-scratch 再適用は 20240101000001 で失敗するため、まずベースライン3本を「実際の初期スキーマ（後発列を参照しない状態）」へ是正するか、baseline 方式へ移行する必要がある。この是正は本番 `schema_migrations` 履歴を壊さない形で行うこと（新規環境向けbaselineの別立て等）。
- **FR-281-02**: 週次で最新バックアップを一時DBへ復元しスキーマ/主要テーブル件数を検証するジョブと、バックアップ失敗/0件時の通知（GitHub Issue自動起票 or メール）を追加する。`backup.yml` の setup-cli をピン留めする。
- **FR-281-03**: private リポでも動く代替（`osv-scanner` / `trivy fs` / Semgrep OSS）を導入し、本番依存 high+ を段階的に hard-fail 化する。
- **FR-281-04**: 問題Eの小粒項目を順次消化する。
- **FR-281-05（即時）**: `.env.example` に不足キーを用途コメント付きで追記する。

## 受入基準

- **AC-01**: migrations 順次適用ジョブが緑で、schema.sql とのdiffが0（または既知差分の許容リスト管理）。
- **AC-02**: バックアップ検証ジョブが復元成功を毎週報告し、secrets欠落時に fail する。
- **AC-03**: `.env.example` だけで新環境のサインアップ（Turnstile込み）が構築できる。
