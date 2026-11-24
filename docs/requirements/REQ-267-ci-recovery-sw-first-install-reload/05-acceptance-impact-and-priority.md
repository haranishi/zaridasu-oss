## 受入条件

- [ ] AC-01: 新規ブラウザプロファイルでの初回訪問時に自動リロードが発生しない（手元確認: DevTools > Application で SW が activated になった後も Network にドキュメント再取得が現れない／`navigation` エントリが1件のまま）。
- [ ] AC-02: SW更新時のリロードは維持される（手元確認: ページを開いたまま `public/sw.js` のキャッシュバージョンを変えて再ビルド・リロード配信 → 新版 activate 後に1回だけ自動リロード）。
- [ ] AC-03: `npx playwright test tests/e2e/error-boundary.spec.ts` が連続5回すべて成功する（フレーク再発なしの確認）。
- [ ] AC-04: `npm run e2e` がローカルで全件緑（33テスト、未実行なし）。
- [ ] AC-05: `npm test`（627テスト）・`npm run build` がローカルで緑のまま。
- [ ] AC-06: push 後の GitHub Actions（feat/security-hardening）で edge-functions / test / rls-tests / e2e を含む全ジョブが success になる（deploy / dependency-review 等の条件付き skipped は可）。

## 影響範囲

**変更対象ファイル:**

| ファイル | 変更内容 |
|---|---|
| `src/app/providers.tsx` | SW登録ブロック（61-77行）の controllerchange ガード追加のみ |
| `tests/e2e/error-boundary.spec.ts` | アサーションのロケータ化 |

**push対象（既存コミット・変更なし）:** `c2704e7`（`supabase/functions/deno.lock`, `vitest.setup.ts`）、`77fdf65`（`supabase/tests/rls_posts.sql`, `supabase/tests/rate_limit_public_endpoints.sql`, `supabase/tests/grant_hardening_internal_tables.sql`）

**他機能への影響:**
- SW更新配信（REQ-100）: NFR-267-01 で従来動作を担保。初回インストール時のリロードが無くなることで、初回訪問者は「SW制御下でない初回表示」のまま閲覧を続ける（次のナビゲーションから SW 制御下になる。`clients.claim()` により fetch 制御自体は初回から有効なため、オフライン機能（REQ-018）への影響なし）。
- e2e 全33テスト: 初回リロードが消えることで他テストの潜在フレークも同時に低減する。

## 優先度

- **緊急度**: High
- **重要度**: High
- **理由**: セキュリティ強化ブランチ16コミット＋αの main マージ（＝本番反映）が CI 赤でブロックされており、放置期間が既に3日を超えている。また問題Cは全新規訪問者に発生している本番 UX 欠陥であり、CI都合のテスト緩和ではなくプロダクト修正として解消すべきもの。修正はクライアント2ファイルに閉じておりリスクは低い。
