# 紹介と初回利用の入口

紹介ページと地図上の案内は、すでに実装がある。紹介を変えるときは、どの入口と利用者を対象にするかを先に決める。
このページは2026-10-19時点のコードと現行仕様を照合した案内。実行検証の記録は各変更の検証結果を参照する。

## 入口ごとに役割を分ける

| 入口 | 現在の役割 | 正本の実装 |
|---|---|---|
| `/lp` | 外部から訪れた人へ価値・使い方を伝え、登録・ログイン・地図へ進める | `src/views/LandingPage.tsx`、`src/app/lp/page.tsx` |
| `/about` | サービス概要・使い方・種類・FAQなどを参照する | `src/views/AboutPage.tsx` |
| `/` のホーム | 参加企画・記録・本人の状況を見渡し、地図や投稿へ進める | [ホームの仕様](home.md) |
| `/map` の未ログイン利用 | 条件を満たすと5秒後に小さな案内を出し、任意のオンボーディングへ進める | `src/hooks/useIntroStory.ts`、`src/components/ui/IntroPrompt.tsx` |
| メニューの紹介項目 | 案内を読み直す。過去のopt-out後も利用できる | `src/components/layout/DrawerMenu.tsx` |
| ログイン中の未完了者 | 登録時期・保存状態に応じたオンボーディングを出す | `src/components/onboarding/OnboardingGate.tsx` |

ホームから地図 `/map` へ進める。初回の案内と認証は既存の仕組みを共有する。
LPの改善とホームの入口変更を、同じ「紹介」の依頼から推測して同時に実装しない。

## 現在の案内は4画面

地域 → 目撃経験 → 地図の読み方 → 地図または投稿、の順。
正本は `src/components/onboarding/OnboardingFlow.tsx`。画面数の定義は同ファイルの `TOTAL_STEPS`。
任意モードと会員向けの保存・離脱条件は [auth.md](auth.md#オンボーディング) を参照する。

案内の開始元は要求だけを送り、本体は共通ホストで開く。これはメニューなどからホームの配信容量を増やさないため。
正本は `src/lib/introStorage.ts` と `src/components/ui/OnboardingHost.tsx`。
別ページで案内を開いても、「地図」は `/map` へ、「投稿」は `/map?post=1` から認証・投稿開始へ引き継ぐ。

## 変更時に引き継ぐ契約

- 誘いの辞退・恒久opt-out・読み直しの経路を保つ。保存先の扱いは [privacy.md](privacy.md) も確認する。
- 認証の入口は既存の `AuthModal` を使い、LPからの登録導線・計測を引き継ぐ。
- LPのcanonical・共有画像・構造化データと、公開実績を取得できないときの表示を引き継ぐ。
- 図の点が無いことを、生息していないことや未調査の確証として説明しない。

## 過去の要件と現行仕様

| 要件 | 現在読むときの位置づけ |
|---|---|
| [REQ-176](../requirements/REQ-176-marketing-landing-page.md) | `/lp` の紹介・獲得導線。ヒーローを含む |
| [REQ-284](../requirements/REQ-284-intro-story-modal-and-permanent-optout.md) | 紹介ストーリーとopt-outの初期要件。本文の6画面を現行画面数として使わない |
| [REQ-325](../requirements/REQ-325-signup-onboarding-duolingo.md) | 紹介を回答型へ作り替えたときの要件。本文の画面数・概要の保存先には後続変更がある |
| [REQ-326](../requirements/REQ-326-onboarding-skip-for-existing-members.md)・[REQ-327](../requirements/REQ-327-onboarding-marker-truth-and-four-steps.md)・[REQ-328](../requirements/REQ-328-onboarding-wayfinding.md) | 既存会員の離脱、4画面化、回答修正・地図への引き継ぎなどの後続変更 |

過去の全受け入れ条件の完了状況は、この案内の追加だけで判定しない。改修対象の条件と実装・検証を個別に照合する。
