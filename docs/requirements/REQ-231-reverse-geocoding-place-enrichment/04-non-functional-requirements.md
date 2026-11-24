### 非機能要件（該当する場合のみ）

- [ ] NFR-231-01（Nominatim 利用規約の厳守）: **(a) 全体で 1 リクエスト/秒を超えない**スロットリングをサーバー側で実装する（複数投稿の同時付与でも合算で超えないよう直列化/キュー化）。**(b) 識別可能な User-Agent（アプリ名＋連絡先）をサーバーから付与**する（ブラウザ fetch では UA を設定できない＝現状の問題 1 を解消）。**(c) 結果をキャッシュ**（FR-231-04 の DB 永続キャッシュ）。**(d) bulk/systematic な一括処理を Nominatim 公開サーバで行わない**（既存投稿の一括バックフィルが必要なら、低速スロットリング＋キャッシュ＋必要に応じセルフホスト/OpenCage/Geoapify を使う）。これらは Nominatim Usage Policy に準拠する。

- [ ] NFR-231-02（コスト・暴走防止：REQ-218 と整合）: 外部地名 API 呼び出しに、(a) **1 リクエストあたりのタイムアウト**（例 5s、`useReverseGeocode.ts:38` の `AbortSignal.timeout(5000)` を踏襲）、(b) **リトライ上限と指数バックオフ＋ジッタ**（無限リトライ禁止、REQ-218 FR-218-01 の方針に整合）、(c) **kill switch**（env で逆ジオ付与を即停止できるフラグ、REQ-218 FR-218-03 の `AI_ANALYSIS_ENABLED` に倣う。停止中は列 NULL のまま投稿成立）、(d) **OpenCage/Geoapify の従量課金の予算/異常検知**（REQ-218 の予算アラート運用に組み込む）を備える。「予算アラートはハード上限ではない」前提（REQ-218）に従い、暴走時はフラグで止められること。

- [ ] NFR-231-03（入口レート制限：REQ-212 と整合）: 逆ジオ付与を**クライアントから直接トリガできる経路**（もし設ける場合）は、REQ-212 の bot/頻度制限の対象に含める。基本は**投稿成立後のサーバー起点**（FR-231-03）とし、外部 API への露出面を増やさない。匿名利用者が任意座標で外部 API を無制限に叩けるエンドポイントを作らない。

- [ ] NFR-231-04（フェイルセーフ・非破壊）: 付与は**投稿成立を阻害しない**（付与失敗/タイムアウト/kill switch でも投稿は保存、列は NULL）。既存の市区町村取得（`useReverseGeocode.ts`）・オフライン投稿（`usePostForm.ts:380-419` の `addPendingPost`、`municipality` のみ保持）・既存 E2E を壊さない。全列 NULL 許容で、未付与の既存行が表示・集計（`get_municipality_post_counts` 等 `schema.sql:887-900`）を壊さないこと。

- [ ] NFR-231-05（秘密値の非露出）: `OPENCAGE_API_KEY`/`GEOAPIFY_API_KEY` 等の apiKey、連絡先メールは**実値をコード/ドキュメント/コミット/ログに残さない**（変数名のみ）。`.env.example` に変数名と用途、「Nominatim は無料だが規約順守必須／高頻度は OpenCage・Geoapify（プロジェクト単位課金）」の注記を追加する。

- [ ] NFR-231-06（プライバシー・座標粒度）: 付与・キャッシュに使う座標は、**研究上の精度要件（REQ-172 の位置精度）と投稿者プライバシーのバランス**を考慮する。DB 永続キャッシュのグリッド粒度は、過度に細かい個人特定可能な座標を外部 API/キャッシュに残さない方針で決める（既存 100m 粒度＝`geocodeCache.ts:12` を下限の参考に）。外部 API へ送る座標は最小限とし、`reporter_ip`（REQ-179 で列保護）等の PII と紐付けてログに出さない。

- [ ] NFR-231-07（冪等・ドリフト防止）: 追加 SQL は冪等（`ADD COLUMN IF NOT EXISTS` 等）で、`schema.sql` と migration の定義を一致させる（過去 migration は改変せず新規連番。直近例 `supabase/migrations/20260603000006_*.sql` 系番に続ける）。`npm run schema:check`（schema/型同期）が green。

- [ ] NFR-231-08（型・テスト）: Edge Function（Deno）/ TypeScript の型・テストが通ること。付与関数の (a) Nominatim 応答パース（字/水系抽出）、(b) スロットリング/タイムアウト/リトライ打ち切り、(c) フォールバック切替、(d) キャッシュヒット時の外部非コール、(e) kill switch 時の skip、を既存テスト様式（`supabase/functions/_shared/__tests__/`・`src/hooks/__tests__/useReverseGeocode.test.js`）に合わせて単体テストする。
