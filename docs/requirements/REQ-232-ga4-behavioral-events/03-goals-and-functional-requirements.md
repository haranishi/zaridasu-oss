## 目的

- 市民科学の**参加ファネルに沿った行動イベント体系**を設計・実装し、`page_view` 任せでは測れない「閲覧→投稿→エンゲージ→能動的依頼」の各段の転換を GA4 で可視化する。
- `lpAnalytics` の dataLayer パターンを**全画面で使える汎用イベント関数に一般化**し、production/SSR ガードと型を一元化して、各所の直書き・重複を解消する。
- 参加の核となるアクション（`post_success`・`survey_request_submit`・`sign_up`）を **キーイベント（旧 CV）として明文化**し、計測仕様書（イベント名・パラメータ・キーイベント指定・カウント方法）を本 REQ に台帳化する。
- 二重計上を作らない（`page_view` は拡張計測に任せ手動送出しない／GTM 1 経路を維持）。
- PII（位置の生値・メール・個人名）をイベントパラメータに**含めない**（REQ-233 プライバシー計測と連携）。

## 要件

### 機能要件

- [ ] FR-232-01: **汎用イベント送出ユーティリティを新設する。** `src/lib/analytics.ts`（新規）に `trackEvent(name: AnalyticsEventName, params?: Record<string, unknown>): void` を実装する。内部は現行 `lpAnalytics.ts:9-12` と同方針で「SSR ガード（`typeof window === 'undefined'` で return）→ production ガード（`NODE_ENV !== 'production'` で return）→ `window.dataLayer` 初期化 → `push({ event: name, ...params })`」とする。`lpAnalytics.pushLpEvent` は本関数の薄いラッパー（または `LpEventName` を `AnalyticsEventName` に統合）へ寄せ、`WebVitalsReporter.tsx:12-27`・`AuthModal.tsx:130,173`・`AuthCallbackPage.tsx:53-79` の直書き `dataLayer.push` も段階的に `trackEvent` 経由へ移行する（**既存イベント名・パラメータは変えない**＝GA4 側のキーイベント/レポート定義を壊さない）。`window.dataLayer` 型宣言は `src/types/gtm.d.ts` に一本化し、`WebVitalsReporter.tsx:6-10` の重複宣言を削除する。
  - 論点（実装時に判断・記録）: 公式推奨の `@next/third-parties` の `sendGAEvent`（ガイド `:128-139`）へ全面移行する案もあるが、(a) 現状 GTM 経由で dataLayer パターンが全画面に定着しており、(b) `sendGAEvent` は親に `<GoogleAnalytics>` が必要（ガイド `:139`）で GTM 経路と混ぜると二重計上リスク（ガイド `:85,181-188`）がある。本 REQ は **GTM/dataLayer 1 経路を維持**し `trackEvent` で一般化する方針を既定とし、`@next/third-parties` への移行は別 REQ（計測経路の再選定）に切り出す。

- [ ] FR-232-02: **投稿ファネルを計測する。** 以下を `trackEvent` で送出する（パラメータは PII を含まない低カーディナリティ値のみ）：
  - `post_start`: `HomeInteractive.tsx:190-193 handlePostClick` でフォームを開いた時（ログイン済みで `OPEN_POST_FORM` に進むケース）。param 例: `{ entry: 'header' | 'bottom_nav' | 'survey_link' }`。
  - `post_media_attached`: `usePostForm.ts:handleFileChange`（`:71` の有効ファイル確定後）。param 例: `{ photo_count: number, has_exif_gps: boolean }`（座標値そのものは送らない）。
  - `post_submit`: `usePostForm.ts:submitPost` の送信試行開始時（`:234 setLoading(true)` 付近、バリデーション通過後の `posts.insert` 直前が望ましい）。param 例: `{ species, info_type, has_photo: boolean, has_audio: boolean, survey_method }`。
  - `post_success`: `submitPost` の `:351 return true` 直前（insert 成功時）。param は `post_submit` と同等。**キーイベント候補（FR-232-08）**。
  - `post_fail`: 例外経路（`:352-373`）で、原因種別を `{ reason: 'rate_limit' | 'upload' | 'validation' | 'unknown' }` として送出（メッセージ文字列は送らない）。
  - `post_save_offline`: `saveOffline` 成功（`:411 return true`）時。param 例: `{ photo_count }`。

- [ ] FR-232-03: **エンゲージ（いいね/コメント/通報/AI 判定ビュー）を計測する。**
  - `like`: `useLike.ts:toggleLike` の insert 成功（`:89-90` 後）。param 例: `{ action: 'like' }`。取り消し（`:84-85` delタ後）は送らない or `{ action: 'unlike' }` で区別（実装時に決定し台帳へ）。`post_id` は GA4 上の PII ではないが**高カーディナリティのため標準では送らない**（必要なら別途カスタムディメンション化を検討、FR-232-09）。
  - `comment_post`: `CommentSection.tsx:handleSubmit` の insert 成功（`:96 setContent('')` 付近）。param 例: `{ is_admin: boolean }`。
  - `report_submit`: `ReportModal.tsx:handleSubmit` の insert 成功（`:53 setDone(true)` 直前）。param 例: `{ reason }`（`spam`/`wrong_location`/`inappropriate`/`other` の固定値、自由記述 `comment` は送らない）。
  - `ai_identify_view`: `DetailPage.tsx:358-430` の AI 判定カードが描画された時（`post.ai_result` があり、エラーでない場合）。param 例: `{ species_match: boolean, confidence_bucket: 'low' | 'mid' | 'high' }`（`:379` の confidence を 0–49/50–74/75–100 でバケット化。生 confidence は送っても可だが**バケット推奨**で高カーディナリティ回避）。

- [ ] FR-232-04: **地図操作・ギャラリー閲覧を計測する（高頻度イベントの抑制込み）。**
  - `map_interact`: `HomeInteractive.tsx:218 onBoundsChange`（地図の移動/ズーム）。**bounds 変化は連続発火するため、デバウンス（例 1〜2 秒）＋セッション内 1 回 or 一定間隔に間引く**こと（GA4 のイベント量・課金と二重計上ノイズを避ける）。param には**座標・bounds の生値を含めない**（`{ trigger: 'pan_zoom' }` 程度）。`map_filter_bounds`: `:210 onBoundsFilterToggle`（表示範囲で絞り込み ON/OFF）。
  - `gallery_view`: `MapGalleryPager` で写真パネルへ切替（`:329 setPanelIndex(1)`、スワイプ `:304`）。同一セッションでの連打は**初回のみ or 間引き**。param 例: `{ source: 'handle' | 'swipe' }`。
  - `search`（推奨イベント）: `FilterBar.tsx:79-82` の検索を**確定/デバウンス後**（`HomeInteractive.tsx:177-183` のデバウンス fetch に同期させる）に送出。GA4 推奨パラメータ `search_term` に**検索文字列を入れる**（検索語は PII ではないが、ザリダスでは地名等が入りうるため REQ-233 のプライバシー方針に従い、必要なら長さ/有無のみに縮退する判断を台帳へ）。

- [ ] FR-232-05: **調査依頼ファネルを計測する。**
  - `survey_request_start`: `HomeInteractive.tsx:201-205 onSurveyClick`（ログイン済みで `OPEN_SURVEY_FORM` に進むケース）。param 例: `{ entry: 'header' }`。
  - `survey_request_submit`: `SurveyRequestForm.tsx:handleSubmit` の `createRequest` 成功直後（`:68 onSuccess?.()` 直前）。param 例: `{ species, urgency }`（`reason` 自由記述・座標は送らない）。**キーイベント候補（FR-232-08）。GA4 推奨イベント `generate_lead` を別名併用するか、`survey_request_submit` をキーイベント化するかを台帳で決定**（ガイド `:208-209` の推奨イベント活用と、ドメイン語の分かりやすさのトレードオフ）。

- [ ] FR-232-06: **認証イベントの既存挙動を維持しつつ `trackEvent` 経由へ寄せる。** `AuthModal.tsx:130-133`（`login`）・`:173-177`（`sign_up_initiated`）・`AuthCallbackPage.tsx:53-79`（`sign_up`/`login`、created_at 判別＝REQ-033）を `trackEvent` でリファクタする。**イベント名・`method`・`from` パラメータ・新規/既存判別ロジックは一切変更しない**（REQ-033 の正確性と GA4 既存定義を保持）。本 REQ では新規の認証イベントは追加しない（REQ-033 と非重複）。

- [ ] FR-232-07: **計測仕様書（tracking plan）を本 REQ に台帳化する。** 全イベントについて「イベント名 / 発火箇所（ファイル:行）/ 主要パラメータ（型・許容値）/ PII 有無 / キーイベント指定 / カウント方法 / カスタムディメンション登録要否」を表で定義する（下記「計測仕様書」節をテンプレとする）。GA4 のカスタムパラメータは**カスタムディメンション/指標として登録しないとレポートに出ない**（ガイド `:210`）ため、レポートで使うパラメータには「要登録」を明記する。

- [ ] FR-232-08: **キーイベント（旧 CV）化を定義する。** 最低限 `post_success`・`survey_request_submit`・`sign_up` を GA4 の**キーイベントとしてマーク**する手順（管理→データの表示→キーイベント、ガイド `:203-205`）を runbook 化し、**カウント方法は「イベントごと」**（ガイド「カウント方法」節）を既定とする。キーイベント名は**確定後リネームしない**（ガイド `:201` の指定外れ事故防止）旨を注意書きとして残す。Google 広告への取り込みは将来課題として参照のみ（ガイド `:11-14`）。

- [ ] FR-232-09: **GA4 側の登録作業をリリースチェックに含める。** 追加イベントのうちレポート/探索で使うカスタムパラメータ（`species`/`info_type`/`reason`/`urgency`/`confidence_bucket`/`entry` 等）を GA4 で**カスタムディメンションとして登録**し、DebugView で発火を確認する手順をチェックリスト化する（ガイド `:210`、検証は同ガイド「④検証」節）。GTM 側で必要なら「カスタムイベントトリガー＋データレイヤー変数」を作成する（ガイド `:101-106`）。
