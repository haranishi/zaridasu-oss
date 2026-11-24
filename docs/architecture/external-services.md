# 外部連携は実行場所と送る情報から読む

以下は現行コードにある接続口の一覧。設定値の有無や本番での有効化は、コードだけでは確認できない。
認証値・プロジェクト固有URL・通知先の実値は文書へ転載せず、環境変数や設定識別子で追う。
DB構造は[データモデル](data-model.md)、権限は[認可](authorization.md)、処理本体は[Edge Functions](edge-functions.md)を参照する。

## アプリの基盤

| 連携 | 実行場所・設定識別子 | 役割と送るもの |
|---|---|---|
| Supabase Auth/PostgREST/RPC/Realtime | [client/server/anon/middleware](../../src/lib/supabase/)；`NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY` | ブラウザは本人JWTまたはanonで読み書き。SSRはCookieから利用者を検証 |
| Supabase管理クライアント | [_shared/supabaseAdmin](../../supabase/functions/_shared/supabaseAdmin.ts)；`SUPABASE_URL`・`SUPABASE_SECRET_KEY`、旧`SUPABASE_SERVICE_ROLE_KEY` | Edgeで管理処理。secretを優先し、旧service roleへフォールバック |
| Supabase Storage | 各featureの写真処理、`post-photos/post-audio`・`rare-photos/water-report-photos`等 | 公開メディアとprivate原票を分け、privateは署名URL。具体的な境界は認可ページへ |
| Vercel | [vercel.json](../../vercel.json)・[CI](../../.github/workflows/ci.yml)；`VERCEL_TOKEN/ORG_ID/PROJECT_ID` | Next本番build/deploy。Git連携自動配備は設定ファイルで無効 |
| GitHub Actions | [.github/workflows](../../.github/workflows/) | PR検査、本番反映、暗号化バックアップの起動とArtifacts |
| Cloudflare Turnstile | [AuthModal](../../src/components/modals/AuthModal.tsx)；`NEXT_PUBLIC_TURNSTILE_SITE_KEY` | 登録・認証のchallenge tokenをSupabase Authへ渡す。secret側設定はSupabase側 |

公開環境変数はブラウザから読める値として扱う。service secretを公開変数へ入れない。
Authのメール・redirect許可、DB拡張、Vault、cronはサービス側の設定も必要となる。

## 地図・地理・天気

| 連携 | 接続口 | データと制約 |
|---|---|---|
| OpenStreetMapタイル | [MAP_LAYERS](../../src/lib/constants.ts)、MapView/MiniMap等 | ブラウザが表示範囲のtileを取得。SWは別originタイルを保存しない |
| 国土地理院タイル | 同じMAP_LAYERSの淡色・標準・航空写真 | 背景切替。表示位置に応じてtileを取得し、各attributionを表示 |
| Overpass | [nearby-water route](../../src/app/api/nearby-water/route.ts) | Nextサーバーが中心・半径を送る。同一origin API、制限・cache・障害時fallbackを集約 |
| Nominatim（市町村） | [fetchMunicipality](../../src/lib/reverseGeocodeMunicipality.ts)・[useReverseGeocode](../../src/hooks/useReverseGeocode.ts) | ブラウザが選択座標を送る。500ms debounce、約100mキー・1時間/100件のメモリcache |
| 逆ジオコーディング（詳細） | [_shared/geocodeProvider](../../supabase/functions/_shared/geocodeProvider.ts)、enrich-place；`GEOCODE_PROVIDER`・`OPENCAGE_API_KEY/GEOAPIFY_API_KEY` | Edgeから座標を送る。Nominatim/OpenCage/Geoapifyを選択、`geo_cache`へ永続化 |
| OnWater | 同provider；`GEO_WATER_ENABLED`・任意の`ONWATER_API_KEY` | 有効化した場合だけ水辺判定。鍵があれば付加し、失敗時は結果なし |
| Open Topo Data | 同provider；`GEO_ELEVATION_ENABLED` | 任意の標高取得。CORS制約のためサーバー側 |
| Open-Meteo現在/履歴 | [useWeather](../../src/hooks/useWeather.ts) | 座標と観察日を送る。今日/未来は現在、過去は日次値。sessionStorage TTL5分 |
| Google/Yahoo!/Apple地図 | [routeLinks](../../src/lib/maps/routeLinks.ts)・[routeSegments](../../src/features/fieldwork/lib/routeSegments.ts) | 利用者が外部経路を開く。目的座標と固定表示名だけ。計画は4地点単位に分割 |

市町村の即時表示と、Edgeによる字・水系・標高の付与は別経路。サーバー側のthrottleがブラウザ経路も一括制御するわけではない。
Edgeの地名付与は`GEO_ENRICH_ENABLED`、期限・再試行、provider鍵、連絡先設定を使う。詳細は[Edge Functions](edge-functions.md)へ。
近傍水域のTTL cache、地名のセッションcache、DBのgeo_cache、オフライン用cacheを同じものとして扱わない。
経路を開けば目的座標は地図事業者へ渡る。非公開地点の名称・種名をURLへ足さない。

## AIと通知・外部配信

| 連携 | 設定識別子・入口 | 内容 |
|---|---|---|
| Gemini | `GEMINI_API_KEY`・`GEMINI_IMAGE_MODEL/AUDIO_MODEL`；[analyze-image](../../supabase/functions/analyze-image/index.ts)・[analyze-audio](../../supabase/functions/analyze-audio/index.ts) | Edgeが画像・音声と指示を送り、判定とtoken使用を記録。停止・上限・cacheを別途適用 |
| Resend | `RESEND_API_KEY`・`NOTIFY_FROM_EMAIL`；[_shared/mailer](../../supabase/functions/_shared/mailer.ts)とnotify-* | 宛先・本文・配信停止リンクを送る。メール種別ごとの購読条件を確認 |
| Web Push | `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT`・`NEXT_PUBLIC_VAPID_PUBLIC_KEY`；[usePushSubscription](../../src/hooks/usePushSubscription.ts)・send-push | ブラウザのendpoint/暗号鍵を保存し、Edgeが暗号化payloadをPushサービスへ送る |
| LATE系social配信口 | `LATE_API_URL/LATE_API_KEY`；[social-announce](../../supabase/functions/social-announce/index.ts) | 選んだ承認済み公開投稿を外部の投稿APIへ送る。固定事業者URLはコードから断定できない |
| X・LINE等の共有 | [LikeShareSection](../../src/components/features/posts/LikeShareSection.tsx) | 利用者が共有URLを開く。Web Share/コピーも提供。SNSへの自動投稿とは別経路 |

通知は「DBイベント/cron → Edge → メール・Push・外部配信」で進む。
`WEBHOOK_SECRET`等の内部認証、購読解除、重複・停止時の扱いは[通知・AI](notifications-ai.md)へ。
Authメール用SMTP、SPF/DKIM/DMARC、Push許可、cron有効化、AI鍵の状態はコードだけでは確定できない。

## 計測・監視は業務データの送信と分ける

[layout.tsx](../../src/app/layout.tsx)は`NEXT_PUBLIC_GTM_ID`がある場合にGTMを読む。
[analytics.ts](../../src/lib/analytics.ts)はproductionのdataLayerへ行動イベントをpushし、page_viewはGA4拡張計測へ委ねる。
共有イベントは[lpAnalytics.ts](../../src/lib/lpAnalytics.ts)、実測指標は[WebVitalsReporter](../../src/components/ui/WebVitalsReporter.tsx)から同じdataLayerへ送る。
イベントpayloadに投稿本文・メール・非公開の位置を足さない。GTM/GA4側のタグと保存設定は別途確認する。

Sentryは`NEXT_PUBLIC_SENTRY_DSN`とproduction条件で初期化する。
[client](../../src/instrumentation-client.ts)・[server](../../sentry.server.config.ts)・[edge](../../sentry.edge.config.ts)で同じ[sentryScrub](../../src/lib/sentryScrub.ts)を使う。
Cookie・ヘッダー・本文等の自動収集を停止し、メール/IP/鍵、通信breadcrumbのqueryを除去する。正規表現のスクラブを任意データの完全匿名化と解釈しない。
source map送信には`SENTRY_AUTH_TOKEN/ORG/PROJECT`を使う。previewの環境ラベルと送信条件は[運用](operations-ci.md)へ。

## 開発・保全に必要な接続口

| 連携 | 識別子と役割 |
|---|---|
| npm、Rust、Deno CDN | [package-lock](../../package-lock.json)、[Cargo.lock](../../rust/water-geometry/Cargo.lock)、[deno.lock](../../supabase/functions/deno.lock)で依存を固定 |
| Google Fonts | [layout.tsx](../../src/app/layout.tsx)の`next/font/google`でInterをbuild時に取得し、実行時は自サイトから配信 |
| Supabase Management API | `SUPABASE_ACCESS_TOKEN/PROJECT_REF`でmigrationとEdge配備状況を読み取り |
| DB dump接続 | `SUPABASE_DB_URL`からDBをバックアップ。復元は別の`TARGET_DB_URL` |
| Supabase S3互換Storage | `SUPABASE_STORAGE_S3_*`でbinaryを別取得。SQL dumpに写真実体は含まれない |
| 任意オフサイトS3 | `BACKUP_OFFSITE_S3_*`。暗号化済み成果物の保管先。実事業者や設定済みかは未確認 |
| age/gpg | `BACKUP_AGE_RECIPIENTS/BACKUP_GPG_RECIPIENTS`で公開鍵暗号。復号鍵はCIへ置かない |
| 手動の公開データ登録 | [open-data-doi](../runbooks/open-data-doi.md)のZenodo手順。アプリから自動登録する実装とは分ける |

Googleのsite verificationやGoogle Formsへの案内は[constants](../../src/lib/constants.ts)・layout由来のリンク/メタ設定で、業務APIではない。
ブラウザの位置・録音・Canvas・IndexedDB・SWは端末APIであり、それ自体が第三者サーバーへの送信処理ではない。
障害時の影響は、投稿本体を止める経路と付加情報だけ諦める経路で異なる。[検証](validation.md)と各sourceの失敗分岐まで確認する。
