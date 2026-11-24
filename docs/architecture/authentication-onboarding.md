# 初回案内と回答の引き継ぎ

基点：`6070714870e5`。現行動作の正本は [紹介の入口](../current/introduction.md) と [auth](../current/auth.md)。

## 同じ4画面を2つの入口から使う

[OnboardingFlow](../../src/components/onboarding/OnboardingFlow.tsx) の `TOTAL_STEPS = 4` が画面数を決める。
順序は「地域 → 目撃経験 → 地図の読み方 → 地図を見る／投稿する」。回答に応じた説明と初期表示範囲を用意する。
模式図は実際の調査地図と区別し、点が無いことを「生息していない」「未調査」と断定しない。
最終図のピン色は [SPECIES](../../src/lib/constants.ts) から取り、実地図と異なる凡例を作らない。

| 起動元 | 判定と閉じ方 |
| --- | --- |
| [OnboardingGate](../../src/components/onboarding/OnboardingGate.tsx) | ログイン中で回答行が無い人にrequired modeを出す。認証画面・管理画面は除外 |
| [IntroPrompt](../../src/components/ui/IntroPrompt.tsx)／メニュー | optional mode。読了・この訪問だけ延期・恒久opt-outを区別し、メニューから読み直せる |

GateはProvidersで判定する。未ログイン時には子を破棄し、会員の「あとで」を別ログインへ持ち越さない。
[useOnboardingStatus](../../src/hooks/useOnboardingStatus.ts) は利用者ごとの `user_onboarding` を読み、8秒でタイムアウトする。
古い利用者の応答は反映せず、取得失敗を完了扱いにしない。取得失敗でアプリ全体を塞ぐこともしない。

## 必須・延期・保存の境界

登録から30分以内の会員は新規登録の流れとして扱い、既存会員は最初から「あとで」で閉じられる。
判定は [isFreshSignup](../../src/lib/onboarding/index.ts)。登録時刻が不明・不正なら既存会員側に倒す。
「あとで」は回答行を作らない。次のログインなどで、未完了として再び案内できる。
保存に2回失敗した場合は新規会員でも「あとで」を出す。保存失敗を利用不能の理由にしないため。

requiredの完了は [completeOnboarding](../../src/lib/onboarding/complete.ts) がAuthで本人IDを取り直し、回答を `user_onboarding` にupsertする。
10秒の保存待ち上限があり、失敗はUIへ戻して押した操作側で再試行する。成功後に利用者ID付き完了イベントを配信する。
公開プロフィールに地域回答を置かない理由は [privacy](../current/privacy.md#公開プロフィール) に記録されている。
optionalでは選んだ地域だけを端末のlocalStorageへ保存する。目撃経験は説明の分岐に使い、プロフィールへ保存しない。

2〜4画面目では回答を保ったまま戻れる。保存中は戻る・閉じる・二重保存を止め、フォーカスを見出しに保つ。
最終画面の「地図を見る」は保存してから移動する。optionalの1画面目の同操作は回答を保存せず地図へ進む。
本画面は内部の `step` stateで遷移する。[onboarding/index](../../src/lib/onboarding/index.ts) の `stepFor` は5つの論理状態を返すが、現行UIの画面数には使われていない。

## 全ページからの起動と地図への復帰

[useIntroStory](../../src/hooks/useIntroStory.ts) は条件を満たす未ログイン訪問で5秒後に小さな誘いを出す。
誘い・メニューは [introStorage](../../src/lib/introStorage.ts) に起動要求だけを送り、[OnboardingHost](../../src/components/ui/OnboardingHost.tsx) が本体を遅延読込する。
ホストをProvidersに1つ置く理由は、全ページで読み直せることと、ホーム初期chunkの予算を守ること。
別階層の紹介・登録・インストールバナーは購読ストアの参照カウントで重なりを調整する。bodyスクロール固定とは別のカウンタ。
requiredが開くとoptionalを閉じ、必須案内を優先する。

「地図」はホームへ、「投稿」はホームの投稿開始へ意図を渡す。別ページからはsessionのフラグとイベントを中継する。
未ログインの場合は先に登録モーダルへ進む。案内だけが別の投稿フォームを実装することはない。
`useOnboardingMapBounds` が会員回答または端末の地域を地図範囲に変え、取得中に県全域へ先回りしてfitすることを避ける。
不正な保存値・未回答は県全域へ戻す。地域の範囲は定数を共有する。

## 変更と確認

画面数・順番はOnboardingFlow、地域選択肢と範囲はlib/onboardingとconstants、会員の保存と取得はcomplete／status hookを変える。
起動条件・opt-out・重なりはuseIntroStoryとintroStorage、別ページからの復帰はHost／Gate／HomePageを一緒に見る。
[Flowテスト](../../src/components/onboarding/__tests__/OnboardingFlow.test.tsx)、[Gateテスト](../../src/components/onboarding/__tests__/OnboardingGate.test.tsx)、[statusテスト](../../src/hooks/__tests__/useOnboardingStatus.test.ts) が分岐の入口。
[アクセシビリティ](../../src/components/onboarding/__tests__/OnboardingFlow.a11y.test.tsx) と [図のコントラスト](../../src/components/onboarding/__tests__/figure-contrast.test.ts) は画面の意味と操作を保つ検査。
画面変更後は古い6画面のREQや5状態のhelperを現行仕様と取り違えず、[紹介の正本](../current/introduction.md) を同期する。
