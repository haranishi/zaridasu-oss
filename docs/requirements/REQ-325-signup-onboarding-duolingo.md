# REQ-325: 登録時に必須の Duolingo 型オンボーディング（紹介ストーリーの作り替え）

作成日: 2026-09-08
優先度: P1 ／ 種別: UI + DB
状態: 初期仕様の履歴 / 後継仕様あり（条件別の完了状況は未判定）
関連: REQ-284（紹介ストーリー v2・置き換え対象）、REQ-324（初期の地図表示・地域の答えを渡す）、REQ-243（位置情報プライバシー）
設計の正本: Obsidian「2026-09-08 ザリダス オンボーディング再設計（Duolingo型）要件とUX」／Figma `Ft0fLEt2u09DET9IUeSAWW`（6画面）

> 現行仕様の案内（2026-10-17）: 現在の案内は4画面で、会員向けの回答は公開プロフィールと別の表に保存する。本文の画面数・概要の「プロフィールに保存」には後続変更があるため、[紹介の現行仕様](../current/introduction.md) と [auth.md](../current/auth.md#オンボーディング) を先に確認する。以下は初期の要件記録として保持する。

## これは何か

REQ-284 の紹介ストーリー（6枚を読む）は本人評価で「とっつきにくい」。Duolingo の導入のように**質問に答えながら1分で最初の成功体験まで連れていく**5画面へ作り替える。
さらに本人決定（2026-09-08）で、**会員登録した人はこの流れを必須で通す**。答え（地域・目撃経験）は**プロフィールに保存**し、地図の初期位置と卒研（RQ1）の分析に使う。登録なしで地図を見る人には従来どおり任意で出す。

## 画面（Figma のとおり・文言は i18n 4言語）

| # | 画面 | 中身 |
|---|---|---|
| 00 | 入口シート（任意のみ） | 現行 IntroPrompt の文言をザリくんの挨拶に。［案内してもらう（1分）］／×／［今後表示しない］ |
| 01 | はじめまして | 進捗1/5・吹き出し・ザリくん大・［つづける］・（任意のみ）「地図だけ見る」 |
| 02 | 質問_地域 | 「秋田の、どのあたりに住んでる？」 秋田市／県北／県央／県南／秋田の外・わからない。**「答えはプロフィールに保存されます（地図の初期位置と研究に使います）」の1行** |
| 03 | 質問_目撃 | 「アメリカザリガニ、見たことある？」 ある／ない／たぶん |
| 04 | 事実_地図 | 「国の地図でわかるのは、町の単位まで。となりの池にいるかは、だれも知らないんだ」＋既存イラスト `intro-02` ＋出典（REQ-284 と同一文言）。03 の答えでザリくんの一言を1行変える |
| 05 | 成功_あなたの地図 | 「🎉じゅんび完了」・02 の地域に寄った地図の縮図（既存 MapView を使わず擬似でよい）・**法令カード「見つけたら、記録するだけでOK。生きものは、そのままにしておいてね」**・［投稿してみる］／［まずは見るだけ］ |

操作は Duolingo と同じ**「選ぶ → つづける」**（前へ/次へは廃止）。上部は × と進捗バー。

## 要件

### データ（新テーブル・プロフィールの列にはしない）
- **FR-325-01**: `public.user_onboarding(user_id uuid PK references auth.users on delete cascade, region text NOT NULL CHECK (region IN ('akita_city','north','central','south','other')), seen_crayfish text NOT NULL CHECK (seen_crayfish IN ('yes','no','maybe')), onboarded_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`。**`user_profiles` に列を足さない**（`public_profiles_viewable` で公開プロフィールの全列が anon から読めるため）。
- **FR-325-02**: RLS 有効。SELECT / INSERT / UPDATE は `auth.uid() = user_id` のみ。DELETE ポリシーは作らない（退会は cascade）。anon には何も許可しない。`GRANT SELECT, INSERT, UPDATE ON user_onboarding TO authenticated` / `REVOKE ALL ... FROM anon`。`set_updated_at` 系の既存トリガー関数があれば流用。
- **FR-325-03**: migration は `supabase/migrations/20260908000001_req325_user_onboarding.sql`（冪等な `IF NOT EXISTS` / `DO $$ ... duplicate_object` スタイル）。**`supabase/schema.sql` にも同じ定義を追記**（rls-tests は schema.sql から作る）。`supabase/migrations/README/05-list-2026-06-onward.md` と README の本数に1行足す。
- **FR-325-04**: `src/types/database.types.ts` に `user_onboarding` の Row/Insert/Update を手書きで足す。`region` / `seen_crayfish` は literal union にし、`scripts/check-schema-types-sync.ts` の `CHECKS` に2列を追加する（CHECK 制約と union の一致を CI で固定）。
- **FR-325-05**: `supabase/tests/rls_user_onboarding.sql`（pg-tap）：本人は INSERT/SELECT/UPDATE できる／他人の行は SELECT 0件・UPDATE 0件／anon は SELECT 拒否／CHECK 違反は失敗。`rls_posts.sql` の `_set_jwt` の作法に倣う。

### クライアント
- **FR-325-06**: `src/lib/onboarding/` に純粋ロジック：`REGIONS`（5値・表示キー）、`SEEN`（3値）、`stepFor(answers)`、`regionBounds(region)`（→ `[[lat,lng],[lat,lng]]`。`src/lib/constants.ts` に `REGION_FIT_BOUNDS` を足す。秋田市 39.55–39.85/139.95–140.35、県北 39.95–40.51/139.69–140.99、県央 39.35–39.95/139.69–140.60、県南 38.87–39.40/139.90–140.99、other→`AKITA_FIT_BOUNDS`。おおよそでよい）。
- **FR-325-07**: `useOnboardingStatus(userId)`：ログイン中なら `user_onboarding` を own-row で1回 SELECT。`{ loading, done: boolean, region }`。オフライン／失敗時は `done: true 扱いにしない`が、**画面はブロックしない**（後述 FR-325-11）。
- **FR-325-08**: `completeOnboarding({region, seen})`：upsert（`onConflict: 'user_id'`）。成功で `trackEvent('onboarding_completed', {mode, region, seen})`。
- **FR-325-09**: 任意モード（未ログイン）：現行 `useIntroStory` / `introStorage` / `IntroPrompt` の仕組みは**そのまま**（5秒後の入口シート・恒久 opt-out・DrawerMenu「ザリダスってなに？」）。開くのは新しい `OnboardingFlow`（`mode:'optional'`）。地域の答えは `localStorage 'zaridasu_onboarding_region_v1'` に保存し、地図の初期位置にだけ使う。
- **FR-325-10**: 必須モード：`providers.tsx` に `OnboardingGate` を1つ置く（IntroStoryHost と同じ位置・**dynamic import はここ1箇所**・AC-18 の 10KB 予算を守る）。`user` があり `useOnboardingStatus` が `done=false` を返したら `OnboardingFlow`（`mode:'required'`）を開く。× と「地図だけ見る」は出さない。既存会員も行が無ければ一度通る。
- **FR-325-11**: 必須モードで保存に失敗したら、その場でエラーと［もう一度］。2回失敗したら［あとで］を出して閉じてよい（次回ログイン時にまた出る）。**ネットワークの都合で利用者を閉じ込めない**。
- **FR-325-12**: 地図の初期位置：`MapView` に `initialBounds?: [[number,number],[number,number]]` を足し、`InitialFit` が受け取る（既定は `AKITA_FIT_BOUNDS`・REQ-324 の判定はそのまま）。HomePage はログイン中なら `useOnboardingStatus().region`、未ログインなら localStorage の地域から `regionBounds()` を渡す。
- **FR-325-13**: 文言はすべて i18n（ja/en/ko/zh・`npm run i18n:check` を通す）。REQ-284 の法令文と出典文は**一字も変えず**流用する（`intro.slides.5.body` / `intro.slides.2.quote*`）。
- **FR-325-14**: プライバシーポリシーの「収集する情報」に「オンボーディングで答えた地域（5区分）と目撃経験を、地図の初期位置と研究に使うために保存する」旨を4言語で1項目足す。

### 置き換え
- **FR-325-15**: `IntroStoryModal` は削除し、参照を `OnboardingFlow` に置き換える。`intro.slides.*` のうち使わないキーは残してよい（i18n:check は言語間の一致だけ見る）。既存テスト `IntroStoryModal.test.tsx` / `.a11y.test.tsx` は新コンポーネントのテストに書き換える。
- **FR-325-16**: data-testid：`onboarding`（ルート）、`onboarding-step`（現在の番号を data-step に）、`onboarding-option-<key>`、`onboarding-continue`、`onboarding-close`（任意モードのみ）、`onboarding-post`（05 の主ボタン）、`onboarding-map-only`（05 の副導線）。入口シートの `intro-prompt*` と `drawer-intro` は変えない。

## 受け入れ条件
- **AC-01**: 未ログインで `/` を開くと 5 秒後に入口シートが出て、［案内してもらう］→ 02 で地域を選ぶ → 03 → 04 → 05 →［まずは見るだけ］で閉じ、リロードで出ない（REQ-284 AC-01 と同じ仕組み）。
- **AC-02**: 未ログインで × はどの画面でも押せて閉じる。
- **AC-03**: ログイン中で `user_onboarding` の行が無いと、× の無い必須モードが出て、05 まで通すと行ができ、リロードで出ない。
- **AC-04**: 他人の `user_onboarding` は読めない・書けない（pg-tap）。
- **AC-05**: 02 で「県北」を選んだ人のトップ地図は県北に寄って開く。「秋田の外・わからない」は県全域。
- **AC-06**: `npm run type-check` / `lint` / `test` / `i18n:check` / `schema:check` が通り、`/` の page chunk が 10KB 以内（`npm run size`）。
- **AC-07**: E2E `tests/e2e/intro.spec.ts` を新しい導線に書き換えて通る（既存 38 件も通る）。必須モードの E2E は既存のログイン用フィクスチャがある場合のみ追加する（無ければユニットテストで代替し、その旨を記録）。

## やらないこと
- 会員登録の画面（AuthModal）の改修。同意は 02 の1行とプライバシーポリシーで行う。
- 05 の地図に実データを描くこと（Figma のとおり擬似の縮図でよい。実データ化は本人判断待ち）。
- クイズの正誤判定。
- 既存イラストの描き直し（`intro-02` のみ再利用。他の 5 枚は削除してよい＝バンドル外なので任意）。
