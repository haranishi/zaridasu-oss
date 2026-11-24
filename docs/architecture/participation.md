# 継続参加を支える進捗・図鑑・集計

基点：`6070714870e5`。報酬の設計判断と係数の正本は [gamification](../current/gamification.md)。
調査の依頼は [調査依頼UI](participation-surveys.md)、本人の設定は [プロフィールと通知](participation-profile.md) を参照する。

## マイページの意味

[DashboardPage](../../src/views/DashboardPage.tsx) は認証復元を待ち、未ログインならホームへ戻す。
本人のプロフィール、貢献進行、バッジ、送信待ち、投稿履歴を並べ、全体統計とCSVは折りたたむ。
[MyPostsSection](../../src/components/features/dashboard/MyPostsSection.tsx) は本人の全審査状態を読み、却下理由・AIの品質助言・編集・削除へつなぐ。
[PendingPostsSection](../../src/components/features/dashboard/PendingPostsSection.tsx) は端末の未送信を見せ、送信・破棄を明示操作にする。[オフライン](offline.md)
メール未確認の表示は [EmailVerificationBanner](../../src/components/features/dashboard/EmailVerificationBanner.tsx)、編集・退会は [プロフィール](participation-profile.md) を参照する。

## 報酬はDBが決め、UIは説明する

承認された投稿だけがXP・コレクションの元になる。未審査・却下・いいねを報酬にしない理由は、量や人気より記録の質を保つためと正本に記録されている。
UIの投稿件数と承認済み件数は別の値。進捗を未検証の総件数だけで駆動しない。
[useProfile](../../src/hooks/useProfile.ts) 内の `useProgress`・`useCollection` が専用RPCを読み、clientから進行を書き換えない。
[ProgressJourney](../../src/components/features/dashboard/ProgressJourney.tsx) が2つを各1回取得して、子へ注入する。進捗カードごとの重複取得を避ける。

| 部品 | 利用者に伝えること |
| --- | --- |
| [ProgressCard](../../src/components/features/dashboard/ProgressCard.tsx) | 現在レベル、XP、次の境界までの距離。数値はDBの進行を使う |
| [NextStepCard](../../src/components/features/dashboard/NextStepCard.tsx) | 次の解放と図鑑の充足率。承認観察の積み重ねを行動につなぐ |
| [WeeklyQuests](../../src/components/features/dashboard/WeeklyQuests.tsx) | 情報種別・地域・不在・測位や調査努力を記録する任意の提案 |
| [UnlockCelebration](../../src/components/features/dashboard/UnlockCelebration.tsx) | 前回から増えたレベル・解放・種を控えめに知らせる。表示履歴は報酬の所有データではない |
| [BadgeSection](../../src/components/features/dashboard/BadgeSection.tsx) | バッジ獲得と次の到達点を説明する表示部品 |

[quests](../../src/lib/quests.ts) は承認済みコレクションから質・多様性を導出する純粋な計算。
コレクションに情報が無いGPS・定点・水辺・努力量は達成を断定せず自由提案にする。
クエストは追加XPを付けず、未達の罰・失うストリークを持たない。この判断もコード内に明記されている。
名前にWeeklyとあっても、計算は既存の累積コレクションを入力にする。新しい週次報酬テーブルがあるという意味ではない。

## 段階解放と図鑑

[FEATURE_UNLOCKS](../../src/lib/constants.ts) が解放レベルと表示名、client／serverの扱いを持つ。
[useUnlocks](../../src/hooks/useUnlocks.ts) は渡されたレベルを読む純粋な判定で、取得や権限変更をしない。
レベル不明と未登録機能は開放する。匿名利用や取得中の表示を奪わず、中核の観察・投稿を進行条件にしないため。
既知のレベルではヒートマップ・詳細フィルタ・CSV・外見などの任意機能に予告を出す。
clientの解放判定を本人データや課金の認可に流用しない。コレクションはDB側の規則も読む。[データ](data-model.md)

[CollectionPage](../../src/views/CollectionPage.tsx) が進行と種ごとのコレクションを読み、[CollectionDex](../../src/components/features/collection/CollectionDex.tsx)・[SpeciesDexCard](../../src/components/features/collection/SpeciesDexCard.tsx) に渡す。
図鑑は情報種別の充足と観察地域を見せ、[EducationalNote](../../src/components/features/collection/EducationalNote.tsx) が学習上の補足を添える。
[Aquarium](../../src/components/features/collection/Aquarium.tsx) は観察した種をSVG／CSSで表現し、容量と装飾をレベルから計算する。
個体の位置と速度はindex由来の決定値で、初回描画の乱数を使わない。
[Crayfish3DStage](../../src/components/features/collection/Crayfish3DStage.tsx) はマウント後にWebGLの可否を確認し、「3Dで見る」の操作後に本体を読む。
[Crayfish3DViewer](../../src/components/features/collection/Crayfish3DViewer.tsx) は外部モデル不要の手続き生成モデル。threeを初期chunkへ入れず、停止中は必要時だけ描画する。
動きを減らす設定では自動回転を止め、回転ボタンと代替説明を残す。

## 公開の比較と統計

[RankingPage](../../src/views/RankingPage.tsx) は多様性を既定にし、品質・投稿数のタブを分ける。件数だけを主目標にしない判断が記録されている。
`useDiversity`・`useQuality`・`useRanking` は表示中のタブだけ取得する。期間変更は件数ランキングへ渡す。
現状 `useQuality` は失敗時に空配列を返し、他2系統のerror／refetchと同等の回復APIを持たない。エラー境界を揃える改修は別の変更として扱う。
[PriorityAreaNudge](../../src/components/features/home/PriorityAreaNudge.tsx) と [usePriorityAreas](../../src/hooks/usePriorityAreas.ts) は直近の報告が少ない地域へ調査を誘う。
これは記録数の偏りからの提案で、生物がいない・調査されていないという確証ではない。

[TrendsPage](../../src/views/TrendsPage.tsx) は12か月、マイページは6か月を [useStats](../../src/hooks/useStats.ts) へ渡す。
集計RPCと本人件数を組み合わせ、5分の利用者別sessionキャッシュを表示しつつ再検証する。
[TrendsKPI](../../src/components/features/dashboard/TrendsKPI.tsx)・[KPISection](../../src/components/features/dashboard/KPISection.tsx) と [汎用チャート](../../src/components/ui/charts/) が集計を描く。
月ラベルはDBのISO月を読み、端末のタイムゾーンで前月へずらさない。初期段階の小標本は [EarlyStageNote](../../src/components/ui/EarlyStageNote.tsx) で補う。

## 変更と検証

報酬式を変えるならDBとconstantsを同期し、表示のみなら進行値の取得元を保つ。投稿削除後の再計算制約は [正本](../current/gamification.md) を参照する。
[進行hook](../../src/hooks/__tests__/useProgress.test.ts)・[解放判定](../../src/hooks/__tests__/useUnlocks.test.ts)・[クエスト](../../src/lib/__tests__/quests.test.ts) のテストが計算の入口。
[図鑑ゲート](../../src/views/__tests__/CollectionPage.gate.test.tsx)、[3D入口](../../src/components/features/collection/__tests__/Crayfish3DStage.test.tsx)、[ランキング空状態](../../src/views/__tests__/RankingPage.empty.test.tsx)、[統計画面](../../src/views/__tests__/TrendsPage.test.tsx) を照合する。
本人CSVは [CSVExportSection](../../src/components/features/dashboard/CSVExportSection.tsx)・[useCsvExport](../../src/hooks/useCsvExport.ts)。配布用 `/dataset` とは列契約が違う。[公開データ](../current/public-dataset.md)
