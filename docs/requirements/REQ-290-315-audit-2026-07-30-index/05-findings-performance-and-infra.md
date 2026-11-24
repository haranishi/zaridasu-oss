### 性能（13件: High 3 / Medium 6 / Low 4）

実測（既存ビルドのgzip圧縮）: /dashboard **347.1 kB** / /collection 335.1 / **/ 332.2** / /post/[id] 330.6 / /trends 305.4 / /ranking 305.3 / /lp 214.6 kB

- **Sentry ブラウザSDK 49.0 kB(gzip) が全ルートに常駐**。`/lp` は First Load JS 214.6 kB のうち共有チャンクが 120.9 kB = **56.3%**。LPにはSupabase・翻訳・leafletがいずれも入っておらず設計は正しいのに、エラー追跡SDKだけが半分以上を占める（REQ-305）
- **size-limit が実配信量の2.8%しか監視していない**。予算対象はルート固有チャンクのみで共有チャンク5本（計231 kB）は全て予算外。/dashboard と /ranking は予算エントリ自体がない。Lighthouse CIも desktop preset のみで**モバイル計測がなく**、性能系assertionは全てwarn（REQ-306）
- 地図のパン/ズームごとに**可視マーカー全件が cluster から remove→add される**（`getBounds()` が毎回新しい参照を返す→position配列が毎回新規→react-leafletの参照比較→leafletのmove発火→markerclusterのdistance grid再構築、という5段の連鎖をnode_modules実装まで追って裏取り）。表示範囲フィルタON時は最大2000マーカー分（REQ-307）
- zod 16.5 kB が Header→DrawerMenu→useProfile 経由で全ルートに混入。`useSurveyRequests` には「homeにzodを混入させない」と明記され動的importしているのに、**別経路で静的に入っており明文化された方針と矛盾**（REQ-305）
- ホームが `fetchMore` を配線しておらず、既定状態の地図・ギャラリーが**最新50件で打ち止め**（機能的欠落）。無限スクロールを持つ唯一の消費者はdead code（REQ-308）
- クリーン確認: three.jsの隔離は完全（cacheGroupで構造的に禁止）、Leaflet JSの遅延化は徹底、MapViewの描画最適化（memo・カリング・アイコンLRU・Popupは開くまでDOM化されない）、lucide-react/date-fnsのimport方法、モーダル16ファイルのdynamic化、データフェッチの並列化（N+1解消済み）、AbortController、next/imageの使い方（priority誤用なし）、フォント、web-vitals→GA4配線、REQ-278の修正維持

### バックエンド・インフラ・PWA（20件: High 4 / Medium 9 / Low 7）

- **PWA manifest のリンク先が404**。`layout.tsx:51` が `/manifest.json` を指すが実体は `/manifest.webmanifest`。A2HS・standalone・shortcuts・maskable icon が全て無効で `manifest.ts` の内容は誰にも読まれない。**修正は1行**だが、屋外で現地投稿するアプリのインストール導線が丸ごと死んでいる（REQ-293）
- SWのオフライン判定が `error.message` の文字列一致で、**WebKit（iOS Safari）の 'Load failed' にどれも一致しない**ためprecache済みoffline.htmlが出ない。iPhoneが主要ターゲットなのに主要プラットフォームだけ不発（REQ-293）
- `_shared/` の変更が**Edge Function未デプロイ検知から構造的に漏れる**（awkが明示除外）。REQ-287で service-role 生成を `_shared` に集約したため、今後の鍵差し替えはまさに `_shared` 単独変更＝CI緑のまま本番12関数が旧バンドルで動く（REQ-298）
- migration乖離検知が**バージョン番号の集合しか見ず**、「適用済みファイルを後から書き換えた」型のドリフトを永久に検知できない（ci.yml自身がその実在パターンを実測記録している）（REQ-298）
- CIの一括GRANTが関数EXECUTEのREVOKEを打ち消し、**pgTAPに権限assertionが0件**のため、CIは本番と逆の権限状態で全テストを通している（REQ-298）
- SWキャッシュ名がコミットSHAのため、**文言1文字のデプロイでも全ユーザーのキャッシュが空になる**（コンテンツハッシュ名の静的アセットとimmutable画像を同じキャッシュに入れている）。加えて開いているタブがデプロイ毎に強制リロードされ、投稿フォーム記入中なら入力が飛ぶ（REQ-293）
- Edge Function 14本に**Sentry連携が0件**で、`webhook_secret_unset_passthrough`（無認証通過）の検知手段がログ目視のみ（REQ-309）
- クリーン確認: REQ-287の一貫性（service-role直呼び0件）、REQ-285のディレクトリ実態からの自動導出、7/17以降migrationの冪等性、メール送信ドメインの整合、Gemini呼び出しの耐障害設計（タイムアウト・限定リトライ・デッドライン・allSettled分離）、PRチェックの網羅（14種）、Actions SHAピン統一、fork PR対策、バックアップの暗号化ガード、Sentry 3ランタイムの設定品質、web-vitals配線、セキュリティヘッダ、生成物のコミット防止、REQ-267の初回リロード回避、ISR粒度
