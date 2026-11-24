## 課題 → REQ 対応表

| REQ | タイトル | 深刻度(最大) | 優先度 | 状態 |
|---|---|---|---|---|
| [REQ-290](REQ-290-credential-revocation-and-local-secret-containment.md) | 資格情報の失効とローカル秘密の封じ込め | High | **P0** | 起票 |
| [REQ-291](REQ-291-webhook-secret-production-enablement.md) | webhook認証チェーンの本番有効化と無認可経路の閉塞 | High | **P0** | 起票 |
| [REQ-292](REQ-292-authz-defects-in-anon-granted-rpc.md) | anon GRANT された RPC の認可欠陥修復 | High | **P0** | ✅ 実装済み（Auth Hook 有効化・本番GRANT実測・汚染調査は運用タスク） |
| [REQ-293](REQ-293-pwa-delivery-and-offline-reachability.md) | PWA配信基盤の修復とオフライン到達性の確保 | High | **P0** | ✅ 一部実装済み（FR-293-01〜06＋07の自動復帰＋08のmanifest配信E2E。未実装＝「送信を再開」ボタン（i18nキー要）／オフライン到達性E2E／Lighthouse manifest assertion） |
| [REQ-294](REQ-294-non-map-location-input.md) | 地図に依存しない位置入力手段の追加 | **Critical** | **P0** | ✅ 実装済み（緯度経度入力・現在地ボタン＋再試行・地図のEnter/Space確定・bbox判定統一。未実施＝FR-294-03 地名検索（提供元未決定）／AC-02 スクリーンリーダー実機完走） |
| [REQ-295](REQ-295-admin-review-operation-safety.md) | 管理画面の操作安全性とデータ整合 | High | **P0** | ✅ 実装済み（FR-295-01〜09。一括操作の成功/失敗別集計＋`.select('id')` による0行検知、DB削除→Storage削除への順序反転、審査キューの `fetchError`＋再試行、管理一覧4箇所へAbortController、`admin/error.tsx` の logError接続。未実施＝孤立Storageファイルの掃除方針（REQ-002と要整合）／AC-01の実ブラウザ目視） |
| [REQ-296](REQ-296-dependency-vulnerabilities-sharp-postcss.md) | 本番依存の既知脆弱性更新（sharp / PostCSS） | High | P1 | ✅ 実装済み（High 4→**0件**。next 15.5.22／brace-expansion 5.0.9／overridesで sharp 0.35.3・postcss 8.5.25。CI audit ゲートを hard-fail へ昇格。未実施＝AC-04 Vercelプレビュー実測／AC-06 deno.lock再生成／e2e） |
| [REQ-297](REQ-297-ci-static-check-coverage.md) | CI静的検査の適用範囲拡張（Edge型ゲート・scripts/e2e・カバレッジ） | High | P1 | ✅ **実装済み（2026-07-31）**（Edge Function 49本に `deno check` を追加し**既存TS2538を解消**／`tsconfig` の `scripts`・`tests/e2e` 除外を撤去し型エラー9件を修正／eslint を scripts・root config・e2e へ拡張／**カバレッジをCIで強制**（旧閾値65/50/50/70は実測未達の飾りだったので実測ベース60/47/51/63へ置換＝旧値はREQ-311で回収）／`.test.js` 6本を `.ts` 化（残0）／e2e artifact回収と `maxFailures` 5。**4ゲートすべて発火実証済み**。残＝AC-07のCI実物確認） |
| [REQ-298](REQ-298-deploy-and-schema-integrity-gates.md) | デプロイ・スキーマ整合ゲートの実効化 | High | P1 | 起票 |
| [REQ-299](REQ-299-machine-readable-error-classification.md) | エラー分類の機械可読化 | High | P1 | 起票 |
| [REQ-300](REQ-300-input-data-loss-prevention.md) | 入力データ喪失の防止（写真・音声・長文） | High | P1 | 起票 |
| [REQ-301](REQ-301-auth-flow-ux-hardening.md) | 認証フローのUX堅牢化 | High | P1 | 起票 |
| [REQ-302](REQ-302-a11y-foundation-labels-focus-dialogs.md) | アクセシビリティ基盤の修復 | High | P1 | ✅ 実装済み（FR-302-01〜10。jsx-a11y recommended **34ルールを error 化**（warn導入で32ファイル97警告を洗い出してから昇格）、ラベル19件、`useFocusTrap` のフォーカス復帰（`resetKey` と独立した別effectで初回のみ保存）、DrawerMenu の閉状態を `inert`＋300ms遅延アンマウントで除外、FilterBar/InstallBanner のダイアログ化、`aria-required` 矛盾の撤去。問題J（h1）は **REQ-315 が正本**のため意図的に未実装。⚠️ **eslint のファイル限定 off が5ブロック残置**＝後続a11y要件で回収） |
| [REQ-303](REQ-303-color-contrast-compliance.md) | カラーコントラストの適合 | High | P1 | 起票（⚠️ **2026-07-31 に実測が追加**：REQ-306 のモバイルLHCI導入で `/lp` の装飾テキスト2件が `color-contrast` **error** で顕在化＝比 2.49 と 1.12。現在は `/lp` のみ warn へ限定降格中で、**本REQで直したら error に戻す必要あり**） |
| [REQ-304](REQ-304-assistive-text-i18n-and-lang-attribute.md) | 支援技術向け文言のi18n化と言語属性の整合 | Medium | P1 | 起票 |
| [REQ-305](REQ-305-initial-bundle-reduction.md) | 初期バンドルの削減 | High | P1 | 起票 |
| [REQ-306](REQ-306-performance-budget-enforcement.md) | 性能予算の実効化 | High | P1 | ✅ **実装済み（2026-07-31）**（①バンドル予算＝`npm run size:routes` を `perf-budget` に配線し**監視カバー率 2.8%→100%**、`.size-limit.json` に `/dashboard`・`/ranking` 追加、**4ゲートすべて発火実証済み**。②LHCI＝`.lighthouserc.mobile.json` 新設で desktop/mobile の2回実行、**mobile TBT を実測（最大231ms）して 600ms で error 化・発火実証済み**。`/dashboard` は認証ガードで実質リダイレクトしか測れないため意図的に除外し size:routes 側でカバー。**モバイル計測で `/lp` の color-contrast 2件（→REQ-303）と OSMタイルの image-size-responsive 12件が新たに顕在化**＝URL単位で限定降格し記録）。残＝AC-05 のCI実行時間実測 |
| [REQ-307](REQ-307-map-rendering-and-rerender-optimization.md) | 地図描画と再レンダーの最適化 | High | P1 | 起票 |
| [REQ-308](REQ-308-list-pagination-and-virtualization.md) | 一覧取得のページングと仮想化 | Medium | P1 | 起票 |
| [REQ-309](REQ-309-edge-function-shared-consolidation-and-resilience.md) | Edge Function の共通化と外部呼び出しの堅牢化 | Medium | P1 | 起票 |
| [REQ-310](REQ-310-public-dataset-integrity.md) | 公開データセットの整合 | Medium | P1 | ✅ 実装済み（FR-310-01〜05。公開列を `DATASET_COLUMNS` 1 本に単一ソース化し SELECT/CSVヘッダ/CSV行/GeoJSON properties/説明表を全て導出、CSV位置対応テスト＋GeoJSONテスト新設、geo 0,0 を `seo.ts`・`useDetailSEO.ts` の2箇所で `Number.isFinite` ガード。**配布物の出力はリファクタ前と1バイト一致**をgoldenで固定。未実施＝`/dataset` の実ブラウザ目視） |
| [REQ-311](REQ-311-e2e-and-handler-test-coverage.md) | 主要フローのE2Eとハンドラテストの追加 | High | P1 | 起票 |
| [REQ-312](REQ-312-seo-metadata-coverage.md) | SEOメタデータの網羅 | High | P1 | ✅ **実装済み（2026-07-31）**（`buildPageMetadata` ヘルパー新設＋8ページ移行、twitter は **C-2 採用**、`/admin` 配下の一括noindex＋固定化テスト、`ABOUT_BREADCRUMB` による可視パンくずとJSON-LDの単一ソース化、契約テスト207行。**実HTMLで og:url がページ別に出ることを検証済み・関連53テストPASS**。⏸ **FR-312-07（hreflang / 多言語URL）のみ意思決定待ちで保留**） |
| [REQ-313](REQ-313-state-sync-reliability.md) | 状態同期の信頼性 | Medium | P2 | 起票 |
| [REQ-314](REQ-314-single-source-definitions-and-dead-code.md) | 定義の単一化とデッドコード整理 | Medium | P2 | 起票 |
| [REQ-315](REQ-315-minor-ux-and-ops-hygiene.md) | 小規模UX・運用衛生の一括対応 | Low | P2 | 起票 |
