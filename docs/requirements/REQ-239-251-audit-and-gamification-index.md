# REQ-239〜251 インデックス（監査由来のセキュリティ/品質 ＋ ゲーミフィケーション要件）

作成: 2026-07-03 ／ 状態: **REQ-240〜251 実装完了・検証グリーン**（type-check / lint / i18n:check / test 598 / build / size / schema:check 全通過）。**REQ-239 のみ手動対応待ち**（本番キーの失効＋git 履歴除去はアカウント操作／force-push を伴うため人手。runbook: `docs/runbooks/secret-rotation-and-history-purge.md`）。git は未コミット（push/commit しない運用）。

## 実装状況（2026-07-03）
| REQ | 状態 | 主な成果物 |
|---|---|---|
| 239 | ⏳ 手動待ち | 失効＋履歴除去（人手）。作業ツリーはマスク済 |
| 242 | ✅ | 再解析 fail-closed（`if(!user) return 401`）。edge test 253 green |
| 240 | ✅ | `WEBHOOK_SECRET_ENFORCE` で fail-closed 化＋可観測 grace period |
| 243 | ✅ | `location_disclosure`＋`display_lat/lng` 生成列・生座標 REVOKE・管理者が種/記録単位で公開レベル管理・EXIF 除去 |
| 244 | ✅ | INSERT 列保護（geo 列 NULL 化・municipality 正規化）＋CSV 数式無害化 |
| 241 | ✅ | `detect_ai_anomalies` admin ゲート・`check_email_exists` 明示 GRANT・post-audio バケット migration |
| 246 | ✅ | Supabase `Database` 型を全テーブル/RPC 配線・約40キャスト撤去 |
| 247 | ✅ | usePostForm 純粋ロジック抽出＋テスト・`useAdminPosts` 化・デッドコード削除・settleAll |
| 245 | ✅ | パスワード下限8＋letters_digits・データセット全件ページング・admin `(protected)` サーバゲート・IPv6 マスク |
| 248 | ✅ | 貢献レベル/XP エンジン（`user_progress`・承認起点トリガー・品質連動・日次上限・backfill・`myTotal→承認` 是正） |
| 249 | ✅ | `FEATURE_UNLOCKS`＋`useUnlocks`・段階解放（中核貢献は非ゲート・fail-open） |
| 250 | ✅ | `user_collection`・種図鑑（文脈で埋まる）・水槽（CSS 2D 版）＋**本格3D**（procedural R3F・async 隔離 221KB・2D フォールバック）・外来種教育文言 |
| 251 | ✅ | 進捗サーフェス・品質/多様性クエスト（任意・無罰）・解放/レベルアップ演出・週次ダイジェスト連携 |

> 検証は各 REQ で `schema:check/type-check/lint/i18n:check/test/build/size` を実行。pgTAP（243/248/250）は実 Postgres+pgTAP コンテナで実行確認済み。i18n は 1123→**1224 キー×4**。テスト 333→**598**。3D は `/` の First Load JS を増やさない（build で実証）。

## 由来
- **セキュリティ/コード品質（REQ-239〜247）**: 並列監査エージェント（アプリ層セキュリティ／Supabase・DB／コード品質）で、実コードを file:line 根拠つきに精査。**既実装の REQ-210〜221 と重複しない、新規・残存の課題のみ**を要件化。
- **ゲーミフィケーション（REQ-248〜251）**: 「投稿するほど機能が段階解放」＋「3D ザリガニ等の所有・収集要素」の要望を、既存基盤（バッジ/ランキング/`achievement.ts`/マスコット/品質シグナル）の実測マップに基づいて設計。
- 全体を貫く原則: **アンチ Goodhart（検証済み＝承認投稿と品質を称え、量・いいねに流れない）／市民科学ファースト（中核貢献は非ゲート）／性能・a11y・4言語・ブランド声（禁止語「大学」「卒業研究」等）順守／特定外来生物の教育責任**。

## 採番メモ
`REQ-238` は既に **`src/lib/constants.ts:125,165` のコード内タグ**（種 value→定義の O(1) 逆引きマップのリファクタ）として使用済みで、要件書は存在しない。意味の衝突を避けるため新規要件書は **REQ-239** から開始した。

## セキュリティ／コード品質（深刻度順）

| REQ | 深刻度 | 概要 | 根拠（代表） |
|---|---|---|---|
| **239** | 🔴 Critical | 漏洩認証情報のローテーション＋git 履歴除去（Gemini キー・Supabase token が履歴に平文残存） | commit `cfc2b4f`、`docs/verification-2026-05-13.md:195-197` |
| **242** | 🟠 High | AI 再解析の認可バイパス（anon キーで他者投稿を再解析＝課金／承認済みを pending 降格＝検閲） | `analyze-image/index.ts:777-796,1174-1183` |
| **240** | 🟠 High | Edge Function webhook 認証の fail-open（`WEBHOOK_SECRET` 未設定で素通り・本番稼働中） | `_shared/webhookAuth.ts:31-42`、`verification-2026-05-13.md:25` |
| **243** | 🟡 Medium | 生 GPS 座標が anon に露出・データセット粗化をバイパス／定点・依頼テーブルの座標＋user_id 公開／編集写真の EXIF | `schema.sql:757-764,1588-1608,1929-1947`、`storage.ts:13-20` |
| **244** | 🟡 Medium | 研究データ完全性：CSV 数式インジェクション＋INSERT 列保護の穴（付与バイパス） | `zaridasu.csv/route.ts:154-159`、`schema.sql:952-989` |
| **241** | 🟡 Medium | `detect_ai_anomalies` の admin ゲート欠落／`check_email_exists` 列挙・GRANT ドリフト／post-audio バケット未 migration | `schema.sql:2647-2760,1053,1753` |
| **246** | 🟡 Med(重要 High) | Supabase `Database` 型未配線→約40の `as` キャスト（DB 境界で strict TS 無効化） | `client.ts:10`/`server.ts:7`/`anon.ts:25`、`DetailPage.tsx:121-125` |
| **247** | 🟡 Medium | 中核ロジック無テスト（`usePostForm` 536行・8/30フック）／admin 神コンポーネント／デッドコード | `usePostForm.ts`、`AdminPostsPage.tsx:38-57` |
| **245** | ⚪ Low | 小改善バンドル（パスワード下限・データセット1000行切れ・admin サーバゲート・IPv6 マスク・レート制限） | `config.toml:17,61`、`AdminReportsPage.tsx:21` |

> 監査で「健全」と確認した主な面（誤検知防止・再対応不要）: middleware の getUser fail-closed＋XFF 偽装対策／Supabase クライアントに service_role 不在・`NEXT_PUBLIC_*` は全て公開前提／JSON-LD `safeJsonLd` の `</script>` エスケープ／Leaflet ポップアップの React 自動エスケープ／auth コールバックにオープンリダイレクト無し／`set_user_admin_role` 権限昇格修正（`IS DISTINCT FROM`）／strict TS・集中定数・全階層エラーバウンダリ・memo 化 Context・dynamic import。

## ゲーミフィケーション（進行の依存順）

| REQ | 概要 | 役割 |
|---|---|---|
| **248** | 貢献レベル／XP エンジン（品質連動・DB 権威・アンチ Goodhart） | 進行の土台（承認遷移トリガーで XP、`user_progress`＋`get_user_progress`）。既存の myTotal 未検証カウント（`constants.ts:245`/`useStats.ts:120`）を是正 |
| **249** | 段階的機能解放（レベル連動アンロック） | `FEATURE_UNLOCKS` 宣言表。中核貢献は非ゲート／品質機能は早期／コスメ・収集は長期。ロックは「解放予告」で見せる |
| **250** | ザリガニ・コレクション/図鑑/水槽＋3D（所有・収集） | 種×info_type×市町村の図鑑＋個人水槽（所有＝DB 権威）。3D は**段階導入**（既存 2D SVG のCSSアニメ→分離した遅延 3D＋2Dフォールバック）。外来種の教育メッセージ必須 |
| **251** | 進捗可視化・クエスト・解放演出・通知 | `achievement.ts`＋CSSキーフレーム＋REQ-234/237 を流用。品質/多様性志向のクエスト、ダークパターン回避 |

## 推奨実装順
1. **REQ-239（Critical・失効→履歴除去）を最優先**。次いで **242 → 240**（High・認可/認証）。
2. Medium 群 **243 / 244 / 241**（座標プライバシー／データ完全性／DB 認可）。
3. コード品質 **246（型配線）→ 247（テスト/構造）**。246 は以後の schema 変更を安全にする土台。
4. Low **245** は随時。
5. ゲーミフィケーションは **248 → 249 → 250 → 251** の依存順。REQ-247 の `achievement.ts` テスト固めを 248 前に。
