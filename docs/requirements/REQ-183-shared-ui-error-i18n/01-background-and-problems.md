## 背景
ザリダスは `react-i18next` を用いて日本語 (ja)・英語 (en)・韓国語 (ko)・中国語 (zh) の 4 言語に対応している。翻訳リソースは `src/locales/{ja,en,ko,zh}/translation.json` に単一ネームスペース `translation.json` として格納され、表示文字列は原則 `useTranslation()` の `t()` 経由で出力する設計である。言語間のキー欠落を検出する CI スクリプト `scripts/check-i18n-parity.ts`（npm script: `i18n:check`）も整備されている。

しかし `check-i18n-parity.ts` は **`translation.json` のフラット化キー差分（ja をベースに en/ko/zh と比較）しか見ない**（`scripts/check-i18n-parity.ts:28-43,48-74`）。そのため次の 2 種類の漏れは構造的に検出できない:
1. JSX / TS 内に直書きされた日本語リテラル（そもそも JSON にキーが無い）
2. ja を含む **全 4 言語に一様に欠落**したキー（差分ゼロのため fail しない。例: `auth.errors.invalidEmail` を `defaultValue` 付きで参照しているが 4 言語ともキー未定義）

2026-06-12 の監査で、共有 UI コンポーネント・カスタムフック層・エラーメッセージ生成基盤に日本語ハードコードが多数残存し、en/ko/zh 選択時も日本語のまま表示されることが確認された。これらは個別ページ（REQ-184）とは別系統の「横断的に使われる土台」であり、ここが日本語固定のままだと他をいくら翻訳しても多言語体験が成立しない。

なお `infoType.{sighting,capture,trace,damage,absence}`（`translation.json` 既存）・`species.{american,bullfrog}`（同）といった t() キーは既に 4 言語整備済みであるにもかかわらず、一部の画面では `src/lib/constants.ts` の `label`（日本語固定）を直接表示しており、既存キーが活用されていない。

## 現状の問題
（ファイルパス:行番号は 2026-06-12 時点のコードで検証済み）

### A. エラーメッセージ生成基盤が日本語文字列を返す
- `src/utils/errorHandler.ts:47-83` — `getErrorMessage()` が `'予期しないエラーが発生しました。'`（48 行）/ `'通信エラーが発生しました。インターネット接続を確認してください。'`（59 行）/ `'セッションが切れました。再度ログインしてください。'`（64 行）/ `'この操作を行う権限がありません。'`（69 行）/ `'ファイルが見つかりませんでした。'`（74 行）/ `'操作が多すぎます。…'`（79 行）/ `'エラーが発生しました。もう一度お試しください。'`（82 行）など **完成した日本語文字列を直接 return** している。この関数は `usePostForm.ts:371`・`useOfflineQueue.ts` 等から呼ばれ、戻り値がそのまま UI に表示される。関数は純 TS（React 外）であり `useTranslation()` を内部で呼べないため、設計変更が必要。

### B. カスタムフック層がエラー/バリデーション文言を日本語で保持
- `src/hooks/usePostForm.ts` — `62`（対応していないファイル形式）, `66`（ファイルサイズが5MBを超えています）, `104`（解像度が低い可能性）, `106`（ブレている可能性）, `217`（`formatTimeUntil` の「N時間N分」表記）, `222`（投稿にはログインが必要です）, `229`（24時間以内の投稿上限）, `243`（地図で位置を選択してください）, `250`（位置情報が秋田県の範囲外です）, `255`（コメントは500文字以内）, `260`（個体数は…の整数で）, `288`（音声ファイルのアップロードに失敗しました）, `364`（投稿上限に達しました）, `368`（写真のアップロードに失敗…N枚中M枚成功）, `414`（下書き保存に失敗しました）。
- `src/hooks/useOfflineQueue.ts:108` — `'送信に失敗しました'` を `errorMessage` として保存（MyPostsSection / PendingPostsSection でそのまま表示）。
- `src/hooks/useSurveyRequests.ts:100`（ログインが必要です）, `104`（位置情報が秋田県の範囲外です。）, `107`（理由は500文字以内で入力してください。）— `throw new Error('<日本語>')`。
- `src/hooks/useSurveyResponses.ts:100` — `throw new Error('ログインが必要です')`。
- これらは `throw` / `setError` した文字列が `getErrorMessage` を経由せず（または経由しても）UI に出るため、フック層からは「文言」でなく「キー（またはコード）」を返す設計に変える必要がある。フックは React Hooks ルール上 `useTranslation()` を呼べる（`usePostForm` は現状未使用）。

### C. レイアウト系共有コンポーネントが日本語固定
- `src/components/layout/BottomNav.tsx:16-20`（`TABS` の `label: '地図' / '統計' / '投稿' / 'ランキング' / 'マイページ'`）, `82`（aria-label `'投稿する'`）, `88`（`'投稿'` ラベル）。`useTranslation` 未 import。
- `src/components/layout/Header.tsx:11-19`（`PAGE_TITLES` が unicode エスケープの日本語固定: `ザリダス/トレンド/ランキング/マイページ/使い方/利用規約/プライバシー`）, `34`（`pageTitle` のフォールバック `'ザリダス'`）。`useTranslation` は import 済みだが `PAGE_TITLES` には未適用。
- `src/components/layout/DrawerMenu.tsx:56`（aria-label `'設定メニュー'`）, `60`（`'メニュー'`）, `132`（`'マップ設定'`）, `144`（`'ヒートマップ'`）, `162`（`'地図の種類'`）, `189`（aria-label `'調査依頼を立てる'`）, `195`（`'調査依頼を立てる'`）, `206`（`'調査依頼一覧'`）。`useTranslation` は一部利用済み（`nav.*` 等）だが上記は未対応。

### D. ホーム画面（`HomeInteractive`）の地図/ギャラリーUIが日本語固定
- `src/app/(home)/HomeInteractive.tsx:102` — `const { t: _t } = useTranslation()` と **t が未使用化**（`_t` にリネームして lint を黙らせている）。
- 同 `330`（aria-label `'写真ギャラリーを開く'`）, `335`（`'写真'`）, `345`（aria-label `'地図に戻る'`）, `349`（`'地図'`）, `352`（`'スワイプで切替'`）が直書き。

### E. UI 部品（Toast / PostForm / PhotoGallery / InstallBanner / PriorityAreaNudge / LikeShareSection / SurveyRequestForm）
- `src/components/ui/Toast.tsx:41`（aria-label `'閉じる'`）, `62`（aria-label `'通知'`）。`useTranslation` 未 import。
- `src/components/features/posts/PostForm.tsx:313`（`'🔍 調査依頼に紐づく結果のため、種別は依頼で指定されたものに固定されます'`）, `469`（aria-label `'警告を閉じる'`）, `471`（`'閉じる'`）。
- `src/components/features/posts/PhotoGallery.tsx:44`（`'まだ写真付きの投稿がありません'`）, `54`（`'写真 {n} 件'`）。
- `src/components/ui/InstallBanner.tsx:53`（`'ホーム画面への追加方法'`）, `61-63`（iOS 手順 3 ステップの本文）, `76`（aria-label `'わかりました'`）, `79`（`'わかりました'`）, `159`（`'アプリとして使う'`）, `174`（説明文）。さらに `55,165`（aria `'閉じる'`）, `180,184,189,194`（追加方法/ホーム画面に追加/今は不要）も同様。`useTranslation` 未 import。
- `src/components/features/home/PriorityAreaNudge.tsx:20`（aria-label `'優先調査エリア'`）, `23`（`'今、観察が足りていないエリア'`）, `26`（説明文）, `34`（`'（{n}件）'`）。`useTranslation` 未 import。
- `src/components/features/posts/LikeShareSection.tsx:96` — X 共有テキスト `${species?.label ?? 'ザリガニ'}の${infoType?.label ?? ''}情報（秋田県${post.municipality ?? ''}）` が日本語固定（`constants.ts` の label 直参照を含む）。
- `src/components/modals/SurveyRequestForm.tsx:12` — `MapSkeleton` の aria-label `'地図を読み込み中'`。

### F. `constants.ts` の label 直接表示（既存 t() キーがあるのに不使用）
- `src/lib/constants.ts:78-79`（`SPECIES` の `label: 'アメリカザリガニ' / 'ウシガエル'`）, `91`（および 91-95 の `INFO_TYPES` の `label: '目撃'/'捕獲'/'痕跡'/'農業被害'/'不在確認'`）。
- これらを直接表示している画面: `PendingPostsSection.tsx:85`（`{it?.emoji} {it?.label}`）, `MyPostsSection.tsx:132`（`{it?.emoji} {it?.label}`）, `PhotoGallery.tsx`（`SPECIES.find(...).label` 系）, `LikeShareSection.tsx:96`。一方で `species.{american,bullfrog}` / `infoType.{sighting,capture,trace,damage,absence}` キーは 4 言語整備済みであり、画面側で `t()` に切り替えるだけで多言語化できる。

### G. 日付・数値フォーマットがロケール固定
- `src/components/features/dashboard/PendingPostsSection.tsx:105` — `new Date(...).toLocaleString('ja-JP', {...})` 固定。
- `src/views/ProfilePage.tsx:308` — `new Date(post.created_at).toLocaleDateString('ja-JP')` 固定。
- `src/views/SurveyRequestPage.tsx:22,194,237` — `import { ja } from 'date-fns/locale/ja'` を直接 import し、`format(..., { locale: ja })`（194 行・237 行）で日付整形。`src/lib/dateLocales.ts` に `getDateLocale(lang)`（4 言語対応）が存在するのに未使用。

### H. 全 4 言語に一様欠落したキー（パリティチェックすり抜け）
- `src/components/modals/AuthModal.tsx:337` — `t('auth.errors.invalidEmail', { defaultValue: 'メールアドレスの形式が正しくありません' })`。`grep` で確認した通り `auth.errors.invalidEmail` は ja/en/ko/zh の **4 ファイルすべてに未定義**。ja（ベース）にも無いため `check-i18n-parity.ts` は差分ゼロで pass し、実行時は全言語で `defaultValue`（日本語）にフォールバックする。`auth.errors` サブオブジェクト自体は各言語に存在する（`auth.errors.passwordMismatch` 等）ため、キーを追加すれば解決する。
