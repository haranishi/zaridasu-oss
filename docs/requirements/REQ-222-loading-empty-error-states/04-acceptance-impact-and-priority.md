## 受入条件

- [ ] AC-01: `src/components/ui/EmptyState.tsx` が存在し、`icon`/`title`/`description?`/`action?`（**単一 CTA**）を受け取る。Storybook 相当または単体テストで、CTA 1 つの肯定形空状態が描画されることを確認できる。
- [ ] AC-02: みんなの記録（多様性/ランキング）・写真ギャラリーの空状態が `EmptyState` 経由になり、**否定形（「まだ〜ありません」）ではなく肯定形コピー＋投稿 CTA** が表示される（`RankingPage.tsx:218-222` の CTA 皆無が解消されている）。
- [ ] AC-03: 未ログイン状態で空状態の投稿 CTA を押すと、既存の投稿フロー（AuthModal/PostForm）に接続する（新規ユーザーの初回投稿導線として機能する）。
- [ ] AC-04: みんなの記録・トレンド・マイページの Loading が**コンテンツ骨格スケルトン**になり、Loading → 正常表示でレイアウトが飛ばない（主要ブロックの高さ/グリッドが一致＝CLS が目視・計測で改善）。
- [ ] AC-05: Loading 領域が `role="status"` + `aria-busy` を持ち、スクリーンリーダーで「読み込み中」が読み上げられる。Empty の装飾アイコンは `aria-hidden`。
- [ ] AC-06: 置換対象の 3 状態コピーが ja/en/ko/zh の 4 ファイルに揃い、`npm run i18n:check` が通る。対象画面（`RankingPage`/`PhotoGallery`/`SurveyRequestPage`/`AreaPageClient`/`SurveyRequestsListPage`/`ProfilePage` ほか）にハードコード日本語の空状態が残っていない。
- [ ] AC-07: `EmptyState` と既存 CTA 付き空状態（`MyPostsSection`/`AreaPageClient`/`SurveyRequestsListPage`）が同一コンポーネントに統一され、画面ごとの独自空状態マークアップが除去されている。
- [ ] AC-08: `tsc --noEmit` / lint / `next build` が成功し、`AdminPostsPage`/`AdminDashboard` 等の既存 `Skeleton` 利用・テストにリグレッションが無い。

## 影響範囲

**本 REQ が担う範囲（3 状態の体系化＋Empty のオンボーディング化＋表現の統一・i18n）:**
- 新規: `src/components/ui/EmptyState.tsx`（共通空状態コンポーネント）
- スケルトン: `src/components/ui/Skeleton.tsx`（必要なら画面固有スケルトンを追加・既存部品流用）、ルート `src/app/loading.tsx`・`src/app/dashboard/loading.tsx`・`src/app/post/[id]/loading.tsx` 等の骨格化
- 画面（Empty/Loading の置換）: `src/views/RankingPage.tsx`、`src/views/TrendsPage.tsx`、`src/views/ProfilePage.tsx`、`src/views/DashboardPage.tsx`、`src/views/SurveyRequestPage.tsx`、`src/views/SurveyRequestsListPage.tsx`、`src/components/features/posts/PhotoGallery.tsx`、`src/components/features/posts/CommentSection.tsx`、`src/components/features/dashboard/MyPostsSection.tsx`、`src/app/area/[municipality]/AreaPageClient.tsx`
- a11y: Loading 領域の `role="status"`/`aria-busy` 付与（既存 `MapViewWrapper.tsx` 方式に統一）
- ロケール: `src/locales/{ja,en,ko,zh}/translation.json`（3 状態キーの追加・直書き日本語のキー化）

**本 REQ が担わない範囲（既存 REQ との境界＝重複回避）:**
- **取得失敗（Error）の state 分離・フック `error`/再フェッチ配線**は REQ-192 が主管。本 REQ は分離後の Error を `ErrorAlert`＋再試行として**表示・統一**するだけで、フックの戻り値拡張・握りつぶし解消そのものは作らない。
- **地図の描画例外/チャンク失敗の捕捉（例外バウンダリ層）と `ErrorBoundary` の i18n** は REQ-201 が主管。本 REQ はフェッチ層の Loading/Empty 表現のみ（地図の throw は扱わない）。
- **メッセージ要素の `role`/`aria-live`（ErrorAlert・成功領域・Toast）** は REQ-195、**操作失敗トースト** は REQ-193 が主管。本 REQ は取得 3 状態が対象で、Error 表示に `ErrorAlert` を再利用する点のみ接続（`role="alert"` 実装は REQ-195 に従う）。
- **存在しない ID の真 404 化** は REQ-198。本 REQ の Empty は「取得成功かつ 0 件」のみを指し、404 相当は Empty に含めない。

**他機能への影響リスク:**
- 空状態の置換で**正常時の表示や既存テストの DOM 期待**が変わり得る（admin 系は `Skeleton` を mock 済みのため低リスクだが、空状態テキストを assert しているテストがあれば i18n キー化で文言取得経路が変わる）。置換後に `npm test` を回す。
- ルート `loading.tsx` のスケルトン化は Next.js の遷移サスペンス表示を変えるため、主要遷移（ホーム→詳細→マイページ）の体感を目視確認する。
- CTA を「投稿/AuthModal」に接続する画面（みんなの記録・ギャラリー）では、未ログイン分岐が既存の `OPEN_AUTH`/`OPEN_POST_FORM` 経路（`src/app/(home)/HomeInteractive.tsx` の dispatch）と矛盾しないこと。みんなの記録は別ルートのため、CTA はホームの投稿フローへの遷移（`router.push('/')` 等）か、軽い肯定形コピーに留める判断を実装時に行う。

## 優先度

- **緊急度**: Medium / **重要度**: High
- **理由**: 機能停止やデータ破壊は無いため緊急ではない。一方で本 REQ は (1) 市民科学 PF の核心である**初回投稿（オンボーディング）導線**を、最も機会の大きい空状態から作り直すもので、卒研の継続率・データ収集量に直結する重要度が高い。(2) スケルトン資産が存在するのに一般画面で死蔵されており、**低コストで体感速度・CLS・一貫性**を底上げできる。(3) 3 状態の統一は REQ-192/195/201 の各改修の**受け皿（共通の見た目・コピー・i18n）**になり、横断改修の重複を減らす。大規模なスケルトン総入れ替えは段階適用でよく、本 REQ は「`EmptyState` 新設＋新規ユーザー導線の空状態のオンボーディング化＋主要画面のスケルトン化」を確実に締めることを主眼とする。
