> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B3）**: 進捗トラッカーとしての更新を終了。REQ の現況は `docs/requirements/` の各インデックス（REQ-239-251 / REQ-269-281 等）と各REQ文書の状態欄が正。

# REQ-176〜237 実装進捗トラッカー

実装対象: **REQ-176〜209**(LP・バグ・a11y・品質 34件) + **REQ-222〜237**(プロダクト改善 16件) = **50件**
対象外: REQ-210〜221(セキュリティ)
方式: 順次・グループ実装。各ウェーブ = ファイルが互いに素なREQを並列実行 → ウェーブ後にビルド確認。
制約: `translation.json`(4言語)/`schema.sql`/`HomeInteractive.tsx`/`globals.css`/`AuthModal.tsx`/`CommentSection.tsx`/`LandingPage.tsx`/`constants.ts`/`sitemap.ts`/`next.config.ts` を触るREQは同一ウェーブに1件まで。
ルール: git push/commit はしない(ユーザー指示)。各エージェントは担当ファイル以外を触らない。

ベースライン(実装前): type-check ✓ / i18n:check ✓ (865 keys) / schema:check ✓

## ✅ 完了サマリー (2026-06-15)
**対象50件すべて実装完了**(REQ-176〜209 の34件 + REQ-222〜237 の16件。セキュリティREQ-210〜221は対象外)。
最終チェックポイント全green: **type-check / lint(--max-warnings 0) / i18n:check(1093キー・ja/en/ko/zhパリティ) / schema:check / test(333 passed) / build**。
- DB migration 新規7本: `20260615000001`(reporter_ip 列REVOKE) / `000002`(survey_requests 列保護) / `000003`(KPI集計RPC) / `000004`(逆ジオ enrich-place+geo_cache) / `000005`(品質バッジ) / `000006`(ライフサイクル通知+pg_cron) / `000007`(web push subscriptions)。
- i18n: 865→**1093キー**(4言語)。新規Edge Function: enrich-place / notify-* / send-push / social-announce。新規ルート: /lp /species/[species] /area/[m]/[species] /dataset /u/unsubscribe /admin/kpi。
- **git: 未コミット**(ユーザー指示により push/commit なし)。
- 途中の i18n 巻き戻り事故(merge agentのgit誤操作)は .next チャンクから正確復元済み。
- 残・任意の小ポリッシュ: REQ-227 投稿詳細→種ピラー内部リンク / REQ-187 LP header/footerのbanner/contentinfo top-level化(layout再構成要)。
- 運用作業(コード外・runbook化済): DOI発行(230) / SPF・DKIM・DMARC(234前提=REQ-219) / GA4保持14ヶ月(233) / VAPID鍵生成(237) / Resend・Late等のSecrets投入。

## ウェーブ計画と状態

凡例: ⬜ 未着手 / 🟦 実行中 / ✅ 完了 / ⚠️ 要対応

| Wave | REQ | 概要 | 主要ファイル(競合面) | 状態 |
|---|---|---|---|---|
| 1 | 225 | ブランド資産(マスコット/ロゴ/favicon/ブランドメモ) | layout.tsx, manifest.ts, public/* | ✅ |
| 1 | 178 | useEmailResend SSRクラッシュ修正 | useEmailResend.ts | ✅ |
| 1 | 179 | reporter_ip 列保護(REVOKE) | schema.sql, migration, rls_posts | ✅ |
| 1 | 180 | CI品質ゲート | ci.yml, size-limit, lighthouse | ✅ |
| 1 | 196 | 管理ダイアログ semantics | DeletePostDialog, RejectDialog | ✅ |
| 1 | 198 | ソフト404→notFound() | post/[id]/page, request/[id]/page | ✅ |
| 1 | 177 | 旧静的sitemap/robots削除+opensearchドメイン | public/* 削除, opensearch.xml | ✅ |
| 2 | 224 | デザイントークン/色a11y(225のHEX受領) | globals.css, tailwind, themeClasses, formStyles, constants, MapView, providers, Toast | ✅ |
| 2 | 232 | GA4 trackEvent 基盤 | analytics.ts(new), lpAnalytics, home, auth, comment, detail, postform 他 | ✅ |
| 2 | 208 | survey_requests 列保護トリガ | schema.sql, migration, rls_survey_requests | ✅(plan修正済) |
| 3 | 183 | 共有UIエラーi18n(土台) | translation.json, errorHandler, 多数 | ✅(940キー・getErrorMessage→ErrorMessage型・テスト追従済) |
| 3 | 233 | 研究KPIダッシュボード(232後) | schema.sql, admin/kpi(new), AdminLayout, Privacy | ✅(migration000003+KPI RPC3本+/admin/kpi+runbook) |
| 3 | 186 | ISR anon クライアント復元 | anon.ts(new), sitemap, area, request/[id], lp/page | ✅(inline。sitemap/area/lp=静的ISR化、request/[id]はcookie除去でキャッシュ可) |
| 4 | 184 | 未翻訳4ページi18n(183後) | translation.json, AuthCallback, Ranking, Profile, Offline | ✅(1008キー・日付ロケール連動・recovery a11y・テスト追従) |
| 4 | 199 | SEOメタ小修正 | home/page, requests/page, sitemap, layout, manifest, next.config | ✅(inline。title二重解消/profile除外/+requests/apple-touch-icon PNG生成/manifest PNG/minimumCacheTTL) |
| 4 | 231 | 逆ジオコーディング地名付与 | schema.sql, area, MapView, functions(new) | ✅(migration000004+enrich-place EF+geo_cache。usePostList select補完済) |
| 5 | 188 | アイコンボタン a11y名 | translation.json, Auth/Detail/Survey/Profile/Report | ✅(閉じる/戻る/写真削除アイコンに aria-label+i18n。common.back新設) |
| 5 | 200 | Sentry可観測性強化(199後) | next.config, sentry configs, global-error(new) | ✅(inline。global-error+instrumentation-client移設+VERCEL_ENV+bundleSizeOptimizations。client.config削除) |
| 5 | 229 | Dataset構造化データ/学名 | constants, area, seo, useDetailSEO, About | ✅(学名+Wikidata/GBIF sameAs API裏取り+Dataset拡充+speciesAboutLd共通化) |
| 6 | 194 | EditProfileModal統一(193前) | translation.json, Dashboard, Profile, EditProfileModal(new) | ✅(modals/へ一本化+dialog semantics+死にコード削除+DeleteAccountModal。既存キー再利用) |
| 6 | 190 | 認証リフェッチ嵐抑止(191前) | AuthContext, useSurveyRequests | ✅(inline。isSameUser参照維持+ownerId依存。AC単体テストは要追加) |
| 6 | 230 | オープンデータ/DOI | sitemap, Terms, Privacy, dataset(new) | ✅(/dataset CSV/GeoJSON+座標3dp粗化+PII除外+CC BY4.0+DOI runbook) |
| 7 | 193 | 操作失敗フィードバック(194後) | translation.json, useLike, Survey, Dashboard, Comment, Detail | ✅(いいね/コメント削除/協力/プロフィール保存に成否トースト+インラインエラー。useLikeはboolean返却) |
| 7 | 191 | 地図/ホーム描画perf(190後) | HomeInteractive, FilterBar, MapView, MapSettings | ✅(memo/検索ローカルstate/bounds条件化/マーカーculling/context memo。検索~600ms注記) |
| 7 | 227 | 種ピラーページ(既存キー流用) | sitemap, seo, AreaClient, DetailClient, species(new) | ✅(inline。/species/american・bullfrog SSG+seo helper+sitemap+area→pillar。detail→pillarリンクのみ要追加) |
| 8 | 192 | フェッチエラー/空状態分離 | translation.json, useSurveyRequests, useProfile, views, Comment, ErrorAlert | ✅(各フックにerror/refetch+4状態分離+再試行。common.backToTop欠落も補填) |
| 8 | 206 | LP残作業/176仕上げ(225後) | LandingPage, public/lp, tests, og-image-lp | ✅(hero.webp+og-image-lp+LP単体14/E2E8) |
| 8 | 182 | LPサインアップ帰属 | HomeInteractive, AuthModal, AuthCallback | ✅(authFrom TTL30分+from=lp付与+OAuth経路捕捉+CV後消費) |
| 9 | 195 | エラーlive region(183後) | translation.json, ErrorAlert, Toast, Auth, Report, PostForm | ✅(ErrorAlert role=alert+AuthModal role=status+Toast常時マウント2リージョン) |
| 9 | 181 | LP OGP/Twitterメタ | lp/page.tsx(metadata) | ✅(inline) |
| 9 | 187 | main ランドマーク入れ子解消(176後) | LandingPage, AdminLayout, layout | ✅(inline・main重複解消。banner/contentinfo top-levelはREQ-204のLP a11yへ委譲) |
| 10 | 209 | コード品質クリーンアップ | translation.json, 多数(auth/comment/home/const/detail/providers) | ✅(rpcThrottle/旧test残骸削除+formInputCls/date-locale集約+デッドreducer除去+rAF cleanup) |
| 10 | 185 | オフラインキュー データ損失 | offlineStore, usePostForm, useOfflineQueue | ✅(IndexedDB v2で音声/survey_request_id/location_source退避+再送復元+孤立ロールバック。test9) |
| 10 | 202 | 地図マーカー キーボードa11y(案B) | MapView | ✅(inline・案B keyboard=false。代替経路=PhotoGallery) |
| 11 | 207 | UI一貫性(ダーク/確認/絵文字/タブ)(209後) | translation.json, Report, Comment, Survey, Auth | ✅(ReportダークM+削除インライン確認+ウシガエル🦞→🐸+AuthModalタブa11y) |
| 11 | 189 | 調査依頼フォーム a11y(案A) | SurveyRequestForm | ✅(案A・focus trap/Esc/role+aria+a11yテスト2) |
| 12 | 223 | フォームUX/マイクロコピー(207後) | translation.json, formStyles, PostForm, Auth, SurveyForm | ✅(16px入力(iOS zoom回避)+inputmode/enterkeyhint+CTA改訂+送信再入ガード) |
| 13 | 222 | ローディング/空/エラー3状態(192,207後) | translation.json, EmptyState(new), Skeleton, 多数views, Comment | ✅(EmptyState新設+skeleton化+空状態ポジティブCTA。gallery_empty配線修正済) |
| 14 | 226 | 達成感マイクロインタラクション(222,224後) | translation.json, useLike, Comment, Profile, Badge, globals.css | ✅(いいね/コメント楽観的UI+pop/入場/バッジ解放アニメ+進捗カウントアップ。reduced-motion尊重) |
| 15 | 228 | 種×地域 programmatic(227後) | translation.json, AreaClient, constants, sitemap, area/[m]/[s](new) | ✅(48 SSG+noindexしきい値+親子相互リンク+sitemap。新規キー0) |
| 16 | 235 | 品質連動ゲーミフィケーション | translation.json, schema.sql, Ranking, useProfile | ✅(品質バッジ4+check_and_grant拡張+get_user_quality RPC+品質タブ。migration000005) |
| 17 | 236 | SNS共有/自動投稿(232後) | translation.json, LikeShare, Detail, useLike, lpAnalytics | ✅(Web Share API+UTM+リンクコピー+share計測+social-announce EF(dry-run既定)) |
| 18 | 234 | ライフサイクル通知メール | translation.json, schema.sql, Profile, functions/mailer(new) | ✅(migration000006+mailer+notify3関数+unsubscribeルート+購読UI+List-Unsubscribe。219到達性は運用前提) |
| 19 | 237 | Web Push(234後) | translation.json, schema.sql, sw.js.tpl, providers, manifest | ✅(VAPID自前web-push+push_subscriptions+send-push EF+購読UI。migration000007。BufferSource修正済) |
| 20 | 197 | 保留投稿オンライン反応性 | translation.json, Pending, PostForm, providers, useOnlineStatus(new) | ✅(useOnlineStatus(useSyncExternalStore)+回線リアクティブ+復帰通知) |
| 21 | 201 | 地図エラーバウンダリ(200後) | translation.json, HomeInteractive, ErrorBoundary | ✅(MapView専用ErrorBoundary+MapErrorFallback+ErrorBoundary i18n) |
| 22 | 203 | ギャラリーpager inert | translation.json, HomeInteractive | ✅(React19 inert+44pxタッチ+i18n既存キー) |
| - | i18n復旧 | merge agentのgit誤操作で1008→811に巻戻った翻訳キーを.nextチャンクから正確復元(1017) | translation.json×4 | ✅ |
| 23 | 204 | LP a11y仕上げ(176,224後) | translation.json, LandingPage, globals.css | ✅(マーキー停止+IO画面外停止+label-in-name+skip link+コントラスト+reduced-motion) |
| 24 | 205 | LP堅牢性(204後) | translation.json, globals.css, LandingPage, lp/page | ✅(.lp-js-readyゲート+実績0件カード非表示+FAQ q7プライバシー改訂) |

注: REQ-176 は作業ツリーに実装済み。Wave 8/9/23/24(206/181/187/204/205)で検証・仕上げ。

## 確認事項(実装後にユーザーへ)
- DOI発行(230)・SPF/DKIM/DMARC(234前提のREQ-219は対象外)・GA4設定14ヶ月(233)等の**外部/運用作業**はコード化のみ、手順をrunbook化。
- 画像生成(225マスコット/206ヒーロー)はSVG/プレースホルダで作成、最終アートは差し替え前提。
