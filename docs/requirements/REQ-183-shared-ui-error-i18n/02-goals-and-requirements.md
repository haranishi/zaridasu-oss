## 目的
4 言語対応アプリの「土台」である共有 UI・フック層・エラーメッセージ生成基盤を `t()` 経由に統一し、en/ko/zh 選択時にこれらの文字列・aria-label・日付/数値表示が当該言語で出力されるようにする。あわせて、全言語一様欠落キーや生日本語リテラルを CI で検出できる仕組みを整え、パリティチェックの死角を塞ぐ。

## 要件
### 機能要件

#### エラー基盤（layer: エラー生成）
- [ ] FR-183-01: `src/utils/errorHandler.ts` の `getErrorMessage()` を、**完成メッセージ文字列ではなく i18n キー（または安定したエラーコード）を返す** 設計に変更する。表示側（コンポーネント/フック）で `t()` してから描画する。返却型は最低限「i18n キー文字列」または `{ key: string; params?: Record<string, unknown> }` とし、`P0001`（DB レートリミット）のようにサーバ由来メッセージをそのまま出す分岐は別扱い（生メッセージ or 専用キー）にできるようにする。
- [ ] FR-183-02: 上記キーに対応する翻訳（汎用エラー / ネットワーク / 認証切れ / 権限 / 404 / レート制限 / 既定フォールバックの 7 区分相当）を `errors.*`（新規ネームスペース）または既存命名に沿った形で ja/en/ko/zh に追加する。`logError()` の挙動・外部レポーター連携は変更しない。

#### フック層（layer: hooks）
- [ ] FR-183-03: `src/hooks/usePostForm.ts` の `setError`/バリデーション文言（62,66,104,106,217,222,229,243,250,255,260,288,364,368,414 行）を、`useTranslation()` を導入して `t()` 化する（フックは React Hooks のため `useTranslation` 呼び出し可）。`formatTimeUntil`（217 行）の「N時間N分」など補間を含む文言は `t(key, { hours, minutes })` 形式にする。
- [ ] FR-183-04: `src/hooks/useOfflineQueue.ts:108`・`src/hooks/useSurveyRequests.ts:100,104,107`・`src/hooks/useSurveyResponses.ts:100` が `throw new Error('<日本語>')` / `errorMessage: '<日本語>'` している箇所を、**i18n キー（またはエラーコード）を投げ／保持し、表示側で `t()` する** 方針に統一する。フック内で `t()` 化できる場合は直接翻訳済み文字列にしてもよいが、いずれの方式でも en/ko/zh で日本語が出ないことを満たす。
- [ ] FR-183-05: `src/app/(home)/HomeInteractive.tsx:102` の `const { t: _t } = useTranslation()` を有効化（`t` として使用）し、330/335/345/349/352 行の `'写真ギャラリーを開く'`/`'写真'`/`'地図に戻る'`/`'地図'`/`'スワイプで切替'` を `t()` 化する。

#### レイアウト（layer: layout）
- [ ] FR-183-06: `src/components/layout/BottomNav.tsx` に `useTranslation` を導入し、`TABS` の `label`（16-20 行）と aria-label `'投稿する'`（82 行）・`'投稿'`（88 行）を `t()` 化する。`label` をデータ定義に持つ現構造は、`labelKey` を持たせて描画時に `t(tab.labelKey)` する形に変更する（`DrawerMenu` の `MAP_LAYERS.labelKey` パターンに倣う）。
- [ ] FR-183-07: `src/components/layout/Header.tsx` の `PAGE_TITLES`（11-19 行）と既定値（34 行）を `t()` 化する。パスごとのタイトルは `nav.*` 等の既存キー（`nav.trends`/`nav.dashboard` 等）を再利用できる場合は再利用し、無いタイトル（`使い方`/`利用規約`/`プライバシー`）は `nav.about`/`nav.terms`/`nav.privacy` 既存キーへ対応付ける。
- [ ] FR-183-08: `src/components/layout/DrawerMenu.tsx` の 56,60,132,144,162,189,195,206 行の日本語リテラル（設定メニュー / メニュー / マップ設定 / ヒートマップ / 地図の種類 / 調査依頼を立てる×2 / 調査依頼一覧）を `t()` 化する。

#### UI 部品（layer: ui components）
- [ ] FR-183-09: `src/components/ui/Toast.tsx`（41,62 行）, `src/components/features/posts/PostForm.tsx`（313,469,471 行）, `src/components/features/posts/PhotoGallery.tsx`（44,54 行）, `src/components/ui/InstallBanner.tsx`（53,55,61-63,76,79,159,165,174,180,184,189,194 行）, `src/components/features/home/PriorityAreaNudge.tsx`（20,23,26,34 行）, `src/components/modals/SurveyRequestForm.tsx`（12 行）の日本語リテラル・aria-label を `t()` 化し、各文字列に対応するキーを 4 言語へ追加する。`Toast.tsx`・`InstallBanner.tsx`・`PriorityAreaNudge.tsx`・`PhotoGallery.tsx` は `useTranslation` 未 import のため import を追加する。
- [ ] FR-183-10: `src/components/features/posts/LikeShareSection.tsx:96` の X 共有テキスト（`${species?.label}の${infoType?.label}情報（秋田県…）`）を `t()` ベースの補間テンプレートに置き換え、種別/情報種別は FR-183-12 の既存キー（`species.*`/`infoType.*`）を用いる。

#### constants ラベルの t() 化（layer: constants 既存キー活用）
- [ ] FR-183-11: `src/lib/constants.ts:78-79`（SPECIES.label）・`91-95`（INFO_TYPES.label）を直接表示している画面（`PendingPostsSection.tsx:85`, `MyPostsSection.tsx:132`, `PhotoGallery.tsx`, `LikeShareSection.tsx:96` 等）で、表示を **既存の `t('species.<value>')` / `t('infoType.<value>')`** へ置き換える。`constants.ts` の `label` フィールド自体は SEO/OG など他用途で参照されている可能性があるため削除は必須とせず、「画面表示は t() を使う」ことを満たす（label の存続可否は実装時に参照箇所を確認して判断）。

#### 日付・数値フォーマット（layer: date/number）
- [ ] FR-183-12: `src/components/features/dashboard/PendingPostsSection.tsx:105`（`toLocaleString('ja-JP', …)`）・`src/views/ProfilePage.tsx:308`（`toLocaleDateString('ja-JP')`）のロケール固定を `i18n.language` 連動（例: `toLocaleString(i18n.language, …)` / `toLocaleDateString(i18n.language)`）に変更する。
- [ ] FR-183-13: `src/views/SurveyRequestPage.tsx:22,194,237` の `date-fns` `ja` ロケール直 import / 直指定を撤去し、`src/lib/dateLocales.ts` の `getDateLocale(i18n.language)` を `format(..., { locale: getDateLocale(i18n.language) })` の形で使用する。

#### 全言語一様欠落キー（layer: missing key）
- [ ] FR-183-14: `auth.errors.invalidEmail` を ja/en/ko/zh の 4 言語の `auth.errors` セクションに追加し、`src/components/modals/AuthModal.tsx:337` の `t('auth.errors.invalidEmail', { defaultValue: '…' })` から **`defaultValue` 引数を撤去**する（キー解決を保証し、フォールバックでの日本語露出を無くす）。

#### 再発防止 lint（layer: lint / CI、オプション）
- [ ] FR-183-15（オプション）: `src/` 配下の JSX テキストノード・`aria-label`・`throw new Error('…')`・`setError('…')` に **生の日本語（CJK 文字）リテラル**が含まれる場合に警告/失敗する lint ルールまたは独立スクリプトを追加し、CI（`i18n:check` 隣接）で実行する。`constants.ts` の翻訳元データ等、意図的に日本語を持つファイルは allowlist で除外する。本 FR は他 FR 完了後の回帰防止が目的で、段階導入（warn → error）を許容する。

### 非機能要件（該当する場合のみ）
- [ ] NFR-183-01: `npm run i18n:check`（`scripts/check-i18n-parity.ts`）が新規追加キーを含め 4 言語で差分ゼロ・exit 0 となること。
- [ ] NFR-183-02: `getErrorMessage()` の戻り値型変更に伴う呼び出し側（`usePostForm.ts`・`useOfflineQueue.ts` 等）の型整合を保ち、`next build` / `tsc` が型エラーなく通ること。
- [ ] NFR-183-03: 既存の挙動（表示順・✓/× アイコン・GTM イベント・エラーログ・外部レポーター転送・レートリミット同期ロジック）を変更しないこと（文言・ロケールのみ変更）。
