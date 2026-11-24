# REQ-247: 中核ロジックのテスト整備・巨大コンポーネント分割・デッドコード整理

## 背景
コード品質監査により、本コードベースは全体として高品質（strict TS・集中管理された定数・全階層のエラーバウンダリ・memo 化された Context・dynamic import の徹底）であることが確認された。その上で、**最も複雑で副作用の多いユーザー経路にテストが無く**、管理画面がフック層を迂回した巨大コンポーネントになっており、少数のデッドコードが残っている。いずれも品質の「土台」に関わる保守性の課題で、放置すると回帰検知力とコードの見通しが落ちる。

## 現状の問題
（ファイルパス:行番号つき）

### 1.（High）`usePostForm.ts` が 536 行の「神フック」かつ無テスト
- `src/hooks/usePostForm.ts`（536 行・最大のフック）は 15+ モジュールを束ね、ファイル種別/サイズ検証・画像処理・ブラー検知・AI 圧縮・EXIF 除去・スパム窓チェック・オフラインキュー・音声アップロード・SHA-256 ハッシュ・A/B 実験・アナリティクス・zod 検証・送信を統括し、約 11 個の `useState`（`:36-48`）を持つ。**テストファイルが無い**（`src/hooks/__tests__/` に `usePostForm.test.ts` 不在）。
- 投稿作成（オフライン含む）＝最も複雑・副作用過多・ユーザー直結の経路が**回帰保護ゼロ**。

### 2.（High）フックのテスト網羅が薄い（8/30）
- テスト済みは 30 フック中 8 のみ。ロジックを持つ無テストフック: `usePostForm` / `useStats` / `useAdminStats` / `useAdminKpi` / `useReverseGeocode` / `usePushSubscription` / `useSurveyRequests`/`Responses`/`Comments`。
- ロジックを持つ無テスト lib: `src/lib/offlineStore.ts`（216 行の IndexedDB 層）・`src/lib/achievement.ts`（バッジしきい値/解放検知）・`src/lib/imageProcessor.ts`。
- ※ `achievement.ts` は本監査後のゲーミフィケーション拡張（REQ-248〜251）でも中核になるため、先にテストを固めておく価値が高い。

### 3.（Medium）管理画面がフック層を迂回した神コンポーネント
- `src/views/admin/AdminPostsPage.tsx`（812 行）は **21 個の `useState`**（`:38-57`）と **11 の inline `supabase.*` 呼び出し**（取得・削除・一括承認・ストレージ整理）を表示ロジックと混在させている。**12 のビューファイルが `supabase` を直接呼ぶ**（`src/views/admin/*` 全部＋`DetailPage`/`SurveyRequestPage`）一方、ユーザー向けは 20 のカスタムフック（`useProfile`/`usePostList`/`useStats`…）でデータアクセスを抽象化している。＝**admin 境界で 2 つの矛盾したデータアクセス規約**が併存。
- 21 個の独立 `useState` は desync ハザード（`posts`/`total`/`pendingCount`/`selectedIds`＋6 個の一括フラグを手動同期）。inline フェッチは admin ロジックをテスト不能にする。

### 4.（Medium）デッドコード・重複
- ゼロ参照の孤児ファイル: `src/utils/cn.ts`（classname ヘルパ・未 import）・`src/utils/municipalityLabel.ts`（未 import）・`src/hooks/useExperiment.ts`（`src/lib/experiments/index.ts` の `getMyExperimentVariants` に**置換され重複**。後者は `usePostForm.ts:25` で使用中）。
- `src/hooks/useSurveySites.ts`（未 import。定点サイト機能のフックだが UI 未配線＝**デッド or 途中まで実装**。対応する `SURVEY_SITE_*` 定数 `constants.ts:273-277` も休眠）。→ 削除 or 配線を決める（構造化調査＝REQ-174／ゲーミフィケーションの定点観察アンロック＝REQ-249 の計画と併せて判断）。
- 重複ボイラープレート: `src/hooks/useAdminStats.ts:89-122` と `useAdminKpi.ts:124-146` が同型（`Promise.allSettled` → `as PromiseSettledResult` キャスト → 汎用 `pick<T>()`）。

### 5.（Low）一貫性・小改善
- `src/components/features/posts/PostCard.tsx` はリストアイテムなのに `memo()` 化されていない（`MapView`/`MapGalleryPager` は memo 済み。一過性・低優先）。
- `src/components/features/dashboard/CSVExportSection.tsx:19` が `alert('CSVのエクスポートに失敗しました。')`＝**ネイティブ `alert` ＋ハードコード日本語**で、アプリの `useToast`（11 ファイルで使用）と 4 言語 i18n の両規約を破る。
- `src/views/LandingPage.tsx`（760 行・17 個のインラインサブコンポーネント）＝純表示だが分割余地（低優先）。

## 目的
最も価値の高い無テスト経路（投稿作成・オフライン・achievement）にテストを入れ、管理画面をフック層に揃え、デッドコードを除去して、コードベースの回帰保護力と見通しを底上げする。

## 要件

### 機能要件
- [ ] FR-247-01: `usePostForm` を凝集したサブフックに分割する（例: `usePhotoPipeline` / `useAudioAttach` / `useSpamGuard`）。純粋ロジック（検証・スパム窓・ハッシュ・オフライン投入/孤立ロールバック）を切り出して単体テスト可能にする。
- [ ] FR-247-02: 優先度の高い無テスト対象にテストを追加する: `usePostForm`（分割後の純粋部）・`offlineStore.ts`・`achievement.ts`・`imageProcessor.ts`、および `useStats`/`useAdminStats`/`useAdminKpi` の集計整形ロジック。
- [ ] FR-247-03: 管理データアクセスをフック化する（`useAdminPosts()` ほか、既存フックパターンに準拠）。`AdminPostsPage` の 21 `useState` を reducer もしくは小さな状態オブジェクトへ集約し、inline `supabase.*` をフックへ移す。
- [ ] FR-247-04: `useAdminStats`/`useAdminKpi` の重複を `settleAll<T>(queries)`（型付き・失敗時 null）ユーティリティに抽出し、一度だけ単体テストする。
- [ ] FR-247-05: デッドコードを整理する: `cn.ts`・`municipalityLabel.ts`・`useExperiment.ts` を削除。`useSurveySites.ts`（＋`SURVEY_SITE_*` 定数）は「配線 or 削除」を REQ-174/REQ-249 の方針と合わせて決定・実行する。
- [ ] FR-247-06: `CSVExportSection.tsx:19` の `alert()` を `toast.error(t('...'))` に置換し 4 言語キーを追加。`PostCard` は必要に応じて `memo()` 化、`LandingPage` はセクション分割（低優先・任意）。

### 非機能要件
- [ ] NFR-247-01: 分割・フック化は外部挙動を変えない（リファクタ）。`type-check`/`lint`/`test`/`build`/`i18n:check` がすべて green。
- [ ] NFR-247-02: 追加テストは既存の vitest 構成（jsdom / fake-indexeddb / testing-library）に準拠し、CI（`test`）で常時実行される。
- [ ] NFR-247-03: REQ-246（`Database` 型配線）と協調し、`settleAll` 等の抽出でキャストを型で置き換える。

## 受入条件
- [ ] AC-01: `usePostForm` の純粋ロジックがサブフック/関数に分離され、`usePostForm`（純粋部）・`offlineStore`・`achievement`・`imageProcessor` にテストが存在し green。
- [ ] AC-02: フックのテスト網羅が 8/30 から実質的に向上し、投稿作成・オフラインの中核ロジックに回帰テストがある。
- [ ] AC-03: 管理画面がフック経由でデータアクセスし、`AdminPostsPage` の `useState` 数と inline `supabase.*` 呼び出しが有意に減る。
- [ ] AC-04: `cn.ts`/`municipalityLabel.ts`/`useExperiment.ts` が削除され、`useSurveySites` の扱いが決定・実行済み。ビルドと参照解決に問題が無い。
- [ ] AC-05: `CSVExportSection` がネイティブ `alert` を使わず、トースト＋4 言語 i18n になっている。

## 影響範囲
- `src/hooks/usePostForm.ts`（分割）・`src/hooks/__tests__/*`（新規テスト）・`src/lib/{offlineStore,achievement,imageProcessor}.ts`（テスト）
- `src/views/admin/AdminPostsPage.tsx` ほか admin ビュー・新規 `useAdminPosts` 等フック・`settleAll` ユーティリティ
- 削除: `src/utils/cn.ts`・`src/utils/municipalityLabel.ts`・`src/hooks/useExperiment.ts`（＋判断次第で `useSurveySites.ts`／`SURVEY_SITE_*`）
- `src/components/features/dashboard/CSVExportSection.tsx`・`src/locales/*/translation.json`（4 言語）・`src/components/features/posts/PostCard.tsx`・`src/views/LandingPage.tsx`
- 関連 REQ: REQ-209（品質クリーンアップ）、REQ-185（オフラインキュー）、REQ-246（型配線）、REQ-174/REQ-249（定点サイト機能の去就）、REQ-248〜251（achievement テストが土台）。

## 優先度
- **緊急度**: Medium / **重要度**: Medium〜High
- **理由**: セキュリティ欠陥ではないが、最重要ユーザー経路（投稿作成・オフライン）の回帰保護ゼロは、今後の機能追加（本監査の修正群・ゲーミフィケーション）で事故を誘発する。管理画面の二重規約とデッドコードは保守コストを恒常的に押し上げる。段階的に着手でき、achievement のテスト固めは REQ-248〜251 の前提としても価値が高い。
