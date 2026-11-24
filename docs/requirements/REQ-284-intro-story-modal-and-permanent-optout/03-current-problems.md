## 2. 現状の問題（ファイルパス:行番号つき）

### A. アプリ内に「なぜ作ったか」を伝える画面が無い

- `/about`（`src/views/AboutPage.tsx`）は **サービス概要（:80-88）／使い方4ステップ（:91-110）／種類図鑑（:113-）／外来生物法／環境省リンク（:212-214）** で構成されるが、**開発動機・背景ストーリーのセクションが無い**。
- 背景に相当する文章は `/lp`（`src/views/LandingPage.tsx:51` `LpProblem`「いま、秋田の水辺で起きていること」）と `docs/philosophy/background.md` にあるが、**`/lp` はアプリ内のどこからもリンクされていない**（`grep 'href="/lp"'` のヒット0。参照は `src/app/sitemap.ts:31` と `src/components/layout/RootMain.tsx:27` の分岐のみ）。これは REQ-176 FR-176-12 / REQ-206 FR-206-08 が「任意・未実装」として残している課題そのものである。
- アプリ内のヘルプ導線は `src/components/layout/DrawerMenu.tsx:237-246` の `/about` **1本のみ**（＋`src/components/layout/Footer.tsx:21`）。

### B. オンボーディング（初回だけ出す案内）の仕組みが存在しない

- `onboarding` / `tutorial` / `walkthrough` / `firstVisit` / `hasSeen` などの実装は**皆無**。
- 最も近い先例は `src/components/features/dashboard/UnlockCelebration.tsx` と `src/lib/achievement.ts` で、**「記録が無い初回はベースラインを作るだけで演出しない」**（`achievement.ts:56-57`）、**localStorage 不可環境では try/catch でフェイルソフト**（`achievement.ts:44-47, 83-85`）、**`prefersReducedMotion()` 尊重**（`achievement.ts:12-15`）という設計思想が確立している。本要件はこの思想を踏襲する。

### C. バナーが「閉じても復活する」

| コンポーネント | localStorage キー | 抑止期間 | 出現遅延 | マウント箇所 |
|---|---|---|---|---|
| `src/components/features/auth/SignupBanner.tsx` | `signup_banner_dismissed_at`（:8） | **24時間**（:9） | 3秒（:10） | `src/views/HomePage.tsx:328-333`（未ログイン時のみ） |
| `src/components/ui/InstallBanner.tsx` | `install_banner_dismissed_at`（:16） | **7日**（:17） | 15秒（:18） | `src/app/providers.tsx:115`（全ページ共通） |

- どちらも `handleDismiss()` が `localStorage.setItem(KEY, String(Date.now()))` を書くだけの**期限付きスヌーズ**で、**恒久的な opt-out は存在しない**（`SignupBanner.tsx:38-42` / `InstallBanner.tsx:142-146`）。
- 恒久 opt-out のフラグを持てる場所も無い。`user_profiles` の列は `is_public` と `notify_*` 8本のみで（`src/types/database.types.ts:299-352`）、**初回フラグ・表示設定に使える列が無い**。さらに**匿名ユーザーには行そのものが無い**。

### D. その他、本要件に影響する既存の状態

- **localStorage キーの命名が3系統に分裂**している。素のスネークケース（`signup_banner_dismissed_at`）／`zaridasu_` プレフィックス（`zaridasu_lang`, `zaridasu_map_layer`, `zaridasu_seen_badges_*`）／`zaridasu:` コロン区切り（`zaridasu:push:denied`）。新規は**多数派の `zaridasu_` プレフィックス**に寄せる。
- `src/components/ui/HowToSection.tsx`（137行・使い方3ステップのアコーディオン）は **production から import 0 件のデッドコード**。参照は `src/views/__tests__/HomePage.test.tsx:53` の `vi.mock` のみ。i18n キー `howTo.*` は4言語とも生きている。
- `/about` のセクションに **`id` 属性が無い**ため、「使い方だけを見せる」ディープリンクができない。
- `DrawerMenu` は `role="dialog" aria-modal="true"`（:66-68）と `useEscapeKey`（:49）はあるが **focus trap が無い**。`Header.tsx:63` が `document.body.style.overflow` を直接触っており、共有フック `useBodyScrollLock` を使っていない。

---
