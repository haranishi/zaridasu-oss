# 共有コード・型・エラー・計測

`src/lib` はReactの画面とは独立した処理を置く。[配置規約](../project-structure-conventions.md) に従い、新しい汎用層を一律に増やさない。
データ取得や保存にも領域固有の条件があるため、下表から担当する説明へ進む。

| モジュール | 役割と読むときの注意 |
|---|---|
| `data/posts*.ts` | 公開列・公開状態、本人の保存、管理者の操作を分ける。[投稿](posting-moderation.md) |
| `data/private-spots.ts`・`privateSpots.ts` | 本人だけの地点取得・保存と地点データの扱い。[fieldwork](fieldwork.md) |
| `post/*`・`postValidation.ts`・`validation/schemas.ts` | 入力項目・検証・連投防止。DB側の制約も必要。[投稿UI](map-posts.md) |
| `validation/password.ts`・`auth/google.ts` | パスワード条件とGoogle認証の入口。[認証](authentication.md) |
| `onboarding/*`・`introStorage.ts` | 初回案内の状態・完了と端末の既読情報。[認証](authentication.md) |
| `offlineStore.ts`・`offlineSend.ts` | 所有者付きの未送信記録と再送。[offline](offline.md) |
| `image/*`・`imageProcessor.ts`・`imageUtils.ts` | 画像の圧縮・ぼけ検出・Workerとの接続。[offline](offline.md) |
| `audio/*`・`uploadAudio.ts` | 録音の権限・無音・WebM時間の補正・アップロード。[投稿UI](map-posts.md) |
| `hash/sha256.ts`・`normalizeAIResult.ts`・`aiAdvice.ts` | 添付のハッシュ、AI結果の互換処理と助言。[AI](notifications-ai.md) |
| `achievement.ts`・`quests.ts`・`experiments/index.ts` | 実績・クエスト・実験のUIに必要な処理。[参加機能](participation.md) |
| `geocodeCache.ts`・`reverseGeocodeMunicipality.ts` | 逆ジオコーディングとキャッシュ。[外部連携](external-services.md) |
| `area/targetArea.ts`・`maps/routeLinks.ts` | 対象地域の扱いと外部地図への経路リンク。[地図](map-posts.md) |
| `seo.ts`・`shareUtm.ts` | URL・メタデータや共有URLの組立。[共通UI](localization-ui.md) |
| `storage.ts` | Supabaseの`post-photos`に対するパス抽出・写真の削除・編集時の再処理とアップロード。[投稿詳細](map-posts-detail.md) |
| `csv.ts`・`postgrest.ts` | CSVの整形、PostgRESTへのクエリ値の扱い。呼び出し側の公開条件も読む |
| `localDate.ts`・`dateLocales.ts` | 日付文字列と表示言語。UTCと端末の日付の違いを意識する |
| `constants.ts`・`layout.ts`・`formStyles.ts`・`themeClasses.ts` | 共通値、表示の配置、フォーム・テーマのクラス |
| `settleAll.ts` | 複数の非同期処理の結果を扱う補助。利用側で失敗の扱いを確認する |
| `webgl.ts`・`weatherIcons.tsx` | 端末の描画機能の確認と天候の表示用部品 |

## エラーを表示し、必要な範囲で記録する

[errorHandler.ts](../../src/lib/errorHandler.ts) の `getErrorMessage` は翻訳キー・補間値・必要ならサーバーの文言を返す。
React外で翻訳済み文字列を固定せず、表示側が `resolveErrorMessage` と `t()` で解決する。
`logError` はコンソールと差し替え可能な [ErrorReporter](../../src/lib/errorReporter.ts) へ送る。
レポーターが失敗しても元の画面操作を壊さない。管理操作の [auditLog](../../src/lib/auditLog.ts) とは用途が異なる。

Sentryの初期化は [instrumentation-client](../../src/instrumentation-client.ts)、[instrumentation](../../src/instrumentation.ts)、ルートのserver・edge設定に分かれる。
[sentryScrub](../../src/lib/sentryScrub.ts) はイベントやトランザクションの個人情報を除く。
ただし `logError` はコンソールにも出すため、メール・IP・トークン・投稿本文を最初からエラーやcontextへ埋め込まない。
本番判定の実装は `NODE_ENV` 等の条件を読む。コメントだけでPreviewの送信状態を決めつけない。

## 利用状況を計測する

[analytics](../../src/lib/analytics.ts)、[lpAnalytics](../../src/lib/lpAnalytics.ts)、[acquisition](../../src/lib/acquisition.ts) がイベントや流入経路を扱う。
計測の値と研究KPIのDB集計は別の責任。[KPI運用](../runbooks/kpi-weekly-review.md) と [研究データ](data-model-research.md) を併せて読む。

## 型はDB権限の代わりにならない

[database.types.ts](../../src/types/database.types.ts) はDBのテーブル・関数の型、[post.ts](../../src/types/post.ts) は投稿領域の型を表す。
`types/index.ts` は既存の公開型、その他の `.d.ts` はGTM・Leaflet・テスト用ライブラリの型を補う。
型とスキーマの照合は [検証](validation.md)、実際に読める列や行の範囲は [認可](authorization.md) を参照する。
