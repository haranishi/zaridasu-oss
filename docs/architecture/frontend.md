# 画面と状態を組み立てる仕組み

基点：`6070714870e5`。現行コードを読むための案内。配置規約の正本は [構造・命名規約](../project-structure-conventions.md)。

## 最初の表示まで

1. [ルートlayout](../../src/app/layout.tsx) がフォント、CSS、既定metadata、構造化データ、全画面の枠を作る。
2. [Providers](../../src/app/providers.tsx) がエラー境界、テーマ、トースト、認証、初回案内、地図設定を重ねる。
3. 各 `app/**/page.tsx` がURL・サーバー取得・metadataを受け持ち、[views](../../src/views/) のページ本体へ渡す。
4. ページ本体が機能別componentsとhooksを組み合わせ、保存・取得は共有処理やSupabaseへ渡す。

この分離に沿って、URLの扱いは `app`、ページの操作はviewから読む。新規コードの置き場所は規約で決める。
ただし [種ページ](../../src/app/species/[species]/page.tsx) と [配布ページ](../../src/app/dataset/page.tsx) にはサーバー取得とUIが同居する。
[HomeShell](../../src/app/(home)/HomeShell.tsx) はRSC境界として残っている。全ラッパーを不要とみなす整理はしない。

## URLごとの役割

| URL | 主な責任・詳しい案内 |
| --- | --- |
| `/` | 参加企画・公開記録・本人の状況をまとめる [HomeHub](../../src/components/features/home/HomeHub.tsx)。[ホームの仕様](../current/home.md) |
| `/map` | 地図・写真・投稿開始をまとめる [HomePage](../../src/views/HomePage.tsx)。[地図と投稿](map-posts.md) |
| `/guide` | 記録ガイド（記録方法・まだ足りない記録・FAQ）。[HomeGuide](../../src/components/features/home/HomeGuide.tsx) |
| `/post/[id]` | 公開または本人が読める投稿のサーバー初期値と操作。[投稿詳細](map-posts-detail.md) |
| `/requests`、`/request/[id]` | 調査を依頼し、協力意思や投稿結果を返す。[調査依頼UI](participation-surveys.md) |
| `/dashboard`、`/collection`、`/ranking`、`/trends` | 個人の進行、図鑑、貢献比較、公開集計。[参加を支えるUI](participation.md) |
| `/profile`、`/profile/[userId]` | 自分の管理画面への誘導と、公開プロフィール。[プロフィール](participation-profile.md) |
| `/auth/callback`、`/u/unsubscribe` | 認証手続き・配信停止。[認証](authentication.md)・[通知設定](participation-profile.md) |
| `/lp`、`/about`、`/species/*`、`/area/*`、`/dataset` | 紹介、参照資料、検索着地、配布。[公開ページとSEO](localization-ui-seo.md) |
| `/terms`、`/privacy` | 法務・個人情報の説明。本文は静的なServer Componentで、Footerはclient island |
| `/admin/*` | 審査と運営。[管理画面](frontend-admin.md) |
| `/offline`、未存在URL | 通信不能時の案内と404。[オフライン](offline.md) |

## 状態の置き場所

| 状態 | 置き場所と意味 |
| --- | --- |
| 利用者・管理者表示・ログアウト | [AuthContext](../../src/context/AuthContext.tsx)。セッション変更を全画面へ届ける |
| テーマ | [ThemeContext](../../src/context/ThemeContext.tsx)。`html.dark` と端末設定を同期する |
| トースト | [ToastContext](../../src/context/ToastContext.tsx) と [useToast](../../src/hooks/useToast.ts)。消える操作結果を一か所に表示する |
| 地図の背景・ヒートマップ | [MapSettingsContext](../../src/context/MapSettingsContext.tsx)。現在の選択と保存済み既定値を区別する |
| ページの取得・入力 | `hooks/posts`、`hooks/survey`、`hooks/admin` と各viewのstate。用途と寿命をページに寄せる |
| 紹介の起動・重なり | [introStorage](../../src/lib/introStorage.ts) の購読ストア。[初回案内](authentication-onboarding.md) |

全データを単一のクライアントストアへ複写する構成ではない。認証と表示設定を共有し、取得結果とモーダルは各領域が持つ。
読み取り結果を表示するstateと、DBで決まる権限・審査・XPは別物。[データ](data-model.md) と [認可](authorization.md) を参照する。

## ナビゲーションと障害の境界

[Header](../../src/components/layout/Header.tsx) はアプリの操作、[DrawerMenu](../../src/components/layout/DrawerMenu.tsx) は設定・補助導線を受け持つ。
[BottomNav](../../src/components/layout/BottomNav.tsx) と [HeaderDesktopNav](../../src/components/layout/HeaderDesktopNav.tsx) は同じタップ判定を使う。
画面幅1024px以上ではホームの左ナビまたは他画面の水平ナビ、それ未満では下部ナビを使い、認証導線を揃える。
[PageHeader](../../src/components/layout/PageHeader.tsx) は下層ページ、[PageHeaderShell](../../src/components/layout/PageHeaderShell.tsx) は静的な見た目を分担する。
[PageBottomNav](../../src/components/layout/PageBottomNav.tsx) はServer Componentから操作コールバックを橋渡しし、本文末尾の逃げ幅も用意する。

[RootMain](../../src/components/layout/RootMain.tsx) は通常ページに本文ランドマークを1つ置く。自前の本文を持つ `/lp` と `/dataset` は包まない。
[ErrorBoundary](../../src/components/ui/ErrorBoundary.tsx) は描画例外、viewのerror stateは取得失敗を扱う。失敗を「0件」に置き換えない。
地図には局所境界があり、地図が壊れても写真やフィルタを使える。[app/error](../../src/app/error.tsx) は古いchunkの回復を扱う。
[global-error](../../src/app/global-error.tsx) はlayout自体の最後の受け皿で、Provider・i18n・Tailwindに依存しない。
Providersの起動表示はrAFに加えてタイマーでも解除する。背景タブでrAFが止まっても画面を塞ぎ続けないため。
SW更新時は初回制御の取得と本当の更新を区別し、入力済みフォームがあれば自動再読込を避ける。[運用](operations-ci.md)

## 変更と検証の入口

URLやSSRの変更は `app`、操作はview、再利用UIはcomponents、共有計算はlibを確認する。
大きい既存ファイルの分割候補コメントは将来の候補で、分割済みという意味ではない。
[Providersテスト](../../src/app/__tests__/providers.test.tsx)、[HomePageテスト](../../src/views/__tests__/HomePage.test.tsx)、[エラー回復テスト](../../src/app/__tests__/error.test.tsx) が起動と境界の入口。
画面文言・アクセシビリティ・素材の契約は [UI共通処理](localization-ui.md)、領域ごとの既存テストは各ページを参照する。
機能を変えるときは [現行仕様](../current/README.md) を更新し、変更要件・承認は [cc-sdd運用](../../.kiro/README.md) に従う。
