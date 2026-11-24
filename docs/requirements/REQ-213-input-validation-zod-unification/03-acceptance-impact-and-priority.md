## 受入条件

- [ ] AC-01: `src/lib/validation/schemas.ts`（または分割モジュール）に、投稿・通報・コメント・調査依頼・調査依頼コメント・定点サイト・プロフィールの各入力 zod スキーマが**許可リスト方式**で定義され、長さ上限・列挙値・座標範囲が DB CHECK 制約（`supabase/schema.sql` / 関連 migration）と一致している。
- [ ] AC-02: `useSurveyRequests` の `reason` 上限が **300**（DB と一致）に修正され、301〜500 字の入力が**クライアント側で**弾かれる（従来は DB の `23514` まで到達していた）。検証ドリフトが解消されている。
- [ ] AC-03: 従来検証が欠落していた経路（`useSurveySites` の name/notes/座標、`useProfile` の display_name/bio、`ReportModal` の reason 列挙、`CommentSection` の content 長、`useOfflineQueue` の同期前検証）で、不正値が**insert/update 前に**スキーマで弾かれ、i18n 化されたエラーが表示される。
- [ ] AC-04: 各書き込み経路は insert/update 直前に対応スキーマの `safeParse` を通す。スキーマを通過した正常値は従来どおり成功し、アプリの投稿・通報・コメント・依頼・プロフィール編集が回帰しない。
- [ ] AC-05: `src/lib/validation/schemas.ts` 冒頭に、(a) クライアント zod はバイパス可能な「第一の網」、(b) ザリダスは Server Actions を持たないため zod はサーバー関所ではない、(c) 最終的な信頼境界は DB（CHECK/RLS/トリガー）である、という多層防御の役割分担が明記されている。
- [ ] AC-06: zod の検証失敗が i18n キーで返り、`ja/en/ko/zh` の `translation.json` に対応キーが存在する。
- [ ] AC-07: 共有スキーマの境界値テスト（NFR-213-03）と検証ドリフト検知（NFR-213-04）が CI（vitest）でグリーン。`lint` / `test` / `schema:check` が通る。
- [ ] AC-08: `npm run size`（perf-budget）が全バジェット内でパスする。zod が読み取り主体ルートのトップレベルバンドルに混入していない（書き込みパス限定 or 動的 import）。

## 影響範囲

**新規ファイル:**
- `src/lib/validation/schemas.ts`（共有 zod スキーマ。必要なら `schemas/post.ts` 等に分割）
- `src/lib/validation/__tests__/schemas.test.ts`（境界値・ドリフト検知テスト）

**変更対象ファイル:**
- `package.json`（`zod` 追加。`size-limit` 設定は据え置き or 調整）
- `src/lib/postValidation.ts`（`validatePost` を zod へ委譲 or 置換）
- `src/lib/constants.ts`（未定数の上限値＝`display_name`/`bio`/`survey_site.name` 等を追加）
- 書き込み経路: `src/hooks/usePostForm.ts`・`src/hooks/useOfflineQueue.ts`・`src/components/modals/ReportModal.tsx`・`src/components/features/posts/CommentSection.tsx`・`src/hooks/useSurveyRequests.ts`・`src/hooks/useSurveyRequestComments.ts`・`src/hooks/useSurveySites.ts`・`src/hooks/useProfile.ts`（必要に応じ `src/views/admin/AdminPostsPage.tsx` 等の管理 update）
- `src/locales/{ja,en,ko,zh}/translation.json`（検証エラーの i18n キー）
- `src/app/api/og/route.tsx`（任意。`sanitizeOgParams` を寄せる場合のみ。フォールバック挙動を維持）

**変更しないもの（最終防御の正本）:**
- `supabase/schema.sql` / `supabase/migrations/` の CHECK 制約・RLS・トリガー（REQ-133 / REQ-179 / REQ-208）と `supabase/tests/` の pgTAP（NFR-213-05）。
- `src/lib/validation/password.ts`（REQ-152 で確立済みの単一ソース。原則現状維持）。

**他機能への影響:**
- 書き込みフォームの UX が向上（DB エラー到達前に分かりやすく弾く）。読み取り経路には影響しない。
- バンドルサイズに zod 分の増加。NFR-213-01 / AC-08 で perf-budget 内に管理。

## 優先度
- **緊急度**: Low〜Medium / **重要度**: Medium
- **理由**: 現状でも DB の CHECK 制約・RLS が最終防御として機能しており、不正値や権限昇格は DB で拒否されるため**緊急の脆弱性ではない**（多層防御が効いている）。一方で、(1) reason 500 vs 300 のような**検証ドリフト**、(2) `useSurveySites`/`useProfile` 等での**クライアント検証の完全欠落**による UX 不良（DB エラーの直接露出）、(3) 型と検証の二重管理、(4) 「クライアント検証＝防御」という誤認リスク、は中期的な保守性・堅牢性の負債である。zod 1 ライブラリの導入と共有スキーマ化で、Obsidian `03/10_Web_App_Security` の「許可リスト方式・サーバー寄り検証・フロントは補助」という原則に沿った一元的な入力検証基盤を、低コストかつ DB 防御を壊さずに整備できる。
