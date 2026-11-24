# REQ-184: 未翻訳ページ（ランキング/公開プロフィール/認証コールバック/オフライン）の i18n 対応

## 背景
ザリダスは `react-i18next` で日本語 (ja)・英語 (en)・韓国語 (ko)・中国語 (zh) の 4 言語に対応し、翻訳リソースは `src/locales/{ja,en,ko,zh}/translation.json`、言語間キー差分は `scripts/check-i18n-parity.ts`（`npm run i18n:check`）で検証している。

2026-06-12 の監査で、`src/views/` 配下の 4 ページが **ページ全体（または大部分）日本語ハードコード** のまま残っていることが確認された。うち 2 ページ（`RankingPage` / `ProfilePage`）は `useTranslation` を一切 import しておらず、`AuthCallbackPage` は一部だけ `t()` を使うが大半が日本語固定という不統一状態である。これらの文字列は JSX 直書きのため `translation.json` にキーが無く、`check-i18n-parity.ts`（キー差分のみ検査）では検出できない。

特に `AuthCallbackPage` は **メール確認リンク・パスワードリセットリンクの着地点** であり、en で登録/リセット申請したユーザーにも当該メール内リンクから到達する。recovery（新パスワード設定）・確認完了・認証エラーの各画面が日本語のままだと、英語圏ユーザーが「パスワードを更新する」「メールアドレスの確認が完了しました」等を読めず、登録/復旧フローが実害として詰まる。

> 命名方針: REQ-183 が共有 UI/フック/エラー基盤を扱うのに対し、本 REQ はページ単位の翻訳化に集中する。`RankingPage` は既存ナビ表記に合わせ `みんなの記録` 系のため、命名は機能に沿って `ranking.*`・`profilePage.*`・`authCallback.*`・`offline.*` を新規に切る（既存 `dashboard.*`/`detail.*`/`survey.*`/`species.*`/`infoType.*` と重複させず、再利用できるキー＝`species.*`/`infoType.*` 等は再利用する）。

## 現状の問題
（ファイルパス:行番号は 2026-06-12 時点のコードで検証済み）

### A. `src/views/RankingPage.tsx` — `useTranslation` import 無し・全文日本語固定
REQ-171 で再設計された「みんなの記録（発見の多様性 / 投稿数ランキング）」ページ。`useTranslation` を import しておらず、表示文字列がすべて日本語リテラル。
- `17-21`（`PERIODS` の `label: '全期間'/'今月'/'今年'`）
- `75`（Breadcrumb `'みんなの記録'`）
- `82-83`（貢献フレーミングの説明文 2 文）
- `88`（aria-label `'表示切替'`）, `98`（`'🌱 発見の多様性'`）, `109`（`'🏆 投稿数（参考）'`）
- `123`（`'あなたのコレクション'`）, `126-128`（`CoverageBar` の `label`: 情報種類（…）/カバーした市区町村/発見した種）, `131`（`'🏅 情報種類コンプリート！…'`）
- `144-145`（まだ記録がありません / 投稿が承認されると…）
- `166`（`'(あなた)'`）, `169`（`'情報種類 …/…・…地域・…種'` の補間表記）
- `185`（`'※ 投稿数は活動量の参考値です。…'`）
- `206`（`'あなたの活動量'`）, `207`（`'{n}件の報告'`）, `210`（`'{rank}位'`）
- `221`（`'まだランキングデータがありません'`）
- `247`（`'(あなた)'`）, `252`（`'件'`）

### B. `src/views/ProfilePage.tsx` — `useTranslation` import 無し・全文日本語固定（公開プロフィール）
- `39`（`'名無し調査員'` 比較リテラル）, `71`（aria-label `'閉じる'`）, `78`（`'プロフィール編集'`）, `85`（`'アイコン'`）, `104`（`'ニックネーム（20文字以内）'`）, `110`（placeholder `'名無し調査員'`）, `116`（`'自己紹介（100文字以内）'`）, `124`（`'{n}/100'` 文字数）, `129`（`'ランキングに表示する'`）, `134`（`'調査依頼の通知メールを受け取る'`）, `143`（`'保存'`）
- `181`（`SPECIES_LABEL` map: `'🦞 アメリカザリガニ'/'🐸 ウシガエル'`）, `182`（`INFO_TYPE_LABEL` map: 目撃/捕獲/痕跡/被害/不在）
- `201`・`221`（`'プロフィール'` ヘッダー）, `205`（`'プロフィールが見つかりません'`）
- `243-245`（統計 `label`: 投稿/コメント/活動圏＋`'{n}市町村'`）, `259`（`'獲得バッジ'`）, `288`（`'最近の投稿'`）
- `297`（`alt` の `'…の投稿写真'`）, `301`/`303`（`SPECIES_LABEL`/`INFO_TYPE_LABEL` 表示）, `308`（`new Date(...).toLocaleDateString('ja-JP')` ロケール固定）, `325`（`'🏆 投稿ランキングを見る'`）
- ※ `181-182` の `SPECIES_LABEL`/`INFO_TYPE_LABEL` ローカル map は、既存の `species.*`/`infoType.*` キー（4 言語整備済み・emoji は別途付与）で代替可能。

### C. `src/views/AuthCallbackPage.tsx` — t() 一部のみ使用・大半が日本語固定（実害最大）
`useTranslation` は import 済みで `t(strength.messageKey)`（97 行）・`t('auth.errors.passwordMismatch')`（101 行）・`placeholder={t('auth.passwordMinLength')}`（164 行）は翻訳済みだが、それ以外は日本語固定。
- 認証エラー処理: `32`（`'リンクの有効期限が切れています。…'`）, `34`（`'認証に失敗しました'` フォールバック）, `83`（`'認証リンクが無効か期限切れです。…'`）, `114`（`'パスワードの更新に失敗しました'`）
- error 画面: `124`（`'認証に失敗しました'`）, `132`（`'トップページへ戻る'`）, `135`（`'トップページの「ログイン」から…'`）
- recovery 画面: `148`（`'新しいパスワードの設定'`）, `150`（`'新しいパスワードを入力してください'`）, `157`（label `'新しいパスワード'`）, `175`（label `'パスワード（確認）'`）, `182`（placeholder `'もう一度入力'`）, `204`（`'更新中...'`）, `206`（`'パスワードを更新する'`）
- confirmed 画面: `220`（`'メールアドレスの確認が完了しました！'`）, `222`（`'アカウントが有効化されました。…'`）, `224`（`'3秒後にダッシュボードへ移動します...'`）, `229`（`'今すぐダッシュボードへ'`）
- loading 画面: `240`（`'認証処理中...'`）
- **a11y（label 関連付け欠落）**: recovery フォームの `<label>`（`156-158` / `174-176`）が、対応する `<input>`（`159-171` / `177-189`）と `htmlFor`/`id` で関連付けられていない。`AuthModal.tsx` 側（`auth-email` 等）は `htmlFor`/`id` 済みだが本ページは未対応。

### D. `src/views/OfflinePage.tsx` — `useTranslation` import 無し・日本語固定
- `19`（`'オフラインです'`）, `22-23`（`'インターネット接続がありません。'` / `'接続を確認してから再度お試しください。'`）, `33`（`'再接続する'`）, `41`（`'トップページへ戻る'`）

これら 4 ページの文字列は JSON にキーが無いため `check-i18n-parity.ts` の検査対象外であり、en/ko/zh ユーザーには日本語のまま表示される。

## 目的
上記 4 ページの全表示文字列を `t()` 化し、en/ko/zh で当該言語表示にする。とりわけ recovery / 認証エラーフローを含む `AuthCallbackPage` を最優先で対応し、メール経由で到達する非日本語ユーザーの登録/復旧体験を成立させる。あわせて `AuthCallbackPage` recovery フォームの label↔input 関連付け（a11y）を是正し、追加・既存キーが `i18n:check` を通過する状態にする。

## 要件
### 機能要件
- [ ] FR-184-01: `src/views/AuthCallbackPage.tsx` に既存の `t()` を全面適用し、現状の問題 C で列挙した全文字列（32,34,83,114,124,132,135,148,150,157,175,182,204,206,220,222,224,229,240 行）を `authCallback.*`（新規）へ切り出して `t()` 化する。エラー分岐（`otp_expired` 等）の文言もキー化する。**本ページを最優先で完了する**。
- [ ] FR-184-02: `src/views/AuthCallbackPage.tsx` recovery フォームの `<label>`（156-158 / 174-176 行）と各 `<input>`（159 / 177 行）を `htmlFor`/`id`（例: `authcb-password` / `authcb-password-confirm`）で関連付ける。`aria-describedby` でのエラー関連付けも可能なら付与する（`AuthModal` の `auth-email`/`auth-email-error` パターンに倣う）。
- [ ] FR-184-03: `src/views/RankingPage.tsx` に `useTranslation` を import し、現状の問題 A の全文字列（17-21,75,82-83,88,98,109,123,126-128,131,144-145,166,169,185,206,207,210,221,247,252 行）を `ranking.*`（新規）へ切り出して `t()` 化する。`PERIODS` は `value` を保持しつつ `labelKey` で描画する形にする。補間を含む表記（`情報種類 {n}/{total}・{m}地域・{s}種`、`{n}件の報告`、`{rank}位`、`{n}/{total}`）は `t(key, { ... })` 形式にする。
- [ ] FR-184-04: `src/views/ProfilePage.tsx` に `useTranslation` を import し、現状の問題 B の全文字列（39,71,78,85,104,110,116,124,129,134,143,201,205,221,243-245,259,288,297,325 行）を `profilePage.*`（新規）へ切り出して `t()` 化する。`SPECIES_LABEL`（181 行）/`INFO_TYPE_LABEL`（182 行）のローカル map は、既存 `species.*`/`infoType.*` キーを用いる形に置き換える（emoji は表示側で付与）。`'名無し調査員'`（39 行の判定・110 行の placeholder）の扱いは、表示は `t()`・既定ニックネーム判定はサーバ値との比較ロジックを壊さないよう実装時に整合させる。
- [ ] FR-184-05: `src/views/OfflinePage.tsx` に `useTranslation` を import し、19,22-23,33,41 行の文字列を `offline.*`（新規）へ切り出して `t()` 化する。
- [ ] FR-184-06: 上記 FR で切り出した全キーを `src/locales/{ja,en,ko,zh}/translation.json` に、それぞれ自然な訳語で追加する。ja は現行表示文言をそのまま採用し、en/ko/zh は既存ページ（`dashboard.*`/`detail.*` 等）のトーンに揃える。日付ロケール固定（`ProfilePage.tsx:308` の `toLocaleDateString('ja-JP')`）は `i18n.language` 連動に変更する（REQ-183 FR-183-12 と重複する場合はどちらか一方で対応すればよい）。

### 非機能要件（該当する場合のみ）
- [ ] NFR-184-01: `npm run i18n:check`（`scripts/check-i18n-parity.ts`）が新規キーを含め 4 言語で差分ゼロ・exit 0 となること。
- [ ] NFR-184-02: 各ページの既存挙動（リダイレクト、GTM `sign_up`/`login` push、recovery/confirmed/error の分岐、ランキング/多様性の集計表示、バッジ表示）を変更しないこと（文言・ロケールのみ変更）。
- [ ] NFR-184-03: `next build` / `tsc` が型エラーなく成功すること。

## 受入条件
- [ ] AC-01: 言語を en にしてメール確認リンク（`?type=signup`/`email`）から `AuthCallbackPage` に到達したとき、確認完了画面（「メールアドレスの確認が完了しました！」相当）と各ボタンが英語で表示される。
- [ ] AC-02: 言語を en にしてパスワードリセットリンク（`?type=recovery`）から到達したとき、recovery フォームの見出し・2 つの label・placeholder・送信ボタン（「パスワードを更新する」相当）が英語で表示される。
- [ ] AC-03: 認証エラー（`otp_expired` / 無効リンク）時、error 画面のメッセージ・「トップページへ戻る」相当が選択言語で表示される。
- [ ] AC-04: `AuthCallbackPage` recovery フォームで各 `<input>` がラベルと `htmlFor`/`id` で関連付けられている（label クリックで該当入力にフォーカスが移り、アクセシビリティツリー上で名前が付く）。
- [ ] AC-05: 言語を en/ko/zh にして `/ranking`（みんなの記録）を開いたとき、期間タブ・ビュー切替・コレクション/コンプリート文言・空状態・「(あなた)」「件」「N位」などがすべて当該言語で表示される（日本語が残らない）。
- [ ] AC-06: 言語を en/ko/zh にして他ユーザーの公開プロフィール（`/profile/<id>`）を開いたとき、ヘッダー・統計ラベル・バッジ見出し・最近の投稿の種別/情報種別・編集モーダルの各項目が当該言語で表示され、投稿日付が当該言語ロケールで整形される。
- [ ] AC-07: 言語を en/ko/zh にしてオフライン画面を表示したとき、見出し・本文・再接続/トップへ戻るボタンが当該言語で表示される。
- [ ] AC-08: 対象 4 ページの該当行に、画面表示用の生日本語リテラル（aria-label・alt・placeholder 含む）が残っていない。
- [ ] AC-09: `npm run i18n:check` が exit 0、`next build` が成功する。
- [ ] AC-10: 言語切替の表示確認が自動テストで担保される（E2E で `/ranking`・`/offline`・`AuthCallback` recovery 画面を en で開いて主要文言を検証、またはコンポーネントユニットで i18n インスタンスの言語を en に切り替えて主要ラベルのレンダリングを検証する）。

## 影響範囲
- ページ: `src/views/AuthCallbackPage.tsx`, `src/views/RankingPage.tsx`, `src/views/ProfilePage.tsx`, `src/views/OfflinePage.tsx`
- 翻訳リソース: `src/locales/{ja,en,ko,zh}/translation.json`（`authCallback.*`・`ranking.*`・`profilePage.*`・`offline.*` を新規追加、`species.*`/`infoType.*` は再利用）
- 既存キー再利用: `auth.passwordMinLength`, `auth.errors.passwordMismatch`, `species.*`, `infoType.*`（`ProfilePage`/`AuthCallbackPage`）
- CI: `scripts/check-i18n-parity.ts`（通過確認）
- テスト: E2E（Playwright）またはコンポーネントユニット（言語切替表示確認 / `AuthCallbackPage` の label 関連付け）

## 優先度
- **緊急度**: High / **重要度**: High / **理由**: 4 ページがまるごと（または大部分）未翻訳で、en/ko/zh ユーザーには日本語のまま表示される。とりわけ `AuthCallbackPage` はメール内リンクの着地点であり、非日本語ユーザーの新規登録（メール確認）・パスワード復旧フローが日本語表示で詰まる実害がある（離脱・サポート負荷に直結）。`RankingPage`/`ProfilePage` は REQ-171 で再設計された主要回遊ページで露出が高い。いずれも JSX 直書きのため `i18n:check` では検出されず放置されやすい。AuthCallbackPage → Ranking/Profile → Offline の順で着手すると影響が大きい順に解消できる。
