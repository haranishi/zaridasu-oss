## 10. 影響範囲

### 新規

- `src/components/modals/IntroStoryModal.tsx` — ストーリー本体
- `src/components/ui/IntroPrompt.tsx` — 誘いポップアップ
- `src/hooks/useIntroStory.ts` — 表示判定・localStorage 読み書き（フェイルソフト）
- `src/lib/introStorage.ts`（任意）— キー定数とアクセサ
- **`public/images/intro/intro-0{1..6}-*.webp` — イラスト6枚（v2）**
- テスト: `src/components/modals/__tests__/IntroStoryModal.test.tsx`, `IntroStoryModal.a11y.test.tsx`, `src/components/ui/__tests__/IntroPrompt.test.tsx`, `tests/e2e/intro.spec.ts`

### 変更

- `src/components/features/auth/SignupBanner.tsx` — 恒久 opt-out 追加（:8-10, :23-26, :38-42）
- `src/components/ui/InstallBanner.tsx` — 同上（:16-18, :104, :142-146）
- `src/components/layout/DrawerMenu.tsx` — 「ザリダスってなに？」項目追加（:237 の直前）
- `src/views/HomePage.tsx` — `IntroPrompt` のマウント（:328 付近）
- `src/views/AboutPage.tsx` — 各セクションへの `id` 付与（:91, :113, :139 付近）
- `src/locales/{ja,en,zh,ko}/translation.json` — `intro.*` 追加、`about.law_info.*` / `about.species_info.*` の是正（§7）
- `src/views/__tests__/HomePage.test.tsx` — 新規マウント分のモック追加

### 他機能への影響

- **バナー表示ロジック**: FR-284-14 により表示条件が1つ増える。既存の期限付きスヌーズの挙動は変えない。
- **REQ-176 / REQ-206**: FR-176-12・FR-206-08（`/lp` 導線）が FR-284-12 で満たされる。両REQの残作業表を更新すること。
- **REQ-222**: Empty state のオンボーディング化とは**層が異なる**（あちらは画面内の空状態、本要件は初回の読み物）。文言のトーンだけ揃える。
- **CI**: `npm run i18n:check` / `npm run lint`（`--max-warnings 0`）/ `npm run type-check` / カバレッジ閾値（`vitest.config.ts:16-21` の **statements 60 / branches 47 / functions 51 / lines 63**）を通す必要がある。DB列は追加しないため `npm run schema:check` への影響は無い。
- **バンドル予算（v2 で重要）**: `.size-limit.json` の **`/ (home) page chunk (gzip)` は 10KB 上限**。`IntroPrompt` をトップに同期 import すると超える恐れがあるため、**誘いポップアップ・ストーリー本体とも `dynamic(..., { ssr:false })`** にする（`HomePage.tsx:21-25` の `AuthModal` / `SignupBanner` と同じ扱い）。画像は `public/` 配下の静的ファイルなので JS チャンクには入らない。
- **画像配信**: `next.config.ts` は `formats: ['image/avif','image/webp']`・`minimumCacheTTL` 31日、`/images/:path*` に `Cache-Control: immutable` を設定済み。`public/images/intro/` はこの設定の恩恵をそのまま受ける（追加設定は不要）。

---

## 11. 優先度

- **緊急度**: Medium
- **重要度**: High
- **理由**: 機能停止やデータ破壊は無いため緊急ではない。一方で、(1) 市民科学PFの成否は「はじめて来た人が参加者になるか」に懸かっており、入口の文脈提示は投稿開始率に直接効く。(2)「消したバナーが復活する」は既に発生している体験上の不快で、修正コストが小さいわりに印象への影響が大きい。(3) `/lp` の未リンク（REQ-176 積み残し）を同時に解消できる。(4) §7 の法令記述の誤りは**公開中の情報の正確性**に関わるため、本要件と切り離してでも早期に確認すべきである。
