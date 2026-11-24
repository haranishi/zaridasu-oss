# REQ-051: 主要ユーザーフローの E2E テスト（Playwright）導入

## これは何か

Playwright によるスモーク E2E を **4 本だけ**導入し、主要フローの回帰を CI で止める要件。
本文は全文を下の部品ファイルへ逐語で移動してある（この入口の要約部分のみ新規記述）。

## 目的・背景の要約

ホーム／投稿／管理承認／エラー境界の各フローは Server Components・Client Components・Supabase RLS・Middleware を跨いで協調して動くが、**統合挙動を確認するテストが一切存在しない**。個別のユニット／結合テストが通っても「地図ピンを押してもモーダルが開かない」「admin 承認後も公開ページが 404 のまま」といった**クロスレイヤー回帰は検知できない**。実際 `playwright.config.*` も `tests/` も `cypress.config.*` も存在せず、既存 Vitest は純粋関数のみを対象にしている。

## 主要な決定事項の要点

- **守りたい不変条件は 4 つ（INV-01〜04）** — 匿名でのホーム地図ピン→詳細表示、一般ユーザーの投稿が `pending` で保存、admin 承認後に匿名で `/post/<id>` が閲覧可能、chunk load error 時に `error.tsx` の日本語画面と再試行ボタン。
- **フレームワークは `@playwright/test`（Chromium）**。`@axe-core/playwright` は REQ-031 系のアクセシビリティ検証と兼用できる。
- **Next.js は本番モードで起動する**（`npm run build && npm start -- --port 3100`）。dev の HMR による flake を避けるため。
- ローカル Supabase を `supabase start` で立て、`supabase/seed/e2e_seed.sql` でテストユーザー 2 名と approved 投稿 1 件を seed する。認証は `storageState` を事前生成して各テストで再利用。
- **カバレッジ指標は line/statement ではなく「フロー覆域」** — 表示／投稿／承認／障害時フォールバックの 4 シナリオが pass すること。REQ-036 / REQ-034 / REQ-035 の結合部分を間接的にスモークする。
- **受入条件にネガティブ検証を含める** — RLS ポリシーを `USING (false)` に、`error.tsx` の文言を空に、投稿 submit を no-op にすると、それぞれ対応する TC が RED になること。
- CI では **`retries: 0` で 3 回連続グリーン**（flaky 無し）を要求する。
- **既存アプリコードは変更なし**。追加は `tests/e2e/` 一式・`playwright.config.ts`・seed SQL・devDependencies・CI ジョブのみ。
- 優先度は**緊急度 中〜高／重要度 Critical**。投入コストは大きいが、4 フローに絞ることで回帰価値あたりのコストを最小化する。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-background-and-environment.md](REQ-051-test-e2e-core-flows/01-background-and-environment.md) | 背景、守りたい不変条件 INV-01〜04、現状の検出可否（不在の裏取り）、テスト種別とセットアップ・配置先 |
| [02-test-cases.md](REQ-051-test-e2e-core-flows/02-test-cases.md) | テストケース TC-01〜04 の Given/When/Then（セレクタ・座標・route interception の具体） |
| [03-coverage-fixtures-acceptance.md](REQ-051-test-e2e-core-flows/03-coverage-fixtures-acceptance.md) | カバレッジ目標、テストデータ / フィクスチャ（seed・storageState・ヘルパー）、受入条件 AC-01〜03 |
| [04-impact-and-priority.md](REQ-051-test-e2e-core-flows/04-impact-and-priority.md) | 影響範囲（新規ディレクトリ・ファイル・依存・CI）と優先度の判断理由 |
