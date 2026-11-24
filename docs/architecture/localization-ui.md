# 言語・テーマ・共通UIと素材

基点：`6070714870e5`。画面の構成は [frontend](frontend.md)、公開ページのmetadataは [SEO](localization-ui-seo.md)。

## SSRと保存済み言語を両立する

[i18n](../../src/lib/i18n.ts) は日本語辞書だけを同期で組み込み、SSRと最初のclient renderを日本語で揃える。
英語・中国語・韓国語は言語変更時に固定のdynamic importから読み、辞書が揃ってから言語変更を通知する。
[Providers](../../src/app/providers.tsx) のマウント後に端末の保存値・ブラウザ言語を検出する。検出をhydrationより先に動かさない。
検出待ち中に本人が言語を選んだ場合は、その操作を優先する。変更時は `html.lang` も同期する。
保存不能・辞書取得失敗でのフォールバックはi18n側が持つ。任意のimportパスを利用者入力から作らない。

辞書は [ja](../../src/locales/ja/translation.json)・[en](../../src/locales/en/translation.json)・[zh](../../src/locales/zh/translation.json)・[ko](../../src/locales/ko/translation.json)。
言語選択の入口は [DrawerMenu](../../src/components/layout/DrawerMenu.tsx)。日付のdate-fns localeは [dateLocales](../../src/lib/dateLocales.ts) を共有する。
DB値の種・情報種別と表示ラベルは分ける。翻訳後の文字列を保存用enumとして使わない。
地域ページ・配布説明・法務本文・一部管理UIなどには日本語固定の記述もある。4辞書の存在を全ページ完全翻訳の保証と扱わない。
新しい文言は4言語へ同じキーを追加し、`npm run i18n:check` で整合を確認する。[構造規約](../project-structure-conventions.md)

## 色とレイアウトの出どころ

[ThemeContext](../../src/context/ThemeContext.tsx) は初回lightで揃え、マウント後に保存済みthemeまたはOSのdark設定を読み、`html.dark` を切り替える。
[globals.css](../../src/app/globals.css) が明暗のsurface・文字・状態色・ブランド色と、Leafletの共通CSSを持つ。
Tailwind既定色は検証済みのhexへ固定してある。バージョン更新で色とコントラストが変わることを避ける判断がコメントに残る。
[themeClasses](../../src/lib/themeClasses.ts) はカード・見出し・補助文字などを意味のあるtokenへ結び付ける。
`faint` は白やページ背景用で、色付き面では `muted` 以上を使う。背景を含めてコントラストを確認するための制約。
種の色は [constants](../../src/lib/constants.ts)、成功・警告・エラーの色は状態token、主要ボタンはaccentを使い分ける。

[formStyles](../../src/lib/formStyles.ts) は入力、主要・副・削除・再試行ボタンの共通形を決める。
スマートフォンの入力は16px基準で、iOSの自動拡大を避ける。再試行も44pxの操作域を持つ。
[layout](../../src/lib/layout.ts) の `PAGE_CONTAINER` はヘッダー・パンくず・本文の左端と幅、下部ナビの逃げ幅を共有する。
ノッチ・ホームバーの余白は `safe-area-inset-*`、全高は `dvh` を使う箇所がある。desktopのナビ変更とspacerの境界を揃える。

## 操作と状態を伝える部品

| 部品・hook | 責任 |
| --- | --- |
| [useFocusTrap](../../src/hooks/useFocusTrap.ts) | dialog内のTab循環、内容切替時の再設定、閉じた後の元要素への復帰 |
| [useEscapeKey](../../src/hooks/useEscapeKey.ts) | Escapeを利用者操作として呼び出し元へ返す。保存中・必須時の拒否は呼び出し側が決める |
| [useBodyScrollLock](../../src/hooks/useBodyScrollLock.ts) | body固定と位置復帰。複数dialogの最後が閉じたときだけ解放する |
| [LoadingScreen](../../src/components/ui/LoadingScreen.tsx)・[Skeleton](../../src/components/ui/Skeleton.tsx) | 起動中と部分取得中の表示を分ける。読み込み表示と取得結果を混同しない |
| [EmptyState](../../src/components/ui/EmptyState.tsx)・[ErrorAlert](../../src/components/ui/ErrorAlert.tsx) | 空の結果と失敗を別に説明し、次の行動・再試行を置けるようにする |
| [Toast](../../src/components/ui/Toast.tsx)・[useToast](../../src/hooks/useToast.ts) | 操作結果を一時表示し、閉じる操作と読み上げを提供する |
| [LoadingButton](../../src/components/ui/LoadingButton.tsx)・[UnlockTeaser](../../src/components/ui/UnlockTeaser.tsx) | 処理中と解放前を、消失や色だけにせず説明する |
| [Breadcrumb](../../src/components/ui/Breadcrumb.tsx)・[HowToSection](../../src/components/ui/HowToSection.tsx) | ページの位置と手順の補助。業務データの更新を持たない |

これらのhookの存在は全dialogの適用保証ではない。PhotoViewerなど独自の操作処理もあり、対象画面とテストを照合する。
エラーの詳細は [errorHandler](../../src/lib/errorHandler.ts) で表示と記録を分ける。可視の失敗と例外報告の両方が必要な箇所がある。[運用](operations-ci.md)
動きはCSS・count-up・3Dのそれぞれでreduced-motionを扱う。decorativeな演出を止めても数値・本文・主操作を残す。
色だけで状態や種を区別せず、形・アイコン・ラベルを重ねる。これが全画面の適合認証を意味するわけではない。

## 端末への追加と素材

[InstallBanner](../../src/components/ui/InstallBanner.tsx) はPWA追加の案内、[SignupBanner](../../src/components/features/auth/SignupBanner.tsx) は会員登録の案内。
紹介表示中の抑制、訪問中の延期、恒久opt-outを区別する。[初回案内](authentication-onboarding.md)
[manifest](../../src/app/manifest.ts) はアプリ名・起動URL・standalone表示・アイコン・ショートカットをブラウザへ渡す。
SWの実行とキャッシュは [オフライン](offline.md)、Push許可は [通知設定](participation-profile.md) の責任。

| 素材 | 使う意味 |
| --- | --- |
| [public](../../public/) の `favicon.ico`、`icon-*`、`apple-touch-icon.png` | ブラウザ・PWA・iOS・通知の識別。SVGに加えPNGを用意する |
| [BrandMark](../../src/components/layout/BrandMark.tsx)、`logo-horizontal.svg`、`mascot*.svg` | ロゴと説明・空状態に使う識別素材 |
| [public/images](../../public/images/) | 種の画像、Leafletの固定マーカー、初回案内の模式図 |
| [public/lp](../../public/lp/)、`og-image*.png` | LPヒーローとSNS共有カード。投稿者の写真とは別の公開素材 |
| `map-tile-placeholder.png` | ホームの先行表示用のぼかした下敷き。実際のLeaflet地図を置き換えるデータではない |
| [CrayfishIllustration](../../src/components/ui/CrayfishIllustration.tsx)・[weatherIcons](../../src/lib/weatherIcons.tsx) | SVGやアイコンをコードで描き、色や状態と合わせる |

## 変更と確認

共通色はCSSとstyle helper、翻訳は辞書とi18n、操作制御はhookと対象dialogを変更する。
[i18n SSRテスト](../../src/lib/__tests__/i18n.ssr.test.ts)、[Providers言語テスト](../../src/app/__tests__/providers.i18n.test.tsx)、[コントラスト](../../src/lib/__tests__/contrast.test.ts)、[フォーカス](../../src/hooks/__tests__/useFocusTrap.test.tsx) が入口。
[メニューa11y](../../src/components/layout/__tests__/DrawerMenu.a11y.test.tsx)、[インストール案内](../../src/components/ui/__tests__/InstallBanner.a11y.test.tsx)、[初回案内](../../src/components/onboarding/__tests__/OnboardingFlow.a11y.test.tsx) も参照する。
見た目や操作を変えた場合は、静的検査に加え狭い画面・キーボード・保存中・reduced-motionで実表示を確かめる。[検証](validation.md)
